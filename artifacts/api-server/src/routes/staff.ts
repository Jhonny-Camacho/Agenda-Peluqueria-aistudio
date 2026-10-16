import { and, asc, eq, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  AddTeamMemberBody,
  AddTeamMemberResponse,
  CreateBlockBody,
  CreateBlockResponse,
  CreateInventoryItemBody,
  CreateInventoryItemResponse,
  CreateStaffBookingBody,
  CreateStaffBookingResponse,
  DeleteBlockParams,
  GetDashboardQueryParams,
  GetDashboardResponse,
  GetStaffSessionResponse,
  ListAppointmentsQueryParams,
  ListAppointmentsResponse,
  ListBlocksQueryParams,
  ListBlocksResponse,
  ListInventoryResponse,
  ListStaffStylistsResponse,
  ListTeamResponse,
  RemoveTeamMemberParams,
  RemoveTeamMemberResponse,
  UpdateAppointmentBody,
  UpdateAppointmentParams,
  UpdateAppointmentResponse,
  UpdateInventoryItemBody,
  UpdateInventoryItemParams,
  UpdateInventoryItemResponse,
  UpdateStylistScheduleBody,
  UpdateStylistScheduleParams,
  UpdateStylistScheduleResponse,
} from "@workspace/api-zod";
import {
  appointmentsTable,
  db,
  inventoryTable,
  salonTeamTable,
  servicesTable,
  stylistsTable,
  timeBlocksTable,
} from "@workspace/db";
import { requireSalonMember, requireSalonOwner } from "../middlewares/salonAccess";
import {
  createAppointment,
  SlotUnavailableError,
} from "../lib/salon-scheduling";

const router: IRouter = Router();
router.use("/staff", requireSalonMember);

function currentMember(res: Response) {
  return res.locals.salonMember as typeof salonTeamTable.$inferSelect;
}

function isDatabaseUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function getAppointments(date: string, stylistId?: number) {
  const conditions = [eq(appointmentsTable.date, date)];
  if (stylistId !== undefined) {
    conditions.push(eq(appointmentsTable.stylistId, stylistId));
  }
  return db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      phone: appointmentsTable.phone,
      serviceId: appointmentsTable.serviceId,
      serviceName: servicesTable.name,
      stylistId: appointmentsTable.stylistId,
      stylistName: stylistsTable.name,
      date: appointmentsTable.date,
      startTime: appointmentsTable.startTime,
      endTime: appointmentsTable.endTime,
      status: appointmentsTable.status,
      source: appointmentsTable.source,
      createdAt: appointmentsTable.createdAt,
    })
    .from(appointmentsTable)
    .innerJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .innerJoin(stylistsTable, eq(appointmentsTable.stylistId, stylistsTable.id))
    .where(and(...conditions))
    .orderBy(asc(appointmentsTable.startTime));
}

router.get("/staff/me", (_req, res): void => {
  res.json(GetStaffSessionResponse.parse(currentMember(res)));
});

router.get("/staff/dashboard", async (req, res): Promise<void> => {
  const parsed = GetDashboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const appointments = await getAppointments(parsed.data.date);
    res.json(
      GetDashboardResponse.parse({
        date: parsed.data.date,
        totalAppointments: appointments.length,
        pendingAppointments: appointments.filter((item) => item.status === "pending")
          .length,
        attendedAppointments: appointments.filter((item) => item.status === "attended")
          .length,
        cancelledAppointments: appointments.filter((item) => item.status === "cancelled")
          .length,
        newOnlineBookings: appointments.filter((item) => item.source === "online")
          .length,
        appointments,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to load salon dashboard");
    res.status(500).json({ error: "No se pudo cargar la agenda." });
  }
});

router.get("/staff/appointments", async (req, res): Promise<void> => {
  const parsed = ListAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const appointments = await getAppointments(
      parsed.data.date,
      parsed.data.stylistId,
    );
    res.json(ListAppointmentsResponse.parse(appointments));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list salon appointments");
    res.status(500).json({ error: "No se pudieron cargar las citas." });
  }
});

router.post("/staff/appointments", async (req, res): Promise<void> => {
  const parsed = CreateStaffBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const appointment = await createAppointment(parsed.data);
    res.status(201).json(CreateStaffBookingResponse.parse(appointment));
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      res.status(409).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Unable to add an in-person salon booking");
    res.status(500).json({ error: "No se pudo registrar la cita." });
  }
});

router.patch("/staff/appointments/:id", async (req, res): Promise<void> => {
  const params = UpdateAppointmentParams.safeParse(req.params);
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [appointment] = await db
      .update(appointmentsTable)
      .set({ status: parsed.data.status })
      .where(eq(appointmentsTable.id, params.data.id))
      .returning();
    if (!appointment) {
      res.status(404).json({ error: "No se encontró la cita." });
      return;
    }
    const [fullAppointment] = await getAppointmentsById(appointment.id);
    res.json(UpdateAppointmentResponse.parse(fullAppointment));
  } catch (error) {
    req.log.error({ err: error }, "Unable to update appointment status");
    res.status(500).json({ error: "No se pudo actualizar el estado." });
  }
});

