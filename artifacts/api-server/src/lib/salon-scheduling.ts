import { and, eq, ne, sql } from "drizzle-orm";
import {
  appointmentsTable,
  db,
  servicesTable,
  salonTeamTable,
  stylistsTable,
  timeBlocksTable,
} from "@workspace/db";
import type { WorkHour } from "@workspace/db";

export class SlotUnavailableError extends Error {
  constructor(message = "Ese horario ya no está disponible.") {
    super(message);
    this.name = "SlotUnavailableError";
  }
}

export type BookingInput = {
  clientName: string;
  phone: string;
  serviceId: number;
  stylistId: number;
  date: string;
  startTime: string;
  source: "online" | "whatsapp" | "phone" | "walkin";
};

const minutesFromTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const timeFromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const localToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(
    new Date(),
  );

const weekdayFor = (date: string) =>
  new Date(`${date}T12:00:00.000Z`).getUTCDay();

function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) {
  return startA < endB && endA > startB;
}

function shiftForDate(workHours: WorkHour[], date: string) {
  return workHours.find((hours) => hours.weekday === weekdayFor(date));
}

export async function getAvailableSlots(
  date: string,
  serviceId: number,
  stylistId: number,
) {
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.active, true)));
  const [stylist] = await db
    .select()
    .from(stylistsTable)
    .where(and(eq(stylistsTable.id, stylistId), eq(stylistsTable.active, true)));

  if (!service || !stylist || date < localToday()) {
    return { date, serviceId, stylistId, slots: [] };
  }

  const shift = shiftForDate(stylist.workHours, date);
  if (!shift) return { date, serviceId, stylistId, slots: [] };

  const appointments = await db
    .select({
      startTime: appointmentsTable.startTime,
      endTime: appointmentsTable.endTime,
    })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.date, date),
        eq(appointmentsTable.stylistId, stylistId),
        ne(appointmentsTable.status, "cancelled"),
      ),
    );
  const blocks = await db
    .select({
      startTime: timeBlocksTable.startTime,
      endTime: timeBlocksTable.endTime,
    })
    .from(timeBlocksTable)
    .where(
      and(eq(timeBlocksTable.date, date), eq(timeBlocksTable.stylistId, stylistId)),
    );

  const startOfShift = minutesFromTime(shift.start);
  const endOfShift = minutesFromTime(shift.end);
  const now = new Date();
  const currentLocalMinutes =
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/La_Paz",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(now),
    ) *
      60 +
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/La_Paz",
        minute: "2-digit",
      }).format(now),
    );

  const slots: Array<{ startTime: string; endTime: string }> = [];
  for (
    let start = startOfShift;
    start + service.durationMinutes <= endOfShift;
    start += 15
  ) {
    const startTime = timeFromMinutes(start);
    const endTime = timeFromMinutes(start + service.durationMinutes);
    if (
      date === localToday() &&
      start <= currentLocalMinutes
    ) {
      continue;
    }
    const appointmentConflict = appointments.some((appointment) =>
      overlaps(startTime, endTime, appointment.startTime, appointment.endTime),
    );
    const blockConflict = blocks.some((block) =>
      overlaps(startTime, endTime, block.startTime, block.endTime),
    );
    if (!appointmentConflict && !blockConflict) {
      slots.push({ startTime, endTime });
    }
  }

  return { date, serviceId, stylistId, slots };
}

export async function createAppointment(input: BookingInput) {
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, input.serviceId), eq(servicesTable.active, true)));
  const [stylist] = await db
    .select()
    .from(stylistsTable)
    .where(and(eq(stylistsTable.id, input.stylistId), eq(stylistsTable.active, true)));

  if (!service || !stylist || input.date < localToday()) {
    throw new SlotUnavailableError();
  }

  const shift = shiftForDate(stylist.workHours, input.date);
  const startMinutes = minutesFromTime(input.startTime);
  const endTime = timeFromMinutes(startMinutes + service.durationMinutes);
  if (
    !shift ||
    startMinutes % 15 !== 0 ||
    input.startTime < shift.start ||
    endTime > shift.end ||
    (input.date === localToday() && startMinutes <= getLocalMinutes())
  ) {
    throw new SlotUnavailableError();
  }

  const lockKey = `${input.stylistId}:${input.date}`;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`,
    );
    const appointments = await tx
      .select({
        startTime: appointmentsTable.startTime,
        endTime: appointmentsTable.endTime,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.date, input.date),
          eq(appointmentsTable.stylistId, input.stylistId),
          ne(appointmentsTable.status, "cancelled"),
        ),
      );
    const blocks = await tx
      .select({
        startTime: timeBlocksTable.startTime,
        endTime: timeBlocksTable.endTime,
      })
      .from(timeBlocksTable)
      .where(
        and(
          eq(timeBlocksTable.date, input.date),
          eq(timeBlocksTable.stylistId, input.stylistId),
        ),
      );
    if (
      appointments.some((appointment) =>
        overlaps(input.startTime, endTime, appointment.startTime, appointment.endTime),
      ) ||
      blocks.some((block) =>
        overlaps(input.startTime, endTime, block.startTime, block.endTime),
      )
    ) {
      throw new SlotUnavailableError();
    }

    const [created] = await tx
      .insert(appointmentsTable)
      .values({
        clientName: input.clientName.trim(),
        phone: input.phone.trim(),
        serviceId: input.serviceId,
        stylistId: input.stylistId,
        date: input.date,
        startTime: input.startTime,
        endTime,
        source: input.source,
        status: "pending",
      })
      .returning();

    return {
      ...created,
      serviceName: service.name,
      stylistName: stylist.name,
    };
  });
}

function getLocalMinutes() {
  const now = new Date();
  const hours = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/La_Paz",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  const minutes = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/La_Paz",
      minute: "2-digit",
    }).format(now),
  );
  return hours * 60 + minutes;
}
