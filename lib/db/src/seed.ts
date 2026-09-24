import { and, eq } from "drizzle-orm";
import { db, pool } from "./index";
import { cartUnitsTable, cartsTable, campusSettingsTable } from "./schema";

const carts = [
  { name: "Carrinho A", code: "A", location: "Armário A · Bloco 1", totalDevices: 60 },
  { name: "Carrinho B", code: "B", location: "Armário B · Bloco 1", totalDevices: 58 },
  { name: "Carrinho C", code: "C", location: "Armário C · Bloco 2", totalDevices: 55 },
] as const;

for (const cart of carts) {
  const existing = await db.select().from(cartsTable).where(eq(cartsTable.code, cart.code)).limit(1);
  const [saved] = existing.length
    ? existing
    : await db.insert(cartsTable).values(cart).returning();
  if (!saved) continue;

  const existingUnits = await db
    .select({ id: cartUnitsTable.id })
    .from(cartUnitsTable)
    .where(eq(cartUnitsTable.cartId, saved.id))
    .limit(1);
  if (!existingUnits.length) {
    await db.insert(cartUnitsTable).values(
      Array.from({ length: saved.totalDevices }, (_, index) => ({
        cartId: saved.id,
        assetTag: `${saved.code}${index + 1}`,
      })),
    );
  }
}

const settings = [
  ["campusName", "Colégio Vila Nova"],
  ["agendaLabel", "Agenda"],
  ["reservationsEnabled", "true"],
  ["reservationLimit", "10"],
  ["lockTime", "07:00"],
] as const;

for (const [key, value] of settings) {
  await db.insert(campusSettingsTable).values({ key, value })
    .onConflictDoUpdate({ target: campusSettingsTable.key, set: { value } });
}

await pool.end();
