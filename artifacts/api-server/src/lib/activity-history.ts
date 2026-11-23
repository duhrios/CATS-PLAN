import type { AuthRole } from "./auth";

export type ActivityCategory =
  | "Reserva"
  | "Aula"
  | "Equipamento"
  | "Wi-Fi"
  | "Movimentação";

export type ActivityProfile = "Professor" | "Funcionário/Autorizado" | "TI";

export type ActivityInput = {
  type: ActivityCategory;
  title: string;
  detail: string;
  actor: string;
  person?: string;
  profile?: ActivityProfile;
  entityKeys?: string[];
  occurredAt?: string;
};

export type ActivityMetadata = {
  detail: string;
  person?: string;
  profile?: ActivityProfile;
  entityKeys?: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown) => typeof value === "string" ? value : "";

const sameValue = (first: unknown, second: unknown) =>
  JSON.stringify(first) === JSON.stringify(second);

const formatAssignment = (assignment: Record<string, unknown>) => {
  const date = text(assignment.date);
  const start = text(assignment.start).slice(0, 5);
  return date ? `${date}${start ? ` às ${start}` : ""}` : "";
};

export const activityRecord = (event: ActivityInput) => ({
  type: event.type,
  title: event.title,
  description: JSON.stringify({
    version: 1,
    detail: event.detail,
    ...(event.person ? { person: event.person } : {}),
    ...(event.profile ? { profile: event.profile } : {}),
    ...(event.entityKeys ? { entityKeys: event.entityKeys } : {}),
  }),
  actor: event.actor,
  ...(event.occurredAt ? { createdAt: new Date(event.occurredAt) } : {}),
});

export const activityMetadata = (description: string): ActivityMetadata => {
  try {
    const parsed: unknown = JSON.parse(description);
    if (
      isRecord(parsed) &&
      parsed.version === 1 &&
      typeof parsed.detail === "string"
    ) {
      return {
        detail: parsed.detail,
        ...(typeof parsed.person === "string" ? { person: parsed.person } : {}),
        ...(parsed.profile === "Professor" ||
          parsed.profile === "Funcionário/Autorizado" ||
          parsed.profile === "TI"
          ? { profile: parsed.profile }
          : {}),
        ...(Array.isArray(parsed.entityKeys) &&
          parsed.entityKeys.every((key) => typeof key === "string")
          ? { entityKeys: parsed.entityKeys }
          : {}),
      };
    }
  } catch {
    return { detail: description };
  }
  return { detail: description };
};

const assignmentProfile = (
  value: unknown,
): ActivityProfile | undefined =>
  value === "Professor" || value === "Funcionário/Autorizado"
    ? value
    : undefined;

const changedUnits = (before: unknown, after: unknown) => {
  const beforeValues = [...new Set(asArray(before).filter((value): value is string => typeof value === "string"))];
  const afterValues = [...new Set(asArray(after).filter((value): value is string => typeof value === "string"))];
  return {
    added: afterValues.filter((value) => !beforeValues.includes(value)),
    removed: beforeValues.filter((value) => !afterValues.includes(value)),
  };
};

const describeUnitChanges = (label: string, changes: { added: string[]; removed: string[] }) => {
  const parts: string[] = [];
  if (changes.added.length) parts.push(`${label} incluída(s): ${changes.added.join(", ")}`);
  if (changes.removed.length) parts.push(`${label} removida(s): ${changes.removed.join(", ")}`);
  return parts;
};

const activityProfileForRole = (role: AuthRole): ActivityProfile =>
  role === "user" ? "Professor" : "TI";

