import { and, eq, lt, gt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cartsTable, reservationsTable } from "@workspace/db/schema";

const router: IRouter = Router();

const requiredText = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} é obrigatório.`);
  }
  return value.trim();
};

router.get("/reservations", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const rows = await db
    .select({
      id: reservationsTable.id,
      teacherName: reservationsTable.teacherName,
      segment: reservationsTable.segment,
      subject: reservationsTable.subject,
      className: reservationsTable.className,
      room: reservationsTable.room,
      period: reservationsTable.period,
      scheduledDate: reservationsTable.scheduledDate,
      startTime: reservationsTable.startTime,
      endTime: reservationsTable.endTime,
      cartId: reservationsTable.cartId,
      cartName: cartsTable.name,
      kind: reservationsTable.kind,
      quantity: reservationsTable.quantity,
      status: reservationsTable.status,
    })
    .from(reservationsTable)
    .innerJoin(cartsTable, eq(cartsTable.id, reservationsTable.cartId))
    .where(date ? eq(reservationsTable.scheduledDate, date) : undefined);
  return res.json(rows);
});

router.post("/reservations", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const scheduledDate = requiredText(body.scheduledDate, "Data");
    const startTime = requiredText(body.startTime, "Início");
    const endTime = requiredText(body.endTime, "Fim");
    const cartId = Number(body.cartId);
    if (!Number.isInteger(cartId)) throw new Error("Carrinho inválido.");
    if (startTime >= endTime) throw new Error("O horário inicial deve ser anterior ao final.");

    const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.id, cartId)).limit(1);
    if (!cart || cart.unavailable) return res.status(409).json({ error: "Carrinho indisponível." });

    const created = await db.transaction(async (tx) => {
      const conflicts = await tx
        .select({ id: reservationsTable.id })
        .from(reservationsTable)
        .where(and(
          eq(reservationsTable.scheduledDate, scheduledDate),
          eq(reservationsTable.cartId, cartId),
          lt(reservationsTable.startTime, endTime),
          gt(reservationsTable.endTime, startTime),
        ))
        .limit(1);
      if (conflicts.length) {
        throw new Error("Já existe um agendamento para este carrinho nesse intervalo.");
      }

      const [reservation] = await tx.insert(reservationsTable).values({
        teacherName: requiredText(body.teacherName, "Professor"),
        segment: requiredText(body.segment, "Segmento"),
        subject: requiredText(body.subject, "Disciplina"),
        className: requiredText(body.className, "Turma"),
        room: requiredText(body.room, "Sala"),
        period: requiredText(body.period, "Período"),
        scheduledDate,
        startTime,
        endTime,
        cartId,
        kind: typeof body.kind === "string" ? body.kind : "Aula",
        quantity: Number.isInteger(body.quantity) && Number(body.quantity) > 0 ? Number(body.quantity) : 1,
      }).returning();
      return reservation;
    });
    return res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar o agendamento.";
    return res.status(message.startsWith("Já existe") ? 409 : 400).json({ error: message });
  }
});

export default router;
