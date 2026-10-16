import { Router, type IRouter } from "express";
import {
  CreatePublicBookingBody,
  CreatePublicBookingResponse,
  GetAvailabilityQueryParams,
  GetAvailabilityResponse,
  ListServicesResponse,
  ListStylistsResponse,
} from "@workspace/api-zod";
import { db, servicesTable, stylistsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createAppointment,
  getAvailableSlots,
  SlotUnavailableError,
} from "../lib/salon-scheduling";

const router: IRouter = Router();

router.get("/catalog/services", async (req, res): Promise<void> => {
  try {
    const services = await db
      .select()
      .from(servicesTable)
      .where(eq(servicesTable.active, true))
      .orderBy(servicesTable.name);
    res.json(ListServicesResponse.parse(services));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list salon services");
    res.status(500).json({ error: "No se pudieron cargar los servicios." });
  }
});

router.get("/catalog/stylists", async (req, res): Promise<void> => {
  try {
    const stylists = await db
      .select()
      .from(stylistsTable)
      .where(eq(stylistsTable.active, true))
      .orderBy(stylistsTable.name);
    res.json(ListStylistsResponse.parse(stylists));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list salon stylists");
    res.status(500).json({ error: "No se pudo cargar el equipo." });
  }
});

router.get("/availability", async (req, res): Promise<void> => {
  const parsed = GetAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const availability = await getAvailableSlots(
      parsed.data.date,
      parsed.data.serviceId,
      parsed.data.stylistId,
    );
    res.json(GetAvailabilityResponse.parse(availability));
  } catch (error) {
    req.log.error({ err: error }, "Unable to calculate salon availability");
    res.status(500).json({ error: "No se pudo consultar la disponibilidad." });
  }
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreatePublicBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const appointment = await createAppointment({
      ...parsed.data,
      source: "online",
    });
    res.status(201).json(CreatePublicBookingResponse.parse(appointment));
  } catch (error) {
    if (error instanceof SlotUnavailableError) {
      res.status(409).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Unable to create public salon booking");
    res.status(500).json({ error: "No se pudo confirmar la reserva." });
  }
});

export default router;