async function getAppointmentsById(id: number) {
  return db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      phone: appointmentsTable.phone,
      serviceId: appointmentsTable.serviceId,
      serviceName: servicesTable.name,
      stylistId: appointmentsTable.stylistId,
      stylistName: stylistsTable.name,
      date: appointmentsTable.date,
      startTime: appointmentsTable.startTime,
      endTime: appointmentsTable.endTime,
      status: appointmentsTable.status,
      source: appointmentsTable.source,
      createdAt: appointmentsTable.createdAt,
    })
    .from(appointmentsTable)
    .innerJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .innerJoin(stylistsTable, eq(appointmentsTable.stylistId, stylistsTable.id))
    .where(eq(appointmentsTable.id, id));
}

router.get("/staff/blocks", async (req, res): Promise<void> => {
  const parsed = ListBlocksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const conditions = [eq(timeBlocksTable.date, parsed.data.date)];
    if (parsed.data.stylistId !== undefined) {
      conditions.push(eq(timeBlocksTable.stylistId, parsed.data.stylistId));
    }
    const blocks = await db
      .select({
        id: timeBlocksTable.id,
        stylistId: timeBlocksTable.stylistId,
        stylistName: stylistsTable.name,
        date: timeBlocksTable.date,
        startTime: timeBlocksTable.startTime,
        endTime: timeBlocksTable.endTime,
        reason: timeBlocksTable.reason,
      })
      .from(timeBlocksTable)
      .innerJoin(stylistsTable, eq(timeBlocksTable.stylistId, stylistsTable.id))
      .where(and(...conditions))
      .orderBy(asc(timeBlocksTable.startTime));
    res.json(ListBlocksResponse.parse(blocks));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list salon schedule blocks");
    res.status(500).json({ error: "No se pudieron cargar los bloqueos." });
  }
});

