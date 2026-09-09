import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const cartsTable = pgTable("chromebook_carts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  assetTag: text("asset_tag").notNull(),
  totalDevices: integer("total_devices").notNull().default(30),
  status: text("status").notNull().default("ready"),
  wifiPointId: integer("wifi_point_id"),
  location: text("location").notNull().default("Central de tecnologia"),
  batteryPercent: integer("battery_percent").notNull().default(100),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accessPointsTable = pgTable("wifi_access_points", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  room: text("room").notNull(),
  status: text("status").notNull().default("online"),
  signal: integer("signal").notNull().default(90),
  cartId: integer("cart_id"),
  lastUpdated: timestamp("last_updated", { withTimezone: true })
    .notNull()
    .defaultNow(),
  notes: text("notes"),
});

export const reservationsTable = pgTable(
  "chromebook_reservations",
  {
    id: serial("id").primaryKey(),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    period: text("period").notNull(),
    time: text("time").notNull(),
    cartId: integer("cart_id").notNull(),
    level: text("level").notNull(),
    className: text("class_name").notNull(),
    teacherName: text("teacher_name").notNull(),
    room: text("room"),
    notes: text("notes"),
    status: text("status").notNull().default("reserved"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slotCartUnique: uniqueIndex("reservation_slot_cart_unique").on(
      table.scheduledDate,
      table.period,
      table.cartId,
    ),
  }),
);

export const dayLocksTable = pgTable(
  "chromebook_day_locks",
  {
    scheduledDate: date("scheduled_date", { mode: "string" }).primaryKey(),
    locked: text("locked").notNull().default("false"),
    lockTime: text("lock_time").notNull().default("07:00"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by").notNull().default("Coordenação"),
  },
);

export const activityTable = pgTable("chromebook_activity", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Cart = typeof cartsTable.$inferSelect;
export type AccessPoint = typeof accessPointsTable.$inferSelect;
export type Reservation = typeof reservationsTable.$inferSelect;
export type DayLock = typeof dayLocksTable.$inferSelect;
export type Activity = typeof activityTable.$inferSelect;