export const buildOperationalActivityEvents = (
  previousState: Record<string, unknown>,
  nextState: Record<string, unknown>,
  actor: string,
  role: AuthRole,
): ActivityInput[] => {
  const events: ActivityInput[] = [];
  const actorProfile = activityProfileForRole(role);
  const previousCarts = asArray(previousState["controle-carrinhos-carts"])
    .map(asRecord)
    .filter((cart) => typeof cart.id === "string");
  const nextCarts = asArray(nextState["controle-carrinhos-carts"])
    .map(asRecord)
    .filter((cart) => typeof cart.id === "string");
  const previousCartsById = new Map(previousCarts.map((cart) => [text(cart.id), cart]));
  const nextCartsById = new Map(nextCarts.map((cart) => [text(cart.id), cart]));

  const assignmentGroups = new Map<string, {
    title: string;
    cartName: string;
    teacher: string;
    date: string;
    start: string;
    profile?: ActivityProfile;
    units: string[];
    entityKeys: string[];
  }>();
  const cartIds = new Set([...previousCartsById.keys(), ...nextCartsById.keys()]);

  for (const cartId of cartIds) {
    const previousCart = previousCartsById.get(cartId);
    const nextCart = nextCartsById.get(cartId);
    const cartName = text(nextCart?.name) || text(previousCart?.name) || `Carrinho ${cartId}`;
    const previousAssignments = asRecord(previousCart?.reserveAssignments);
    const nextAssignments = asRecord(nextCart?.reserveAssignments);
    const unitIds = new Set([
      ...Object.keys(previousAssignments),
      ...Object.keys(nextAssignments),
    ]);

    for (const unit of unitIds) {
      const before = previousAssignments[unit];
      const after = nextAssignments[unit];
      if (sameValue(before, after)) continue;
      const beforeAssignment = asRecord(before);
      const afterAssignment = asRecord(after);
      const assignment = Object.keys(afterAssignment).length
        ? afterAssignment
        : beforeAssignment;
      const teacher = text(assignment.teacher) || "Responsável não informado";
      const date = text(assignment.date);
      const start = text(assignment.start).slice(0, 5);
      const profile = assignmentProfile(assignment.personType);
      const returned = before !== undefined && after === undefined;
      const unitWasRemoved = asArray(nextCart?.deletedUnits).includes(unit) || !nextCart;
      const title = before === undefined
        ? "Chromebook de reserva atribuído"
        : after === undefined
          ? unitWasRemoved
            ? "Atribuição de reserva encerrada"
            : "Chromebook de reserva devolvido"
          : "Atribuição de Chromebook de reserva alterada";
      const key = [
        title,
        cartId,
        teacher,
        date,
        start,
        profile ?? "",
        returned ? "" : JSON.stringify(before),
        returned ? "" : JSON.stringify(after),
      ].join("\u0000");
      const group = assignmentGroups.get(key) ?? {
        title,
        cartName,
        teacher,
        date,
        start,
        profile,
        units: [],
        entityKeys: [],
      };
      group.units.push(unit);
      group.entityKeys.push(`reserve-assignment:${cartId}:${unit}`);
      assignmentGroups.set(key, group);
    }

    if (!previousCart && nextCart) {
      events.push({
        type: "Equipamento",
        title: "Carrinho cadastrado",
        detail: `${cartName} · ${text(nextCart.location) || "Local não informado"}`,
        actor,
        person: actor,
        profile: actorProfile,
        entityKeys: [`cart:${cartId}`],
      });
      continue;
    }
    if (previousCart && !nextCart) {
      events.push({
        type: "Equipamento",
        title: "Carrinho removido",
        detail: cartName,
        actor,
        person: actor,
        profile: actorProfile,
        entityKeys: [`cart:${cartId}`],
      });
      continue;
    }
    if (!previousCart || !nextCart) continue;

    const changes: string[] = [];
    if (previousCart.unavailable !== nextCart.unavailable) {
      changes.push(
        `Carrinho ${nextCart.unavailable === true ? "indisponível" : "disponível"}`,
      );
    }
    if (previousCart.status !== nextCart.status) {
      changes.push(`Status: ${text(previousCart.status) || "—"} → ${text(nextCart.status) || "—"}`);
    }
    if (previousCart.location !== nextCart.location) {
      changes.push(`Local: ${text(previousCart.location) || "—"} → ${text(nextCart.location) || "—"}`);
    }
    for (const [field, label] of [
      ["unavailableUnits", "Unidades indisponíveis"],
      ["reservedUnits", "Unidades reservadas"],
      ["deletedUnits", "Unidades removidas"],
    ] as const) {
      changes.push(...describeUnitChanges(
        label,
        changedUnits(previousCart[field], nextCart[field]),
      ));
    }
    if (previousCart.total !== nextCart.total) {
      changes.push(`Quantidade total: ${String(previousCart.total ?? "—")} → ${String(nextCart.total ?? "—")}`);
    }
    if (previousCart.unavailableUnitReasons !== nextCart.unavailableUnitReasons) {
      const beforeReasons = asRecord(previousCart.unavailableUnitReasons);
      const afterReasons = asRecord(nextCart.unavailableUnitReasons);
      const changedReasons = new Set([
        ...Object.keys(beforeReasons),
        ...Object.keys(afterReasons),
      ]);
      for (const unit of changedReasons) {
        if (beforeReasons[unit] !== afterReasons[unit]) {
          changes.push(`Observação de ${unit}: ${text(afterReasons[unit]) || "removida"}`);
        }
      }
    }
    if (changes.length) {
      events.push({
        type: "Equipamento",
        title: "Equipamento do carrinho atualizado",
        detail: `${cartName} · ${changes.join(" · ")}`,
        actor,
        person: actor,
        profile: actorProfile,
        entityKeys: [`cart:${cartId}`],
      });
    }
  }

  assignmentGroups.forEach((group) => {
    const scheduledAt = formatAssignment({
      date: group.date,
      start: group.start,
    });
    const sortedUnits = group.units.sort((first, second) =>
      first.localeCompare(second, "pt-BR", { numeric: true }),
    );
    events.push({
      type: "Reserva",
      title: group.title,
      detail: `${group.cartName} · Unidades: ${sortedUnits.join(", ")} · Responsável: ${group.teacher}${scheduledAt ? ` · Agendamento: ${scheduledAt}` : ""}`,
      actor,
      person: group.teacher,
      ...(group.profile ? { profile: group.profile } : {}),
      entityKeys: group.entityKeys,
    });
  });

  const previousPoints = asArray(previousState["controle-carrinhos-wifi-points"])
    .map(asRecord)
    .filter((point) => typeof point.id === "string");
  const nextPoints = asArray(nextState["controle-carrinhos-wifi-points"])
    .map(asRecord)
    .filter((point) => typeof point.id === "string");
  const previousPointsById = new Map(previousPoints.map((point) => [text(point.id), point]));
  const nextPointsById = new Map(nextPoints.map((point) => [text(point.id), point]));
  const pointIds = new Set([...previousPointsById.keys(), ...nextPointsById.keys()]);

  for (const pointId of pointIds) {
    const before = previousPointsById.get(pointId);
    const after = nextPointsById.get(pointId);
    const pointName = text(after?.name) || text(before?.name) || `Ponto ${pointId}`;
    let title: string | undefined;
    let detail = pointName;
    if (!before && after) {
      title = "Ponto Wi-Fi cadastrado";
      detail = `${pointName} · ${text(after.point)}`;
    } else if (before && !after) {
      title = "Ponto Wi-Fi removido";
    } else if (before && after && !sameValue(before, after)) {
      title = "Ponto Wi-Fi atualizado";
      const changes: string[] = [];
      for (const [field, label] of [
        ["status", "Status"],
        ["assignedRoom", "Sala vinculada"],
        ["location", "Local"],
        ["rack", "Rack"],
        ["observations", "Observação"],
      ] as const) {
        if (before[field] !== after[field]) {
          changes.push(`${label}: ${text(before[field]) || "—"} → ${text(after[field]) || "—"}`);
        }
      }
      if (before.name !== after.name) changes.push(`Nome: ${text(before.name)} → ${text(after.name)}`);
      if (before.point !== after.point) changes.push(`Identificação: ${text(before.point)} → ${text(after.point)}`);
      if (before.type !== after.type) changes.push(`Tipo: ${text(before.type)} → ${text(after.type)}`);
      detail = `${pointName} · ${changes.join(" · ") || "Dados atualizados"}`;
    }
    if (title) {
      events.push({
        type: "Wi-Fi",
        title,
        detail,
        actor,
        person: actor,
        profile: actorProfile,
        entityKeys: [`wifi-point:${pointId}`],
      });
    }
  }

  const previousRooms = asArray(previousState["controle-carrinhos-wifi-rooms"])
    .map(asRecord);
  const nextRooms = asArray(nextState["controle-carrinhos-wifi-rooms"])
    .map(asRecord);
  const roomKey = (room: Record<string, unknown>) =>
    text(room.room) || text(room.id) || text(room.name);
  const previousRoomsByKey = new Map(previousRooms.map((room) => [roomKey(room), room]));
  const nextRoomsByKey = new Map(nextRooms.map((room) => [roomKey(room), room]));
  const roomKeys = new Set([...previousRoomsByKey.keys(), ...nextRoomsByKey.keys()]);
  for (const key of roomKeys) {
    if (!key) continue;
    const before = previousRoomsByKey.get(key);
    const after = nextRoomsByKey.get(key);
    if (sameValue(before, after)) continue;
    events.push({
      type: "Wi-Fi",
      title: "Conectividade da sala alterada",
      detail: `${key} · Wi-Fi ${after?.hasWifi === true ? "disponível" : "indisponível"}`,
      actor,
      person: actor,
      profile: actorProfile,
      entityKeys: [`wifi-room:${key}`],
    });
  }

  return events;
};