router.post(
  "/staff/blocks",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    const parsed = CreateBlockBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (parsed.data.startTime >= parsed.data.endTime) {
      res.status(400).json({ error: "La hora final debe ser posterior a la inicial." });
      return;
    }
    const lockKey = `${parsed.data.stylistId}:${parsed.data.date}`;
    try {
      const block = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`,
        );
        const appointments = await tx
          .select({ startTime: appointmentsTable.startTime, endTime: appointmentsTable.endTime })
          .from(appointmentsTable)
          .where(
            and(
              eq(appointmentsTable.date, parsed.data.date),
              eq(appointmentsTable.stylistId, parsed.data.stylistId),
              ne(appointmentsTable.status, "cancelled"),
            ),
          );
        const blocks = await tx
          .select({ startTime: timeBlocksTable.startTime, endTime: timeBlocksTable.endTime })
          .from(timeBlocksTable)
          .where(
            and(
              eq(timeBlocksTable.date, parsed.data.date),
              eq(timeBlocksTable.stylistId, parsed.data.stylistId),
            ),
          );
        const overlaps = (start: string, end: string) =>
          parsed.data.startTime < end && parsed.data.endTime > start;
        if (
          appointments.some((item) => overlaps(item.startTime, item.endTime)) ||
          blocks.some((item) => overlaps(item.startTime, item.endTime))
        ) {
          return null;
        }
        const [created] = await tx
          .insert(timeBlocksTable)
          .values({
            ...parsed.data,
            createdById: currentMember(res).id,
          })
          .returning();
        const [stylist] = await tx
          .select({ name: stylistsTable.name })
          .from(stylistsTable)
          .where(eq(stylistsTable.id, created.stylistId));
        return { ...created, stylistName: stylist?.name ?? "" };
      });
      if (!block) {
        res.status(409).json({ error: "El bloqueo se cruza con una cita o bloqueo existente." });
        return;
      }
      res.status(201).json(CreateBlockResponse.parse(block));
    } catch (error) {
      req.log.error({ err: error }, "Unable to create salon schedule block");
      res.status(500).json({ error: "No se pudo guardar el bloqueo." });
    }
  },
);

router.delete(
  "/staff/blocks/:id",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    const params = DeleteBlockParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    try {
      const [block] = await db
        .delete(timeBlocksTable)
        .where(eq(timeBlocksTable.id, params.data.id))
        .returning({ id: timeBlocksTable.id });
      if (!block) {
        res.status(404).json({ error: "No se encontró el bloqueo." });
        return;
      }
      res.sendStatus(204);
    } catch (error) {
      req.log.error({ err: error }, "Unable to delete salon schedule block");
      res.status(500).json({ error: "No se pudo retirar el bloqueo." });
    }
  },
);

router.get("/staff/inventory", async (req, res): Promise<void> => {
  try {
    const items = await db.select().from(inventoryTable).orderBy(inventoryTable.name);
    res.json(ListInventoryResponse.parse(items));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list salon inventory");
    res.status(500).json({ error: "No se pudo cargar el inventario." });
  }
});

router.post(
  "/staff/inventory",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    const parsed = CreateInventoryItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const [item] = await db.insert(inventoryTable).values(parsed.data).returning();
      res.status(201).json(CreateInventoryItemResponse.parse(item));
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        res.status(409).json({ error: "Ese código de producto ya existe." });
        return;
      }
      req.log.error({ err: error }, "Unable to add salon inventory item");
      res.status(500).json({ error: "No se pudo agregar el producto." });
    }
  },
);

router.patch(
  "/staff/inventory/:id",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    const params = UpdateInventoryItemParams.safeParse(req.params);
    const parsed = UpdateInventoryItemBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "Indica al menos un dato para actualizar." });
      return;
    }
    try {
      const [item] = await db
        .update(inventoryTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(inventoryTable.id, params.data.id))
        .returning();
      if (!item) {
        res.status(404).json({ error: "No se encontró el producto." });
        return;
      }
      res.json(UpdateInventoryItemResponse.parse(item));
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        res.status(409).json({ error: "Ese código de producto ya existe." });
        return;
      }
      req.log.error({ err: error }, "Unable to update salon inventory item");
      res.status(500).json({ error: "No se pudo actualizar el producto." });
    }
  },
);

router.get(
  "/staff/team",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    try {
      const members = await db.select().from(salonTeamTable).orderBy(salonTeamTable.name);
      res.json(ListTeamResponse.parse(members));
    } catch (error) {
      req.log.error({ err: error }, "Unable to list salon team");
      res.status(500).json({ error: "No se pudo cargar el equipo." });
    }
  },
);

router.post(
  "/staff/team",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    const parsed = AddTeamMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (parsed.data.role !== "operator") {
      res.status(400).json({ error: "Solo puedes agregar cuentas de operario." });
      return;
    }
    try {
      const [member] = await db
        .insert(salonTeamTable)
        .values({
          email: parsed.data.email.trim().toLowerCase(),
          name: parsed.data.name.trim(),
          role: "operator",
        })
        .returning();
      res.status(201).json(AddTeamMemberResponse.parse(member));
    } catch (error) {
      if (isDatabaseUniqueViolation(error)) {
        res.status(409).json({ error: "Ese correo ya pertenece al equipo." });
        return;
      }
      req.log.error({ err: error }, "Unable to add salon team member");
      res.status(500).json({ error: "No se pudo agregar a la persona." });
    }
  },
);

router.delete(
  "/staff/team/:id",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    const params = RemoveTeamMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    try {
      const [member] = await db
        .delete(salonTeamTable)
        .where(
          and(
            eq(salonTeamTable.id, params.data.id),
            eq(salonTeamTable.role, "operator"),
          ),
        )
        .returning({ id: salonTeamTable.id });
      if (!member) {
        res.status(404).json({ error: "No se encontró el operario." });
        return;
      }
      res.sendStatus(204);
    } catch (error) {
      req.log.error({ err: error }, "Unable to remove salon team member");
      res.status(500).json({ error: "No se pudo retirar al operario." });
    }
  },
);

router.get("/staff/stylists", async (req, res): Promise<void> => {
  try {
    const stylists = await db
      .select()
      .from(stylistsTable)
      .orderBy(stylistsTable.name);
    res.json(ListStaffStylistsResponse.parse(stylists));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list salon stylist schedules");
    res.status(500).json({ error: "No se pudieron cargar los horarios." });
  }
});

router.patch(
  "/staff/stylists/:id",
  requireSalonOwner,
  async (req, res): Promise<void> => {
    const params = UpdateStylistScheduleParams.safeParse(req.params);
    const parsed = UpdateStylistScheduleBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const weekdays = parsed.data.workHours.map((item) => item.weekday);
    if (
      new Set(weekdays).size !== weekdays.length ||
      parsed.data.workHours.some((item) => item.start >= item.end)
    ) {
      res.status(400).json({ error: "Revisa los días y horas de la jornada." });
      return;
    }
    try {
      const [stylist] = await db
        .update(stylistsTable)
        .set({ workHours: parsed.data.workHours })
        .where(eq(stylistsTable.id, params.data.id))
        .returning();
      if (!stylist) {
        res.status(404).json({ error: "No se encontró al peluquero." });
        return;
      }
      res.json(UpdateStylistScheduleResponse.parse(stylist));
    } catch (error) {
      req.log.error({ err: error }, "Unable to update stylist working hours");
      res.status(500).json({ error: "No se pudo guardar el horario." });
    }
  },
);

export default router;
