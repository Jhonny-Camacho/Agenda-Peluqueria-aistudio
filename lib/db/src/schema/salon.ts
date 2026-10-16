import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type WorkHour = {
  weekday: number;
  start: string;
  end: string;
};

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "pending",
  "attended",
  "cancelled",
]);

export const bookingSourceEnum = pgEnum("booking_source", [
  "online",
  "whatsapp",
  "phone",
  "walkin",
]);

export const teamRoleEnum = pgEnum("team_role", ["owner", "operator"]);

export const servicesTable = pgTable("salon_services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull(),
  price: integer("price").notNull(),
  active: boolean("active").notNull().default(true),
});

export const stylistsTable = pgTable("salon_stylists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull().default("Estilista"),
  active: boolean("active").notNull().default(true),
  workHours: jsonb("work_hours").$type<WorkHour[]>().notNull().default([]),
});

export const salonTeamTable = pgTable(
  "salon_team",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: teamRoleEnum("role").notNull(),
  },
  (table) => [uniqueIndex("salon_team_email_unique").on(table.email)],
);

export const appointmentsTable = pgTable("salon_appointments", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  phone: text("phone").notNull(),
  serviceId: integer("service_id")
    .notNull()
    .references(() => servicesTable.id),
  stylistId: integer("stylist_id")
    .notNull()
    .references(() => stylistsTable.id),
  date: date("appointment_date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: appointmentStatusEnum("status").notNull().default("pending"),
  source: bookingSourceEnum("source").notNull().default("online"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const timeBlocksTable = pgTable("salon_time_blocks", {
  id: serial("id").primaryKey(),
  stylistId: integer("stylist_id")
    .notNull()
    .references(() => stylistsTable.id),
  date: date("block_date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  reason: text("reason").notNull().default(""),
  createdById: integer("created_by_id").references(() => salonTeamTable.id),
});

export const inventoryTable = pgTable(
  "salon_inventory",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    stock: integer("stock").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(0),
    price: integer("price").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("salon_inventory_sku_unique").on(table.sku)],
);

export type Service = typeof servicesTable.$inferSelect;
export type Stylist = typeof stylistsTable.$inferSelect;
export type Appointment = typeof appointmentsTable.$inferSelect;
export type TimeBlock = typeof timeBlocksTable.$inferSelect;
export type InventoryItem = typeof inventoryTable.$inferSelect;
export type TeamMember = typeof salonTeamTable.$inferSelect;
