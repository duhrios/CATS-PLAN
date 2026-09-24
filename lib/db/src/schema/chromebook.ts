import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("campus_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("campus_users_email_unique").on(table.email),
}));

export const cartsTable = pgTable("chromebook_carts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  location: text("location").notNull().default("Central de tecnologia"),
  status: text("status").notNull().default("Pronto"),
  unavailable: boolean("unavailable").notNull().default(false),
  totalDevices: integer("total_devices").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  codeUnique: uniqueIndex("chromebook_carts_code_unique").on(table.code),
}));

export const cartUnitsTable = pgTable("chromebook_cart_units", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull().references(() => cartsTable.id, { onDelete: "cascade" }),
  assetTag: text("asset_tag").notNull(),
  unavailable: boolean("unavailable").notNull().default(false),
  reserved: boolean("reserved").notNull().default(false),
}, (table) => ({
  assetTagUnique: uniqueIndex("chromebook_cart_units_asset_tag_unique").on(table.assetTag),
}));

export const wifiPointsTable = pgTable("wifi_points", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  point: text("point").notNull(),
  type: text("type").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("Disponível"),
  assignedRoom: text("assigned_room"),
  observations: text("observations"),
});

export const cartSchedulesTable = pgTable("cart_schedule_slots", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull().references(() => cartsTable.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  label: text("label"),
});

export const reservationsTable = pgTable("cart_reservations", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").references(() => usersTable.id),
  teacherName: text("teacher_name").notNull(),
  segment: text("segment").notNull(),
  subject: text("subject").notNull(),
  className: text("class_name").notNull(),
  room: text("room").notNull(),
  period: text("period").notNull(),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  cartId: integer("cart_id").notNull().references(() => cartsTable.id),
  kind: text("kind").notNull().default("Aula"),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("Aguardando"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  reservationSlotIndex: uniqueIndex("cart_reservation_slot_unique").on(
    table.scheduledDate,
    table.cartId,
    table.startTime,
    table.endTime,
  ),
}));

export const reservationUnitsTable = pgTable("cart_reservation_units", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => reservationsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => cartUnitsTable.id),
}, (table) => ({
  reservationUnitUnique: uniqueIndex("cart_reservation_unit_unique").on(table.reservationId, table.unitId),
}));

export const movementsTable = pgTable("cart_movements", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull().references(() => reservationsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("Não movido"),
  actor: text("actor"),
  notReceived: boolean("not_received").notNull().default(false),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dayLocksTable = pgTable("cart_day_locks", {
  scheduledDate: date("scheduled_date", { mode: "string" }).primaryKey(),
  locked: boolean("locked").notNull().default(false),
  lockTime: time("lock_time").notNull().default("07:00"),
  updatedBy: text("updated_by").notNull().default("Administrador"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campusSettingsTable = pgTable("campus_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityTable = pgTable("campus_activity", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type Cart = typeof cartsTable.$inferSelect;
export type CartUnit = typeof cartUnitsTable.$inferSelect;
export type WifiPoint = typeof wifiPointsTable.$inferSelect;
export type CartScheduleSlot = typeof cartSchedulesTable.$inferSelect;
export type Reservation = typeof reservationsTable.$inferSelect;
export type Movement = typeof movementsTable.$inferSelect;
export type DayLock = typeof dayLocksTable.$inferSelect;
export type Activity = typeof activityTable.$inferSelect;
