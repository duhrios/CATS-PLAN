import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  activityTable,
  campusSettingsTable,
  cartsTable,
  reservationsTable,
  usersTable,
} from "@workspace/db/schema";
import { getAuthSession, requireSameOrigin, requireSession } from "../lib/auth";
import {
  activityRecord,
  buildDeletedReservationMovementEvents,
} from "../lib/activity-history";
import {
  isReservationDateInPast,
  isReservationCancellationAllowed,
  isSameDayReservationAllowed,
  type ReservationPolicy,
} from "../lib/reservation-rules";
import { getRoomDirectory } from "../lib/room-directory";
import {
  teacherCanReserveRoom,
  type TeacherRoomProfile,
  type TeacherRoomSelection,
} from "../lib/teacher-room-access";
import { availableReserveUnitsFromState } from "./reserve-inventory";

const router: IRouter = Router();
const teacherProfileSettingKey = "teacher-profiles-v1";
const teacherSegments = [
  "Educação Infantil",
  "Fundamental 1",
  "Fundamental 2",
  "Ensino Médio",
  "Contraturno",
] as const;
type TeacherSegment = (typeof teacherSegments)[number];
const isTeacherSegment = (value: unknown): value is TeacherSegment =>
  typeof value === "string" && teacherSegments.includes(value as TeacherSegment);

