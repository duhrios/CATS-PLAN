import {
  isCartTransitionConflict,
  reservationsOverlap,
  type CartScheduleSlot,
  type Reservation,
} from "@/lib/campus-data";

export const allReservationsTab = "Ver todas";
export type ReservationPeriodFilter = "Todos" | "Manhã" | "Tarde";

export type ReservationMoveTarget = Pick<
  Reservation,
  "date" | "start" | "end" | "cart" | "period"
>;

export function isReservationMoveInPast(
  reservation: Pick<Reservation, "date" | "start">,
  now = new Date(),
): boolean {
  const today = formatDateKey(now);
  if (reservation.date < today) return true;
  if (reservation.date > today) return false;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return reservation.start <= currentTime;
}

const pastMoveError = "Agendamentos com data ou horário já passado não podem ser movidos.";

export type FloorOptimizationSuggestion = {
  current: Reservation;
  previous: Reservation;
  floor: string;
};

export function getFloorOptimizationSuggestions(
  reservations: Reservation[],
  floorForRoom: (room: string) => string,
  visibleDates: string[],
  now = new Date(),
): FloorOptimizationSuggestion[] {
  const visibleDateKeys = new Set(visibleDates);
  const suggestions: FloorOptimizationSuggestion[] = [];
  const ordered = [...reservations]
    .filter(
      (item) =>
        item.kind === "Aula" &&
        visibleDateKeys.has(item.date) &&
        !isReservationMoveInPast(item, now),
    )
    .sort((a, b) =>
      `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
    );
  ordered.forEach((current, index) => {
    const floor = floorForRoom(current.room);
    const previous = ordered
      .slice(0, index)
      .reverse()
      .find(
        (item) =>
          item.date === current.date &&
          item.cart !== current.cart &&
          item.start < current.start &&
          floorForRoom(item.room) === floor,
      );
    if (previous && !suggestions.some((item) => item.current.id === current.id)) {
      suggestions.push({ current, previous, floor });
    }
  });
  return suggestions;
}

export function prepareQuickAccessMove(
  reservations: Reservation[],
  reservationId: number,
  target: ReservationMoveTarget,
  allowCartATransitionScheduling = false,
  now = new Date(),
):
  | { ok: true; reservation: Reservation }
  | { ok: false; error: string } {
  const current = reservations.find((item) => item.id === reservationId);
  if (!current) return { ok: false, error: "O agendamento selecionado não está mais disponível." };
  if (current.kind !== "Aula") {
    return { ok: false, error: "Somente aulas podem ser movidas pelo Acesso Rápido." };
  }
  if (isReservationMoveInPast(current, now) || isReservationMoveInPast(target, now)) {
    return { ok: false, error: pastMoveError };
  }
  if (target.cart === "Reservas") {
    return { ok: false, error: "Agendamentos de aula não podem ser movidos para Reservas." };
  }
  if (
    current.date === target.date &&
    current.start === target.start &&
    current.end === target.end &&
    current.cart === target.cart &&
    current.period === target.period
  ) {
    return { ok: false, error: "O agendamento já está nesse horário e carrinho." };
  }

  const moved = { ...current, ...target };
  if (isCartTransitionConflict(moved, allowCartATransitionScheduling)) {
    return { ok: false, error: "Esse horário está bloqueado para a transição entre turnos." };
  }
  if (
    reservations.some(
      (item) => item.id !== reservationId && reservationsOverlap(item, moved),
    )
  ) {
    return { ok: false, error: "Já existe um agendamento para esse carrinho nesse horário." };
  }
  return { ok: true, reservation: moved };
}

export function prepareQuickAccessCartMove(
  reservations: Reservation[],
  reservationIds: number[],
  targetCart: string,
  allowCartATransitionScheduling = false,
  now = new Date(),
):
  | { ok: true; reservations: Reservation[] }
  | { ok: false; error: string } {
  const ids = [...new Set(reservationIds)];
  if (ids.length === 0) {
    return { ok: false, error: "Selecione pelo menos uma aula para mover." };
  }
  if (targetCart === "Reservas") {
    return { ok: false, error: "Aulas não podem ser movidas para Reservas." };
  }
  const selected = ids.map((id) => reservations.find((item) => item.id === id));
  if (selected.some((item): item is undefined => item === undefined)) {
    return { ok: false, error: "Uma das aulas selecionadas não está mais disponível." };
  }
  const current = selected.filter((item): item is Reservation => item !== undefined);
  if (current.some((item) => item.kind !== "Aula")) {
    return { ok: false, error: "Somente aulas podem ser movidas pelo Acesso Rápido." };
  }
  if (current.some((item) => isReservationMoveInPast(item, now))) {
    return { ok: false, error: pastMoveError };
  }
  if (current.every((item) => item.cart === targetCart)) {
    return { ok: false, error: "As aulas selecionadas já estão nesse carrinho." };
  }

  const moved = current.map((item) => ({ ...item, cart: targetCart }));
  if (moved.some((item) => isCartTransitionConflict(item, allowCartATransitionScheduling))) {
    return { ok: false, error: "Esse horário está bloqueado para a transição entre turnos." };
  }
  const movingIds = new Set(ids);
  const hasExternalConflict = moved.some((item) =>
    reservations.some(
      (other) => !movingIds.has(other.id) && reservationsOverlap(other, item),
    ),
  );
  const hasInternalConflict = moved.some((item, index) =>
    moved.slice(index + 1).some((other) => reservationsOverlap(item, other)),
  );
  if (hasExternalConflict || hasInternalConflict) {
    return {
      ok: false,
      error: "Um ou mais horários já estão ocupados no carrinho de destino.",
    };
  }
  return { ok: true, reservations: moved };
}

export const completeViewColumns = [
  { key: "id", label: "ID da reserva", group: "Reserva", defaultVisible: false },
  { key: "date", label: "Data", group: "Reserva", defaultVisible: true },
  { key: "time", label: "Horário", group: "Reserva", defaultVisible: true },
  { key: "cart", label: "Carrinho", group: "Reserva", defaultVisible: true },
  { key: "className", label: "Turma", group: "Reserva", defaultVisible: true },
  { key: "teacher", label: "Professor", group: "Reserva", defaultVisible: true },
  { key: "room", label: "Sala", group: "Reserva", defaultVisible: true },
  { key: "segment", label: "Segmento", group: "Detalhes da aula", defaultVisible: false },
  { key: "subject", label: "Disciplina", group: "Detalhes da aula", defaultVisible: false },
  { key: "period", label: "Período", group: "Detalhes da aula", defaultVisible: false },
  { key: "kind", label: "Tipo", group: "Detalhes da aula", defaultVisible: false },
  { key: "quantity", label: "Quantidade", group: "Detalhes da aula", defaultVisible: false },
  { key: "reservedChromebooks", label: "Chromebooks reservados", group: "Detalhes da aula", defaultVisible: false },
  { key: "reservationStatus", label: "Status da reserva", group: "Acompanhamento", defaultVisible: true },
  { key: "movementStatus", label: "Movimentação", group: "Acompanhamento", defaultVisible: true },
  { key: "movedBy", label: "Movido por", group: "Acompanhamento", defaultVisible: false },
  { key: "completedBy", label: "Concluído por", group: "Acompanhamento", defaultVisible: false },
  { key: "requestCount", label: "Solicitou novamente", group: "Acompanhamento", defaultVisible: false },
  { key: "notReceived", label: "Não recebeu", group: "Acompanhamento", defaultVisible: false },
  { key: "movedAt", label: "Movido em", group: "Horários da movimentação", defaultVisible: false },
  { key: "completedAt", label: "Concluído em", group: "Horários da movimentação", defaultVisible: false },
  { key: "autoCompleted", label: "Concluído automaticamente", group: "Horários da movimentação", defaultVisible: false },
  { key: "movedLate", label: "Movimentação atrasada", group: "Horários da movimentação", defaultVisible: false },
  { key: "notAttendedAt", label: "Não atendida em", group: "Horários da movimentação", defaultVisible: false },
  { key: "confirmedBy", label: "Confirmado por", group: "Horários da movimentação", defaultVisible: false },
  { key: "confirmedAt", label: "Confirmado em", group: "Horários da movimentação", defaultVisible: false },
  { key: "updatedAt", label: "Atualizado em", group: "Horários da movimentação", defaultVisible: false },
] as const;

export type CompleteViewColumnKey = (typeof completeViewColumns)[number]["key"];

export const defaultCompleteViewColumns = completeViewColumns
  .filter((column) => column.defaultVisible)
  .map((column) => column.key);

export function getVisibleCompleteViewColumns(value: unknown): CompleteViewColumnKey[] {
  if (!Array.isArray(value)) return [...defaultCompleteViewColumns];
  const knownKeys = new Set<string>(completeViewColumns.map(({ key }) => key));
  const selected = value.filter(
    (key): key is CompleteViewColumnKey =>
      typeof key === "string" && knownKeys.has(key),
  );
  return selected.length > 0 ? [...new Set(selected)] : [...defaultCompleteViewColumns];
}

export function getCompleteViewCartNames(
  reservations: Pick<Reservation, "cart">[],
): string[] {
  const standardCarts = ["Carrinho A", "Carrinho B", "Carrinho C"];
  const additionalCarts = [...new Set(reservations.map(({ cart }) => cart))]
    .filter((cart) => !standardCarts.includes(cart))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  return [...standardCarts, ...additionalCarts];
}

export function filterReservationsByCart<T extends Pick<Reservation, "cart">>(
  reservations: T[],
  cartName: string,
): T[] {
  if (cartName === allReservationsTab) return reservations;
  return reservations.filter((reservation) => reservation.cart === cartName);
}

export function filterReservationsByPeriod<T extends Pick<Reservation, "period">>(
  reservations: T[],
  period: ReservationPeriodFilter,
): T[] {
  return period === "Todos"
    ? reservations
    : reservations.filter((reservation) => reservation.period === period);
}

export function getMondayOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
}

export function getWeekDates(weekStart: Date): Date[] {
  const monday = getMondayOfWeek(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function getCartScheduleRows(
  cartName: string,
  date: string,
  slots: CartScheduleSlot[],
  reservations: Reservation[],
): Array<{ start: string; end: string; reservations: Reservation[] }> {
  const matching = reservations.filter(
    (reservation) => reservation.date === date && reservation.cart === cartName,
  );
  const slotRows = slots.map((slot) => ({
    start: slot.start,
    end: slot.end,
    reservations: matching.filter(
      (reservation) => reservation.start === slot.start,
    ),
  }));
  const configuredStarts = new Set(slots.map((slot) => slot.start));
  const unconfiguredRows = matching
    .filter((reservation) => !configuredStarts.has(reservation.start))
    .map((reservation) => ({
      start: reservation.start,
      end: reservation.end,
      reservations: [reservation],
    }));

  return [...slotRows, ...unconfiguredRows].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
