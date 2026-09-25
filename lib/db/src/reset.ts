import { db, pool } from "./index";
import {
  activityTable,
  cartSchedulesTable,
  cartUnitsTable,
  campusSettingsTable,
  cartsTable,
  dayLocksTable,
  movementsTable,
  reservationUnitsTable,
  reservationsTable,
  usersTable,
  wifiPointsTable,
} from "./schema";

await db.transaction(async (tx) => {
  await tx.delete(reservationUnitsTable);
  await tx.delete(movementsTable);
  await tx.delete(reservationsTable);
  await tx.delete(cartSchedulesTable);
  await tx.delete(cartUnitsTable);
  await tx.delete(cartsTable);
  await tx.delete(dayLocksTable);
  await tx.delete(wifiPointsTable);
  await tx.delete(activityTable);
  await tx.delete(campusSettingsTable);
  await tx.delete(usersTable);
  await tx.insert(usersTable).values({
    name: "Administrador",
    email: "admin@local",
    role: "admin",
    passwordHash: null,
    active: true,
  });

  const carts = await tx.insert(cartsTable).values([
    { name: "Carrinho A", code: "A", location: "Armário A · Bloco 1", totalDevices: 60 },
    { name: "Carrinho B", code: "B", location: "Armário B · Bloco 1", totalDevices: 58 },
    { name: "Carrinho C", code: "C", location: "Armário C · Bloco 2", totalDevices: 55 },
  ]).returning();

  for (const cart of carts) {
    await tx.insert(cartUnitsTable).values(
      Array.from({ length: cart.totalDevices }, (_, index) => ({
        cartId: cart.id,
        assetTag: `${cart.code}${index + 1}`,
        reserved: cart.code !== "A" && index >= cart.totalDevices - 10,
      })),
    );
  }

  const scheduleTemplates = [
    ["07:00", "07:45"], ["07:45", "08:30"], ["08:30", "09:15"],
    ["09:15", "10:20"], ["10:20", "11:05"], ["11:05", "11:50"],
    ["11:50", "12:45"], ["12:45", "13:30"], ["13:30", "14:15"],
    ["14:15", "15:00"], ["15:00", "16:05"], ["16:05", "16:50"],
    ["16:50", "17:35"],
  ] as const;
  for (const cart of carts) {
    await tx.insert(cartSchedulesTable).values(
      scheduleTemplates.map(([startTime, endTime], index) => ({
        cartId: cart.id,
        period: index < 7 ? "Manhã" : "Tarde",
        startTime,
        endTime,
      })),
    );
  }
});

const [users, carts, schedules, reservations, settings] = await Promise.all([
  db.select({ count: usersTable.id }).from(usersTable),
  db.select({ count: cartsTable.id }).from(cartsTable),
  db.select({ count: cartSchedulesTable.id }).from(cartSchedulesTable),
  db.select({ count: reservationsTable.id }).from(reservationsTable),
  db.select({ count: campusSettingsTable.key }).from(campusSettingsTable),
]);
console.log(JSON.stringify({
  users: users.length,
  carts: carts.length,
  schedules: schedules.length,
  reservations: reservations.length,
  settings: settings.length,
}));

await pool.end();
