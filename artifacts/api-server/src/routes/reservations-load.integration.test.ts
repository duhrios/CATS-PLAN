import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const expectedBranchId = "br-still-dust-b65r7aqc";
const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const integrationDescribe = integrationEnabled ? describe : describe.skip;
const lifecycleCases = Array.from({ length: 1_000 }, (_, index) => index);

integrationDescribe("reservation API load and lifecycle integration", () => {
  let server: Server | undefined;
  let baseUrl = "";
  let sessionCookie = "";
  let cartId = 0;
  let database: typeof import("@workspace/db")["db"] | undefined;
  let pool: typeof import("@workspace/db")["pool"] | undefined;
  let reservationsTable: typeof import("@workspace/db/schema")["reservationsTable"] | undefined;
  let cartsTable: typeof import("@workspace/db/schema")["cartsTable"] | undefined;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_BRANCH_ID !== expectedBranchId) {
      throw new Error("Integration tests are restricted to the isolated testes-cats branch.");
    }
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_UNPOOLED) {
      throw new Error("Both pooled and direct test-branch database URLs are required.");
    }
    const hostname = new URL(process.env.DATABASE_URL_UNPOOLED).hostname;
    if (!hostname.includes("ep-little-shape-b6l07w5y") || hostname.includes("-pooler")) {
      throw new Error("Refusing to run load tests against an unexpected database endpoint.");
    }

    const [{ db, pool: databasePool }, schema, { default: app }] = await Promise.all([
      import("@workspace/db"),
      import("@workspace/db/schema"),
      import("../app"),
    ]);
    database = db;
    pool = databasePool;
    reservationsTable = schema.reservationsTable;
    cartsTable = schema.cartsTable;

    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not start the test API server.");
    baseUrl = `http://127.0.0.1:${address.port}/api`;

    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:4173" },
      body: JSON.stringify({
        role: "admin",
        username: process.env.TEST_ADMIN_USERNAME,
        password: process.env.TEST_ADMIN_PASSWORD,
      }),
    });
    expect(login.status).toBe(200);
    sessionCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (!sessionCookie) throw new Error("The API did not issue an administrator session cookie.");

    const [cart] = await database.insert(cartsTable)
      .values({
        name: "Carrinho de teste de carga",
        code: `LOAD${Date.now()}`,
        totalDevices: 30,
      })
      .returning({ id: cartsTable.id });
    if (!cart) throw new Error("Could not create an isolated load-test cart.");
    cartId = cart.id;
  }, 30_000);

  afterAll(async () => {
    if (database && cartId && reservationsTable && cartsTable) {
      const { eq } = await import("drizzle-orm");
      await database.delete(reservationsTable).where(eq(reservationsTable.cartId, cartId));
      await database.delete(cartsTable).where(eq(cartsTable.id, cartId));
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    await pool?.end();
  }, 30_000);

  it.each(lifecycleCases)(
    "creates, reads, updates and deletes reservation lifecycle %i",
    async (index) => {
      const weekdayOffset = Math.floor(index / 5) * 7 + index % 5;
      const date = new Date(Date.UTC(2027, 0, 4 + weekdayOffset)).toISOString().slice(0, 10);
      const reservation = {
        teacherName: "Professor Teste de Carga",
        segment: "Fundamental 1",
        subject: "Ciências",
        className: `Turma ${index + 1}`,
        room: "Sala de teste",
        period: "Manhã",
        scheduledDate: date,
        startTime: "08:00",
        endTime: "08:45",
        cartId,
        kind: "Aula",
        quantity: 20,
      };
      const headers = {
        "Content-Type": "application/json",
        Origin: "http://localhost:4173",
        Cookie: sessionCookie,
      };

      const created = await fetch(`${baseUrl}/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify(reservation),
      });
      expect(created.status).toBe(201);
      const createdReservation = await created.json() as { id: number };

      const listed = await fetch(`${baseUrl}/reservations?date=${date}`, {
        headers: { Cookie: sessionCookie },
      });
      const listedReservations = await listed.json() as Array<{ id: number }>;
      expect(listedReservations.some(({ id }) => id === createdReservation.id)).toBe(true);

      const updated = await fetch(`${baseUrl}/reservations/${createdReservation.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...reservation, room: `Sala atualizada ${index + 1}` }),
      });
      expect(updated.status).toBe(200);

      const deleted = await fetch(`${baseUrl}/reservations/${createdReservation.id}`, {
        method: "DELETE",
        headers,
      });
      expect(deleted.status).toBe(204);
    },
    30_000,
  );

  it.each(["2027-01-02", "2027-01-03", "2027-02-30"])(
    "rejects a weekend or invalid reservation date: %s",
    async (scheduledDate) => {
      const response = await fetch(`${baseUrl}/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:4173",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          teacherName: "Professor Teste",
          segment: "Fundamental 1",
          subject: "Ciências",
          className: "Turma de teste",
          room: "Sala de teste",
          period: "Manhã",
          scheduledDate,
          startTime: "08:00",
          endTime: "08:45",
          cartId,
          kind: "Aula",
          quantity: 20,
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json() as { error?: string };
      expect(body.error).toMatch(/data válida|segunda a sexta-feira/i);
    },
    30_000,
  );
});