const requiredText = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} é obrigatório.`);
  }
  return value.trim();
};
const reservationSettingsKey = "operational-state-v1";
const getBrazilDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const loadReservationPolicy = async (): Promise<ReservationPolicy> => {
  const [setting] = await db
    .select({ value: campusSettingsTable.value })
    .from(campusSettingsTable)
    .where(eq(campusSettingsTable.key, reservationSettingsKey))
    .limit(1);
  if (!setting) return {};
  let state: unknown;
  try {
    state = JSON.parse(setting.value);
  } catch {
    throw new Error("As configurações operacionais salvas estão inválidas.");
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) return {};
  const campusSettings = (state as Record<string, unknown>).campusSettings;
  if (!campusSettings || typeof campusSettings !== "object" || Array.isArray(campusSettings)) return {};
  const settings = campusSettings as Record<string, unknown>;
  return {
    sameDayBookingEnabled: settings.sameDayBookingEnabled === true,
    sameDayBookingWindows: Array.isArray(settings.sameDayBookingWindows)
      ? settings.sameDayBookingWindows as ReservationPolicy["sameDayBookingWindows"]
      : [],
    reservationFreezeHours: typeof settings.reservationFreezeHours === "number"
      ? settings.reservationFreezeHours
      : 24,
  };
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
      teacherId: reservationsTable.teacherId,
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
    const parsedDate = new Date(`${scheduledDate}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== scheduledDate
    ) {
      throw new Error("Informe uma data válida.");
    }
    if (parsedDate.getUTCDay() === 0 || parsedDate.getUTCDay() === 6) {
      throw new Error("Agendamentos só podem ser feitos de segunda a sexta-feira.");
    }
    const startTime = requiredText(body.startTime, "Início");
    const endTime = requiredText(body.endTime, "Fim");
    const cartId = Number(body.cartId);
    const session = getAuthSession(req);
    if (session?.role === "user" && isReservationDateInPast(scheduledDate)) {
      return res.status(409).json({
        error: "Não é possível criar ou agendar em uma data que já passou.",
      });
    }
    if (session?.role === "user" && !session.accountId) {
      return res.status(403).json({ error: "A conta não possui um identificador seguro." });
    }
    let linkedTeacher: { id: number; name: string } | undefined;
    if (body.teacherId !== undefined && body.teacherId !== null && body.teacherId !== "") {
      const teacherId = Number(body.teacherId);
      if (session?.role !== "admin" || !Number.isInteger(teacherId) || teacherId <= 0) {
        return res.status(403).json({ error: "Somente a administração pode reservar em nome de um professor cadastrado." });
      }
      const [teacher] = await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(and(
          eq(usersTable.id, teacherId),
          eq(usersTable.role, "user"),
          eq(usersTable.active, true),
        ))
        .limit(1);
      if (!teacher) {
        return res.status(400).json({ error: "Selecione um professor com cadastro ativo." });
      }
      linkedTeacher = teacher;
    }
    const kind = body.kind === "Reserva" ? "Reserva" : "Aula";
    const teacherName = linkedTeacher?.name ?? requiredText(body.teacherName, "Professor");
    if (
      session?.role === "user" &&
      kind === "Aula" &&
      scheduledDate === getBrazilDate()
    ) {
      const policy = await loadReservationPolicy();
      if (!isSameDayReservationAllowed(scheduledDate, startTime, endTime, policy)) {
        return res.status(409).json({
          error: policy.sameDayBookingEnabled
            ? "Este horário está bloqueado para agendamento no mesmo dia. Escolha um horário liberado nas configurações da agenda."
            : "Agendamentos de aula no mesmo dia estão bloqueados pelo administrador.",
        });
      }
    }
    if (session?.role === "admin" && !linkedTeacher) {
      const matchingTeachers = await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(and(
          eq(usersTable.role, "user"),
          eq(usersTable.active, true),
          sql`lower(trim(${usersTable.name})) = lower(${teacherName})`,
        ))
        .limit(2);
      if (matchingTeachers.length === 1) {
        linkedTeacher = matchingTeachers[0];
      }
    }
    if (!Number.isInteger(cartId)) throw new Error("Carrinho inválido.");
    if (startTime >= endTime) throw new Error("O horário inicial deve ser anterior ao final.");

    if (session?.role === "user" && kind === "Aula") {
      const [profileSetting] = await db
        .select({ value: campusSettingsTable.value })
        .from(campusSettingsTable)
        .where(eq(campusSettingsTable.key, teacherProfileSettingKey))
        .limit(1);
      if (!profileSetting) {
        return res.status(403).json({
          error: "Complete seu perfil docente antes de reservar uma sala.",
        });
      }

      let profileMap: unknown;
      try {
        profileMap = JSON.parse(profileSetting.value);
      } catch {
        return res.status(500).json({ error: "Os perfis docentes salvos estão inválidos." });
      }
      if (!profileMap || typeof profileMap !== "object" || Array.isArray(profileMap)) {
        return res.status(500).json({ error: "Os perfis docentes salvos estão inválidos." });
      }
      const rawProfile = (profileMap as Record<string, unknown>)[String(session.accountId)];
      if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) {
        return res.status(403).json({
          error: "Complete seu perfil docente antes de reservar uma sala.",
        });
      }
      const profileRecord = rawProfile as Record<string, unknown>;
      const profileSegment = profileRecord.segment;
      const additionalSegments = profileRecord.additionalSegments ?? [];
      if (
        !isTeacherSegment(profileSegment) ||
        typeof profileRecord.subject !== "string" ||
        typeof profileRecord.className !== "string" ||
        !Array.isArray(additionalSegments) ||
        !additionalSegments.every(isTeacherSegment)
      ) {
        return res.status(500).json({ error: "O perfil docente salvo está inválido." });
      }
      const profile: TeacherRoomProfile = {
        segment: profileSegment,
        className: profileRecord.className,
        additionalSegments,
      };
      const segment = requiredText(body.segment, "Segmento");
      const period = requiredText(body.period, "Período");
      if (
        !isTeacherSegment(segment) ||
        (period !== "Manhã" && period !== "Tarde")
      ) {
        return res.status(400).json({ error: "Informe um segmento e período válidos." });
      }
      const selection: TeacherRoomSelection = {
        segment,
        className: requiredText(body.className, "Turma"),
        room: requiredText(body.room, "Sala"),
        period,
      };
      const { rooms } = await getRoomDirectory();
      if (!teacherCanReserveRoom(profile, rooms, selection)) {
        return res.status(403).json({
          error: "A turma ou sala não está cadastrada para seu perfil, segmento e horário.",
        });
      }
    }

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

      const quantity =
        Number.isInteger(body.quantity) && Number(body.quantity) > 0
          ? Number(body.quantity)
          : 1;
      if (kind === "Reserva") {
        const [operationalState] = await tx
          .select({ value: campusSettingsTable.value })
          .from(campusSettingsTable)
          .where(eq(campusSettingsTable.key, "operational-state-v1"))
          .for("update")
          .limit(1);
        let state: unknown = null;
        if (operationalState) {
          try {
            state = JSON.parse(operationalState.value);
          } catch {
            throw new Error("O estoque operacional salvo está inválido.");
          }
        }
        const availableUnits = availableReserveUnitsFromState(state);
        const otherReservations = await tx
          .select({
            id: reservationsTable.id,
            quantity: reservationsTable.quantity,
          })
          .from(reservationsTable)
          .where(and(
            eq(reservationsTable.kind, "Reserva"),
            ...(reservationId ? [ne(reservationsTable.id, reservationId)] : []),
          ));
        const requestedUnits = otherReservations.reduce(
          (total, reservation) => total + reservation.quantity,
          quantity,
        );
        if (requestedUnits > availableUnits.length) {
          throw new Error(
            `Há somente ${Math.max(0, availableUnits.length - requestedUnits + quantity)} Chromebook(s) disponível(is) para reserva.`,
          );
        }
      }

      const values = {
        ...(session?.role === "user"
          ? { teacherId: session.accountId }
          : linkedTeacher
            ? { teacherId: linkedTeacher.id }
            : {}),
        teacherName: linkedTeacher?.name ?? teacherName,
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
        quantity,
      };
      const [previous] = reservationId
        ? await tx.select()
            .from(reservationsTable)
            .where(eq(reservationsTable.id, reservationId))
            .for("update")
            .limit(1)
        : [];
      if (reservationId && !previous) throw new Error("Agendamento não encontrado.");
      const [reservation] = reservationId
        ? await tx.update(reservationsTable)
            .set(values)
            .where(eq(reservationsTable.id, reservationId))
            .returning()
        : await tx.insert(reservationsTable).values(values).returning();
      if (!reservation) throw new Error("Agendamento não encontrado.");

      const changed = !previous || [
        previous.teacherName !== reservation.teacherName,
        previous.segment !== reservation.segment,
        previous.subject !== reservation.subject,
        previous.className !== reservation.className,
        previous.room !== reservation.room,
        previous.period !== reservation.period,
        previous.scheduledDate !== reservation.scheduledDate,
        previous.startTime !== reservation.startTime,
        previous.endTime !== reservation.endTime,
        previous.cartId !== reservation.cartId,
        previous.kind !== reservation.kind,
        previous.quantity !== reservation.quantity,
      ].some(Boolean);
      if (changed) {
        const describe = (item: typeof reservation) =>
          `${item.teacherName} · ${item.className} · ${item.room} · ${item.scheduledDate} · ${item.startTime.slice(0, 5)}–${item.endTime.slice(0, 5)} · ${cart.name} · ${item.quantity} Chromebook(s)`;
        await tx.insert(activityTable).values(activityRecord({
          type: reservation.kind === "Reserva" ? "Reserva" : "Aula",
          title: reservation.kind === "Reserva"
        ? previous
          ? "Reserva de Chromebooks alterada"
          : "Reserva de Chromebooks criada"
        : previous
          ? "Aula agendada alterada"
          : "Aula agendada",
          detail: previous
        ? `Antes: ${describe(previous)} · Agora: ${describe(reservation)}`
        : describe(reservation),
          actor: session?.name ?? reservation.teacherName,
          person: reservation.teacherName,
          profile: "Professor",
          entityKeys: [`reservation:${reservation.id}`],
        }));
      }
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
      kind: reservationsTable.kind,
      scheduledDate: reservationsTable.scheduledDate,
      startTime: reservationsTable.startTime,
      endTime: reservationsTable.endTime,
      cartId: reservationsTable.cartId,
      className: reservationsTable.className,
      room: reservationsTable.room,
      segment: reservationsTable.segment,
      subject: reservationsTable.subject,
      period: reservationsTable.period,
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
  const reservationDetailsChanged =
    body.className !== reservation.className ||
    body.room !== reservation.room ||
    body.segment !== reservation.segment ||
    body.subject !== reservation.subject ||
    body.period !== reservation.period;
  if (
    session?.role === "user" &&
    (scheduleChanged || reservationDetailsChanged) &&
    reservation.kind === "Aula"
  ) {
    const policy = await loadReservationPolicy();
    const newDate = body.scheduledDate as string;
    const newStart = body.startTime as string;
    const newEnd = body.endTime as string;
    const canKeepCurrent = isReservationCancellationAllowed(
      reservation.scheduledDate,
      reservation.startTime,
      new Date(),
      policy,
    );
    const canMoveToNewDate = newDate !== getBrazilDate() ||
      isSameDayReservationAllowed(newDate, newStart, newEnd, policy);
    if (!canKeepCurrent || !canMoveToNewDate) {
      return res.status(409).json({
        error: policy.sameDayBookingEnabled
          ? "Alteração bloqueada pelo congelamento da agenda ou pela faixa de horário configurada."
          : "Alterações de aula estão bloqueadas pelo congelamento da agenda. Procure o TI.",
      });
    }
  }
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
  if (session?.role === "user" && !session.accountId) {
    return res.status(403).json({ error: "A conta não possui um identificador seguro." });
  }
  const result = await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(reservationsTable)
      .where(eq(reservationsTable.id, reservationId))
      .for("update")
      .limit(1);
    if (!reservation) return { status: "missing" as const };
    if (
      session?.role === "user" &&
      reservation.teacherId !== session.accountId
    ) {
      return { status: "forbidden" as const };
    }
    if (session?.role === "user") {
      const policy = reservation.kind === "Aula"
        ? await loadReservationPolicy()
        : {};
      if (!isReservationCancellationAllowed(
        reservation.scheduledDate,
        reservation.startTime,
        new Date(),
        policy,
      )) {
        return {
          status: "blocked" as const,
          sameDay: reservation.scheduledDate === getBrazilDate(),
          policy,
        };
      }
    }
    const [cart] = await tx
      .select({ name: cartsTable.name })
      .from(cartsTable)
      .where(eq(cartsTable.id, reservation.cartId))
      .limit(1);
    const [operationalState] = await tx
      .select({ value: campusSettingsTable.value })
      .from(campusSettingsTable)
      .where(eq(campusSettingsTable.key, reservationSettingsKey))
      .limit(1);
    let movements: unknown[] = [];
    if (operationalState) {
      let parsedState: unknown;
      try {
        parsedState = JSON.parse(operationalState.value);
      } catch {
        throw new Error("O estado operacional salvo está inválido; a reserva não foi removida.");
      }
      if (!parsedState || typeof parsedState !== "object" || Array.isArray(parsedState)) {
        throw new Error("O estado operacional salvo está inválido; a reserva não foi removida.");
      }
      const movementList = (parsedState as Record<string, unknown>)[
        "controle-carrinhos-movements"
      ];
      if (movementList !== undefined && !Array.isArray(movementList)) {
        throw new Error("O histórico de movimentações salvo está inválido; a reserva não foi removida.");
      }
      movements = Array.isArray(movementList) ? movementList : [];
    }

    const [deleted] = await tx
      .delete(reservationsTable)
      .where(eq(reservationsTable.id, reservationId))
      .returning({ id: reservationsTable.id });
    if (!deleted) return { status: "missing" as const };

    const reservationType = reservation.kind === "Reserva" ? "Reserva" : "Aula";
    const detail = [
      reservation.teacherName,
      reservation.className,
      reservation.room,
      reservation.scheduledDate,
      `${reservation.startTime.slice(0, 5)}–${reservation.endTime.slice(0, 5)}`,
      cart?.name,
      `${reservation.quantity} Chromebook(s)`,
    ].filter(Boolean).join(" · ");
    const events = [
      activityRecord({
        type: reservationType,
        title: reservation.kind === "Reserva"
          ? "Reserva de Chromebooks encerrada"
          : "Aula agendada removida",
        detail,
        actor: session?.name ?? reservation.teacherName,
        person: reservation.teacherName,
        profile: "Professor",
        entityKeys: [`reservation:${reservation.id}`],
      }),
      ...buildDeletedReservationMovementEvents({
        id: reservation.id,
        teacherName: reservation.teacherName,
        cartName: cart?.name ?? "Carrinho removido",
        room: reservation.room,
      }, movements, session?.name ?? reservation.teacherName).map(activityRecord),
    ];
    await tx.insert(activityTable).values(events);
    return { status: "deleted" as const };
  });

  if (result.status === "missing") {
    return res.status(404).json({ error: "Agendamento não encontrado." });
  }
  if (result.status === "forbidden") {
    return res.status(403).json({ error: "Você só pode remover seus próprios agendamentos." });
  }
  if (result.status === "blocked") {
    return res.status(409).json({
      error: result.sameDay
        ? result.policy.sameDayBookingEnabled
          ? "O cancelamento está bloqueado para este horário no mesmo dia. Procure o TI."
          : "O cancelamento de aulas no mesmo dia está bloqueado pelo administrador. Procure o TI."
        : `O cancelamento deve respeitar o congelamento de ${result.policy.reservationFreezeHours ?? 24} hora(s) antes da aula. Procure o TI.`,
    });
  }
  return res.status(204).end();
});

export default router;