type MovementReservation = {
  id: number;
  teacherName: string;
  cartName: string;
  room: string;
};

const movementTimestamp = (value: unknown) => {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) return undefined;
  return new Date(value).toISOString();
};

export const buildDeletedReservationMovementEvents = (
  reservation: MovementReservation,
  movements: unknown,
  actor: string,
): ActivityInput[] => {
  const movement = asArray(movements)
    .map(asRecord)
    .find((item) => item.reservationId === reservation.id);
  if (!movement) return [];

  const context = `${reservation.cartName} · ${reservation.room}`;
  const entries: Array<{
    field: string;
    title: string;
    detail: string;
    person: string;
    profile: ActivityProfile;
    toneTimestamp?: string;
  }> = [];
  const add = (
    field: string,
    timestamp: unknown,
    title: string,
    detail: string,
    person: string,
    profile: ActivityProfile,
  ) => {
    const occurredAt = movementTimestamp(timestamp);
    if (!occurredAt) return;
    entries.push({ field, title, detail, person, profile, toneTimestamp: occurredAt });
  };

  add(
    "moved",
    movement.movedAt,
    movement.movedLate === true ? "Carrinho movido com atraso" : "Carrinho em movimentação",
    `${context} · Movido por: ${text(movement.movedBy) || "TI"}`,
    text(movement.movedBy) || actor,
    "TI",
  );
  add(
    "completed",
    movement.completedAt,
    "Movimentação concluída",
    `${context} · Concluído por: ${text(movement.completedBy) || "TI"}`,
    text(movement.completedBy) || actor,
    "TI",
  );
  add(
    "not-received",
    movement.notReceivedAt,
    "Professor informou que não recebeu",
    `${context} · Professor: ${reservation.teacherName}`,
    reservation.teacherName,
    "Professor",
  );
  add(
    "not-attended",
    movement.notAttendedAt,
    "Movimentação não atendida",
    `${context} · O carrinho não foi movimentado no horário da aula.`,
    reservation.teacherName,
    "TI",
  );
  add(
    "request-again",
    movement.requestAgainAt,
    "Professor pediu nova movimentação",
    `${context} · Solicitação ${String(movement.requestCount ?? 0)}x`,
    reservation.teacherName,
    "Professor",
  );
  add(
    "confirmed",
    movement.confirmedAt,
    "Recebimento confirmado pelo professor",
    `${context} · Confirmado por: ${text(movement.confirmedBy) || reservation.teacherName}`,
    text(movement.confirmedBy) || reservation.teacherName,
    "Professor",
  );

  return entries.map((entry) => ({
    type: "Movimentação",
    title: entry.title,
    detail: entry.detail,
    actor,
    person: entry.person,
    profile: entry.profile,
    entityKeys: [`movement:${reservation.id}:${entry.field}`],
    occurredAt: entry.toneTimestamp,
  }));
};
