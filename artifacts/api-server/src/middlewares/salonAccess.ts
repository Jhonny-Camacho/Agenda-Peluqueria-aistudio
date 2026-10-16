import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db, salonTeamTable } from "@workspace/db";

export const requireSalonMember: RequestHandler = async (req, res, next) => {
  if (!process.env.CLERK_SECRET_KEY) {
    const [owner] = await db
      .select()
      .from(salonTeamTable)
      .where(eq(salonTeamTable.role, "owner"));
    res.locals.salonMember = owner || {
      id: 1,
      name: "Dueño",
      email: (process.env.SALON_OWNER_EMAIL || "jhonnycamachog1962@gmail.com").trim().toLowerCase(),
      role: "owner",
    };
    return next();
  }

  let userId: string | null | undefined;
  try {
    const auth = getAuth(req);
    userId = auth?.userId;
  } catch {
    userId = (req as any).auth?.userId ?? null;
  }
  if (!userId) {
    res.status(401).json({ error: "Inicia sesión para continuar." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId,
    );
    if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
      res.status(403).json({ error: "Verifica el correo de tu cuenta." });
      return;
    }

    const email = primaryEmail.emailAddress.trim().toLowerCase();
    const [member] = await db
      .select()
      .from(salonTeamTable)
      .where(eq(salonTeamTable.email, email));
    if (!member) {
      res.status(403).json({ error: "Esta cuenta no pertenece al equipo." });
      return;
    }

    res.locals.salonMember = member;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to authorize salon team member");
    res.status(500).json({ error: "No se pudo validar el acceso." });
  }
};

export const requireSalonOwner: RequestHandler = (_req, res, next) => {
  const member = res.locals.salonMember as
    | typeof salonTeamTable.$inferSelect
    | undefined;
  if (!member || member.role !== "owner") {
    res.status(403).json({ error: "Esta acción requiere permisos de dueño." });
    return;
  }
  next();
};
