import { eq, sql } from "drizzle-orm";
import {
  appointmentsTable,
  db,
  inventoryTable,
  salonTeamTable,
  servicesTable,
  stylistsTable,
} from "@workspace/db";

const workHours = [
  { weekday: 1, start: "09:00", end: "18:00" },
  { weekday: 2, start: "09:00", end: "18:00" },
  { weekday: 3, start: "09:00", end: "18:00" },
  { weekday: 4, start: "09:00", end: "18:00" },
  { weekday: 5, start: "09:00", end: "18:00" },
  { weekday: 6, start: "09:00", end: "15:00" },
];

const todayInLaPaz = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(
    new Date(),
  );

export async function seedSalonData(): Promise<void> {
  const ownerEmail =
    process.env.SALON_OWNER_EMAIL?.trim().toLowerCase() ||
    "jhonnycamachog1962@gmail.com";

  try {
    await db.transaction(async (tx) => {
      try {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('salon-bootstrap'))`);
      } catch {
        // Advisory locks may not be supported by in-memory/mock databases
      }

    const [owner] = await tx
      .insert(salonTeamTable)
      .values({ email: ownerEmail, name: "Dueño", role: "owner" })
      .onConflictDoUpdate({
        target: salonTeamTable.email,
        set: { role: "owner" },
      })
      .returning({ id: salonTeamTable.id });

    const [existingServices] = await tx
      .select({ id: servicesTable.id })
      .from(servicesTable)
      .limit(1);
    if (!existingServices) {
      await tx.insert(servicesTable).values([
        {
          name: "Corte clásico",
          description: "Corte y acabado a medida",
          durationMinutes: 30,
          price: 50,
        },
        {
          name: "Corte y lavado",
          description: "Lavado relajante y corte",
          durationMinutes: 45,
          price: 80,
        },
        {
          name: "Barba y perfilado",
          description: "Toalla caliente y perfilado",
          durationMinutes: 30,
          price: 35,
        },
        {
          name: "Coloración",
          description: "Color completo y cuidado final",
          durationMinutes: 120,
          price: 250,
        },
      ]);
    }

    const [existingStylists] = await tx
      .select({ id: stylistsTable.id })
      .from(stylistsTable)
      .limit(1);
    if (!existingStylists) {
      await tx.insert(stylistsTable).values([
        { name: "Valeria", title: "Especialista en cortes", workHours },
        { name: "Mateo", title: "Barbero y colorista", workHours },
      ]);
    }

    const [existingInventory] = await tx
      .select({ id: inventoryTable.id })
      .from(inventoryTable)
      .limit(1);
    if (!existingInventory) {
      await tx.insert(inventoryTable).values([
        {
          name: "Shampoo nutritivo",
          sku: "CAB-SHAM-500",
          stock: 14,
          minimumStock: 4,
          price: 75,
        },
        {
          name: "Cera de fijación mate",
          sku: "CAB-CERA-100",
          stock: 8,
          minimumStock: 3,
          price: 55,
        },
        {
          name: "Aceite para barba",
          sku: "BAR-ACE-030",
          stock: 3,
          minimumStock: 5,
          price: 65,
        },
      ]);
    }

    const [existingAppointments] = await tx
      .select({ id: appointmentsTable.id })
      .from(appointmentsTable)
      .limit(1);
    if (!existingAppointments) {
      const [classic] = await tx
        .select({ id: servicesTable.id })
        .from(servicesTable)
        .where(eq(servicesTable.name, "Corte clásico"));
      const [barba] = await tx
        .select({ id: servicesTable.id })
        .from(servicesTable)
        .where(eq(servicesTable.name, "Barba y perfilado"));
      const [valeria] = await tx
        .select({ id: stylistsTable.id })
        .from(stylistsTable)
        .where(eq(stylistsTable.name, "Valeria"));
      const [mateo] = await tx
        .select({ id: stylistsTable.id })
        .from(stylistsTable)
        .where(eq(stylistsTable.name, "Mateo"));
      const today = todayInLaPaz();
      const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
      if (classic && barba && valeria && mateo && weekday !== 0) {
        await tx.insert(appointmentsTable).values([
          {
            clientName: "Sofía Rojas",
            phone: "70000001",
            serviceId: classic.id,
            stylistId: valeria.id,
            date: today,
            startTime: "10:00",
            endTime: "10:30",
            status: "pending",
            source: "online",
          },
          {
            clientName: "Daniel Vargas",
            phone: "70000002",
            serviceId: barba.id,
            stylistId: mateo.id,
            date: today,
            startTime: "11:00",
            endTime: "11:30",
            status: "attended",
            source: "whatsapp",
          },
          {
            clientName: "Camila Flores",
            phone: "70000003",
            serviceId: classic.id,
            stylistId: valeria.id,
            date: today,
            startTime: "12:00",
            endTime: "12:30",
            status: "pending",
            source: "phone",
          },
        ]);
      }
    }

      if (!owner) {
        throw new Error("Unable to initialize the salon owner.");
      }
    });
  } catch (err) {
    console.warn("[seedSalonData] Database seeding skipped or partial:", err);
  }
}
