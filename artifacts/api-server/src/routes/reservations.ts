import { and, eq, gt, lt, ne } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { cartsTable, reservationsTable } from "@workspace/db/schema";
import { getAuthSession, requireSameOrigin, requireSession } from "../lib/auth";

const router: IRouter = Router();

const requiredText = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} é obrigatório.`);
  }
  return value.trim();
};

const isScheduledTimeInPast = (date: string, startTime: string, now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  if (date < today) return true;
  if (date > today) return false;
  return startTime.slice(0, 5) <= `${value("hour")}:${value("minute")}`;
};

router.get("/carts", requireSession, async (_req, res) => {
  const carts = await db
    .select({ id: cartsTable.id, name: cartsTable.name, code: cartsTable.code })
    .from(cartsTable)
    .orderBy(cartsTable.code);
  return res.json(carts);
});

router.get("/reservations", requireSession, async (req, res) => {
  const session = getAuthSession(req);
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const rows = await db
    .select({
      id: reservationsTable.id,
      teacherName: reservationsTable.teacherName,
      segment: reservationsTable.segment,
      subject: reservationsTable.subject,
      className: reservationsTable.className,
      room: reservationsTable.room,
      period: reservationsTable.period,
      scheduledDate: reservationsTable.scheduledDate,
      startTime: reservationsTable.startTime,
      endTime: reservationsTable.endTime,
      cartId: reservationsTable.cartId,
      cartName: cartsTable.name,
      kind: reservationsTable.kind,
      quantity: reservationsTable.quantity,
      status: reservationsTable.status,
    })
    .from(reservationsTable)
    .innerJoin(cartsTable, eq(cartsTable.id, reservationsTable.cartId))
    .where(and(
      ...(date ? [eq(reservationsTable.scheduledDate, date)] : []),
      ...(session?.role === "user"
        ? [eq(reservationsTable.teacherId, session.accountId ?? -1)]
        : []),
    ));
  return res.json(rows);
});

const saveReservation = async (
  req: Request,
  res: Response,
  reservationId?: number,
) => {
  try {
    const body = req.body as Record<string, unknown>;
    const scheduledDate = requiredText(body.scheduledDate, "Data");
    const startTime = requiredText(body.startTime, "Início");
    const endTime = requiredText(body.endTime, "Fim");
    const cartId = Number(body.cartId);
    const session = getAuthSession(req);
    if (session?.role === "user" && !session.accountId) {
      return res.status(403).json({ error: "A conta não possui um identificador seguro." });
    }
    const kind = body.kind === "Reserva" ? "Reserva" : "Aula";
    if (!Number.isInteger(cartId)) throw new Error("Carrinho inválido.");
    if (startTime >= endTime) throw new Error("O horário inicial deve ser anterior ao final.");

    const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.id, cartId)).limit(1);
    if (!cart || (kind === "Aula" && cart.unavailable)) {
      return res.status(409).json({ error: "Carrinho indisponível." });
    }

    const saved = await db.transaction(async (tx) => {
      const conflicts = await tx
        .select({ id: reservationsTable.id })
        .from(reservationsTable)
        .where(and(
          eq(reservationsTable.scheduledDate, scheduledDate),
          eq(reservationsTable.cartId, cartId),
          eq(reservationsTable.kind, kind),
          lt(reservationsTable.startTime, endTime),
          gt(reservationsTable.endTime, startTime),
          ...(reservationId ? [ne(reservationsTable.id, reservationId)] : []),
        ))
        .limit(1);
      if (conflicts.length) {
        throw new Error("Já existe um agendamento para este carrinho nesse intervalo.");
      }

      const values = {
        ...(session?.role === "user" ? { teacherId: session.accountId } : {}),
        teacherName: requiredText(body.teacherName, "Professor"),
        segment: requiredText(body.segment, "Segmento"),
        subject: requiredText(body.subject, "Disciplina"),
        className: requiredText(body.className, "Turma"),
        room: requiredText(body.room, "Sala"),
        period: requiredText(body.period, "Período"),
        scheduledDate,
        startTime,
        endTime,
        cartId,
        kind,
        quantity: Number.isInteger(body.quantity) && Number(body.quantity) > 0 ? Number(body.quantity) : 1,
      };
      const [reservation] = reservationId
        ? await tx.update(reservationsTable)
            .set(values)
            .where(eq(reservationsTable.id, reservationId))
            .returning()
        : await tx.insert(reservationsTable).values(values).returning();
      if (!reservation) throw new Error("Agendamento não encontrado.");
      return reservation;
    });
    return res.status(reservationId ? 200 : 201).json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível criar o agendamento.";
    return res.status(message.startsWith("Já existe") ? 409 : 400).json({ error: message });
  }
};

router.post("/reservations", requireSameOrigin, requireSession, (req, res) => {
  const session = getAuthSession(req);
  if (session?.role === "user" && session.name !== req.body?.teacherName) {
    return res.status(403).json({ error: "Você só pode criar agendamentos em seu próprio nome." });
  }
  return saveReservation(req, res);
});

router.put("/reservations/:id", requireSameOrigin, requireSession, async (req, res) => {
  const reservationId = Number(req.params.id);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return res.status(400).json({ error: "Agendamento inválido." });
  }
  const session = getAuthSession(req);
  const [reservation] = await db
    .select({
      teacherId: reservationsTable.teacherId,
      scheduledDate: reservationsTable.scheduledDate,
      startTime: reservationsTable.startTime,
      endTime: reservationsTable.endTime,
      cartId: reservationsTable.cartId,
    })
    .from(reservationsTable)
    .where(eq(reservationsTable.id, reservationId))
    .limit(1);
  if (!reservation) return res.status(404).json({ error: "Agendamento não encontrado." });
  if (session?.role === "user") {
    if (
      !session.accountId ||
      reservation.teacherId !== session.accountId ||
      req.body?.teacherName !== session.name
    ) {
      return res.status(403).json({ error: "Você só pode alterar seus próprios agendamentos." });
    }
  }
  const body = req.body as Record<string, unknown>;
  const nextCartId = Number(body.cartId);
  const hasValidSchedule =
    typeof body.scheduledDate === "string" &&
    typeof body.startTime === "string" &&
    typeof body.endTime === "string" &&
    Number.isInteger(nextCartId);
  const scheduleChanged =
    hasValidSchedule &&
    (body.scheduledDate !== reservation.scheduledDate ||
      body.startTime !== reservation.startTime ||
      body.endTime !== reservation.endTime ||
      nextCartId !== reservation.cartId);
  if (
    scheduleChanged &&
    (isScheduledTimeInPast(reservation.scheduledDate, reservation.startTime) ||
      (typeof body.scheduledDate === "string" &&
        typeof body.startTime === "string" &&
        isScheduledTimeInPast(body.scheduledDate, body.startTime)))
  ) {
    return res.status(409).json({
      error: "Agendamentos com data ou horário já passado não podem ser movidos.",
    });
  }
  return saveReservation(req, res, reservationId);
});

router.delete("/reservations/:id", requireSameOrigin, requireSession, async (req, res) => {
  const reservationId = Number(req.params.id);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return res.status(400).json({ error: "Agendamento inválido." });
  }
  const session = getAuthSession(req);
  if (session?.role === "user") {
    const [reservation] = await db
      .select({ teacherId: reservationsTable.teacherId })
      .from(reservationsTable)
      .where(eq(reservationsTable.id, reservationId))
      .limit(1);
    if (!reservation) return res.status(404).json({ error: "Agendamento não encontrado." });
    if (!session.accountId || reservation.teacherId !== session.accountId) {
      return res.status(403).json({ error: "Você só pode remover seus próprios agendamentos." });
    }
  }
  const [deleted] = await db
    .delete(reservationsTable)
    .where(eq(reservationsTable.id, reservationId))
    .returning({ id: reservationsTable.id });
  if (!deleted) return res.status(404).json({ error: "Agendamento não encontrado." });
  return res.status(204).end();
});

export default router;
