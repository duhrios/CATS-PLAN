import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  List,
  Table2,
  Eye,
  RotateCcw,
  GripVertical,
  Lightbulb,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { Button, PageHeader, StatusPill } from "@/components/app-ui";
import {
  type Cart,
  type CartMovement,
  type Reservation,
  useCampusData,
} from "@/lib/campus-data";
import { useRoomDirectory } from "@/lib/room-directory";
import {
  loadSharedReservations,
  requestSharedReservationsRefresh,
  moveSharedReservationsToCart,
  saveSharedReservation,
} from "@/lib/reservations-api";
import {
  allReservationsTab,
  completeViewColumns,
  defaultCompleteViewColumns,
  filterReservationsByCart,
  filterReservationsByPeriod,
  getVisibleCompleteViewColumns,
  getCompleteViewCartNames,
  getFloorOptimizationSuggestions,
  formatDateKey,
  getCartScheduleRows,
  getMondayOfWeek,
  getWeekDates,
  prepareQuickAccessCartMove,
  prepareQuickAccessMove,
  type CompleteViewColumnKey,
} from "@/lib/spreadsheet-view";
import { loadTeacherSpreadsheetReservations } from "@/lib/teacher-spreadsheet";

type SpreadsheetMode = "quick" | "complete";
type PeriodFilter = "Todos" | "Manhã" | "Tarde";

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const completeColumnsStorageKey = "controle-carrinhos-complete-view-columns";
const completeCartStorageKey = "controle-carrinhos-complete-view-cart";

function formatWeekLabel(dates: Date[]) {
  if (dates.length === 0) return "";
  return `${dateFormatter.format(dates[0])} – ${dateFormatter.format(dates.at(-1)!)}`;
}

function sortCartNames(names: string[]) {
  return [...new Set(names)].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  );
}

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("button, input, select, textarea, a, [contenteditable='true']"));

function QuickAccess({
  dates,
  cartNames,
  reservations,
  cartSchedules,
  unavailableCartNames,
  allowCartATransitionScheduling,
  onMoveReservation,
  onMoveReservations,
  onUndoReservations,
  periodFilter,
  readOnly,
}: {
  dates: Date[];
  cartNames: string[];
  reservations: Reservation[];
  cartSchedules: ReturnType<typeof useCampusData>["cartSchedules"];
  unavailableCartNames: string[];
  allowCartATransitionScheduling: boolean;
  onMoveReservation: (reservation: Reservation) => Promise<void>;
  onMoveReservations: (reservations: Reservation[]) => Promise<void>;
  onUndoReservations: (reservations: Reservation[]) => Promise<void>;
  periodFilter: PeriodFilter;
  readOnly: boolean;
}) {
  const [selectedReservationIds, setSelectedReservationIds] = useState<number[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [cartDropTarget, setCartDropTarget] = useState<string | null>(null);
  const [movingReservationIds, setMovingReservationIds] = useState<number[]>([]);
  const [moveError, setMoveError] = useState("");
  const [moveMessage, setMoveMessage] = useState("");
  const [undoStack, setUndoStack] = useState<Reservation[][]>([]);
  const [undoing, setUndoing] = useState(false);
  const undoMove = useCallback(async () => {
    const previousReservations = undoStack.at(-1);
    if (!previousReservations || undoing) return;
    setUndoing(true);
    setMoveError("");
    try {
      await onUndoReservations(previousReservations);
      setUndoStack((stack) => stack.slice(0, -1));
      setSelectedReservationIds([]);
      setMoveMessage("Última mudança de carrinho desfeita.");
    } catch (error) {
      setMoveError(
        error instanceof Error ? error.message : "Não foi possível desfazer a mudança.",
      );
    } finally {
      setUndoing(false);
    }
  }, [onUndoReservations, undoStack, undoing]);
  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z" ||
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }
      if (undoStack.length === 0 || undoing) return;
      event.preventDefault();
      void undoMove();
    };
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoMove]);
  const moveToSlot = async (
    event: DragEvent<HTMLDivElement>,
    target: {
      date: string;
      cart: string;
      start: string;
      end: string;
      period: "Manhã" | "Tarde";
    },
  ) => {
    event.preventDefault();
    setDropTarget(null);
    if (isInteractiveTarget(event.target)) return;
    const transferIds = event.dataTransfer.getData("text/plain")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const reservationIds = transferIds.length > 0 ? transferIds : selectedReservationIds;
    if (reservationIds.length === 0) {
      setMoveError("Selecione e arraste uma aula para um horário disponível.");
      return;
    }
    if (reservationIds.length > 1) {
      setMoveError("Para mover várias aulas sem alterar os horários, arraste a seleção até o nome do carrinho.");
      setMoveMessage("");
      return;
    }
    if (unavailableCartNames.includes(target.cart)) {
      setMoveError(`${target.cart} está indisponível e não pode receber agendamentos.`);
      return;
    }
    const result = prepareQuickAccessMove(
      reservations,
      reservationIds[0],
      target,
      allowCartATransitionScheduling,
    );
    if (!result.ok) {
      setMoveError(result.error);
      setMoveMessage("");
      return;
    }

    setMoveError("");
    setMoveMessage("");
    setMovingReservationIds(reservationIds);
    const previousReservations = reservations.filter(({ id }) => reservationIds.includes(id));
    try {
      await onMoveReservation(result.reservation);
      setUndoStack((stack) => [...stack, previousReservations]);
      setSelectedReservationIds([]);
      setMoveMessage("Agendamento movido e salvo na agenda compartilhada.");
    } catch (error) {
      setMoveError(
        error instanceof Error
          ? error.message
          : "Não foi possível mover o agendamento.",
      );
    } finally {
      setMovingReservationIds([]);
    }
  };
  const moveSelectionToCart = async (
    event: DragEvent<HTMLHeadingElement>,
    targetCart: string,
  ) => {
    event.preventDefault();
    setCartDropTarget(null);
    if (unavailableCartNames.includes(targetCart)) {
      setMoveError(`${targetCart} está indisponível e não pode receber agendamentos.`);
      setMoveMessage("");
      return;
    }
    const transferIds = event.dataTransfer.getData("text/plain")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const reservationIds = transferIds.length > 0 ? transferIds : selectedReservationIds;
    const result = prepareQuickAccessCartMove(
      reservations,
      reservationIds,
      targetCart,
      allowCartATransitionScheduling,
    );
    if (!result.ok) {
      setMoveError(result.error);
      setMoveMessage("");
      return;
    }

    setMoveError("");
    setMoveMessage("");
    setMovingReservationIds(reservationIds);
    const previousReservations = reservations.filter(({ id }) => reservationIds.includes(id));
    try {
      await onMoveReservations(result.reservations);
      setUndoStack((stack) => [...stack, previousReservations]);
      setSelectedReservationIds([]);
      setMoveMessage(
        `${result.reservations.length} ${result.reservations.length === 1 ? "aula movida" : "aulas movidas"} para ${targetCart}; os horários foram mantidos.`,
      );
    } catch (error) {
      setMoveError(
        error instanceof Error
          ? error.message
          : "Não foi possível mover as aulas selecionadas.",
      );
    } finally {
      setMovingReservationIds([]);
    }
  };

  return (
    <section aria-label="Acesso rápido em formato de planilha">
      {!readOnly && <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {selectedReservationIds.length > 0 && (
          <p className="text-xs font-semibold text-[#345779]" role="status">
            {selectedReservationIds.length} aula(s) selecionada(s)
          </p>
        )}
      </div>}
      {!readOnly && (moveError || moveMessage) && (
        <p
          role={moveError ? "alert" : "status"}
          className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
            moveError
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {moveError || moveMessage}
        </p>
      )}
      {!readOnly && undoStack.length > 0 && (
        <button
          type="button"
          disabled={undoing || movingReservationIds.length > 0}
          onClick={() => void undoMove()}
          className="mb-3 rounded-lg border border-[#9baec4] bg-white px-3 py-1.5 text-xs font-semibold text-[#263950] hover:bg-[#f0f3f6] disabled:opacity-50"
        >
          Desfazer última mudança (Ctrl+Z)
        </button>
      )}
      <div className="overflow-x-auto rounded-2xl border border-[#a9b7c8] bg-[#eef3f8] shadow-sm">
        <div className="grid min-w-[3400px] grid-cols-5 gap-px bg-[#a9b7c8]">
          {dates.map((date) => {
            const dateKey = formatDateKey(date);
            const dayReservations = reservations.filter(
              (reservation) => reservation.date === dateKey,
            );
            return (
              <article key={dateKey} className="min-w-0 bg-white">
                <header className="border-b border-[#9baec4] bg-[#dce7f3] px-3 py-2 text-center text-sm font-bold capitalize text-[#142e50]">
                  {weekdayFormatter.format(date)}
                  <span className="mt-0.5 block font-mono text-xs font-semibold">
                    {dateFormatter.format(date)}
                  </span>
                </header>
                <div className="grid min-w-[650px] grid-cols-3 gap-1.5 p-2">
                  {cartNames.map((cartName, cartIndex) => {
                    const schedule = cartSchedules[cartName];
                    const periods: Array<"Manhã" | "Tarde"> =
                      periodFilter === "Todos" ? ["Manhã", "Tarde"] : [periodFilter];
                    return (
                      <section
                        key={cartName}
                        className="min-w-0 overflow-hidden border border-[#9daabd] bg-white"
                      >
                        <h2
                          onDragOver={!readOnly ? (event) => {
                            if (isInteractiveTarget(event.target)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setCartDropTarget(`${dateKey}-${cartName}`);
                          } : undefined}
                          onDragLeave={!readOnly ? (event) => {
                            if (event.currentTarget === event.target) setCartDropTarget(null);
                          } : undefined}
                          onDrop={!readOnly ? (event) => {
                            if (isInteractiveTarget(event.target)) return;
                            void moveSelectionToCart(event, cartName);
                          } : undefined}
                          title={!readOnly ? "Solte aqui para mover a seleção para este carrinho mantendo os horários" : undefined}
                          className={`border-b border-[#9daabd] px-2 py-1.5 text-center text-xs font-bold ${
                            cartIndex % 2 === 0
                              ? "bg-[#d8e7d3] text-[#244421]"
                              : "bg-[#dce5f2] text-[#1d3a5d]"
                          } ${cartDropTarget === `${dateKey}-${cartName}` ? "bg-emerald-200 outline outline-2 outline-emerald-600" : ""}`}
                        >
                          {cartName}
                        </h2>
                        {periods.map((period) => {
                          const slots = (schedule?.[period] ?? []).map((slot) => ({
                            ...slot,
                            period,
                          }));
                          const periodReservations = filterReservationsByPeriod(dayReservations, period);
                          const rows = getCartScheduleRows(
                            cartName,
                            dateKey,
                            slots,
                            periodReservations,
                          );
                          return (
                            <div key={`${cartName}-${period}`}>
                              {periodFilter === "Todos" && (
                                <div className={`border-b border-[#b9c4d1] px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide ${period === "Manhã" ? "bg-[#edf4ea] text-[#36552f]" : "bg-[#f4efe4] text-[#765b2f]"}`}>
                                  {period}
                                </div>
                              )}
                              <div className="grid grid-cols-[84px_minmax(0,1fr)] border-b border-[#b9c4d1] bg-[#f0f3f6] text-[10px] font-bold text-[#34445a]">
                                <span className="border-r border-[#b9c4d1] px-1 py-1">Horário</span>
                                <span className="px-1.5 py-1">Turma · Professor</span>
                              </div>
                              {rows.length === 0 ? (
                                <div className="grid grid-cols-[84px_minmax(0,1fr)] text-[11px] text-slate-500">
                                  <span className="border-r border-[#d5dce5] px-1 py-2">—</span>
                                  <span className="px-1.5 py-2">Sem horários</span>
                                </div>
                              ) : rows.map((row, rowIndex) => {
                            const slot = slots.find(
                              (item) => item.start === row.start && item.end === row.end,
                            );
                            const targetKey = `${dateKey}-${cartName}-${period}-${row.start}-${row.end}`;
                            const isDropTarget = dropTarget === targetKey;
                            return (
                              <div
                                key={`${cartName}-${dateKey}-${row.start}-${rowIndex}`}
                                onDragOver={!readOnly ? (event) => {
                                  if (!slot || isInteractiveTarget(event.target)) return;
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = "move";
                                  setDropTarget(targetKey);
                                } : undefined}
                                onDragLeave={!readOnly ? (event) => {
                                  if (event.currentTarget === event.target) setDropTarget(null);
                                } : undefined}
                                onDrop={!readOnly ? (event) => {
                                  if (!slot) return;
                                  void moveToSlot(event, {
                                    date: dateKey,
                                    cart: cartName,
                                    start: slot.start,
                                    end: slot.end,
                                    period: slot.period,
                                  });
                                } : undefined}
                                className={`grid grid-cols-[84px_minmax(0,1fr)] border-b border-[#d5dce5] text-[11px] last:border-b-0 ${
                                  slot ? "transition-colors" : ""
                                } ${
                                  isDropTarget
                                    ? "bg-[#d9ead3] outline outline-2 -outline-offset-2 outline-[#54804c]"
                                    : ""
                                }`}
                              >
                              <span className="whitespace-nowrap border-r border-[#d5dce5] bg-[#f8fafc] px-1 py-1.5 font-mono text-[10px] font-semibold text-[#263950]">
                                {row.start}–{row.end}
                              </span>
                              <div className="min-w-0 px-1.5 py-1">
                                {row.reservations.length === 0 ? (
                                  <span className="text-slate-300">—</span>
                                ) : (
                                  row.reservations.map((reservation) => (
                                    <div
                                      key={reservation.id}
                                      role={!readOnly ? "button" : undefined}
                                      tabIndex={!readOnly ? 0 : undefined}
                                      aria-pressed={!readOnly ? selectedReservationIds.includes(reservation.id) : undefined}
                                      draggable={!readOnly ? reservation.kind === "Aula" && movingReservationIds.length === 0 : undefined}
                                      title={readOnly ? undefined : reservation.kind === "Aula" ? "Clique para selecionar; segure Ctrl ao clicar para selecionar várias. Arraste para um horário ou para o nome de outro carrinho." : "Reservas de Chromebooks não podem ser movidas por esta tela"}
                                      onClick={!readOnly ? (event) => {
                                        if (isInteractiveTarget(event.target)) return;
                                        if (event.ctrlKey || event.metaKey) {
                                          event.preventDefault();
                                          setSelectedReservationIds((current) =>
                                            current.includes(reservation.id)
                                              ? current.filter((id) => id !== reservation.id)
                                              : [...current, reservation.id],
                                          );
                                        } else {
                                          setSelectedReservationIds([reservation.id]);
                                        }
                                        setMoveError("");
                                        setMoveMessage("");
                                      } : undefined}
                                      onKeyDown={!readOnly ? (event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          setSelectedReservationIds([reservation.id]);
                                        }
                                      } : undefined}
                                      onDragStart={!readOnly ? (event) => {
                                        if (
                                          reservation.kind !== "Aula" ||
                                          isInteractiveTarget(event.target)
                                        ) {
                                          event.preventDefault();
                                          return;
                                        }
                                        event.dataTransfer.effectAllowed = "move";
                                        const dragIds = selectedReservationIds.includes(reservation.id)
                                          ? selectedReservationIds
                                          : [reservation.id];
                                        event.dataTransfer.setData("text/plain", dragIds.join(","));
                                        setSelectedReservationIds(dragIds);
                                        setMoveError("");
                                        setMoveMessage("");
                                      } : undefined}
                                      onDragEnd={!readOnly ? () => setDropTarget(null) : undefined}
                                      className={`my-0.5 rounded px-1 py-0.5 leading-4 ${
                                        !readOnly && reservation.kind === "Aula"
                                          ? "cursor-grab active:cursor-grabbing"
                                          : ""
                                      } ${
                                        selectedReservationIds.includes(reservation.id)
                                          ? "bg-[#e4edf8] outline outline-1 outline-[#7893b3]"
                                          : "hover:bg-[#f2f6fa]"
                                      } ${
                                        movingReservationIds.includes(reservation.id)
                                          ? "opacity-50"
                                          : ""
                                      }`}
                                    >
                                      <div className="flex items-start gap-1">
                                        {!readOnly && reservation.kind === "Aula" && (
                                          <GripVertical
                                            size={12}
                                            aria-hidden="true"
                                            className="mt-0.5 shrink-0 text-[#718198]"
                                          />
                                        )}
                                        <div className="min-w-0">
                                          <p className="truncate font-bold text-[#172d49]">
                                            {reservation.className}
                                          </p>
                                          <p className="truncate text-slate-600">
                                            {reservation.teacher}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                                </div>
                              </div>
                            );
                              })}
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                  {dayReservations.length === 0 && cartNames.length === 0 && (
                    <p className="p-4 text-center text-xs text-slate-500">
                      Sem reservas.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
        {readOnly
          ? "Visualização somente para consulta. São exibidos apenas carrinho, horário, turma e professor. Role horizontalmente para consultar os outros dias da semana."
          : "Esta visão mostra somente carrinho, horário, turma e professor. Selecione uma aula e arraste-a para outro horário. Para mover várias, mantenha Ctrl pressionado ao selecionar e arraste uma delas para o nome do carrinho de destino; os horários originais serão mantidos. A alteração só aparece como concluída depois de salva na agenda. Role horizontalmente para consultar os outros dias da semana."}
      </p>
    </section>
  );
}

function CompleteAccess({
  dates,
  reservations,
  movements,
  cartName,
  onCartChange,
  visibleColumns,
  onVisibleColumnsChange,
  periodFilter,
}: {
  dates: Date[];
  reservations: Reservation[];
  movements: ReturnType<typeof useCampusData>["movements"];
  cartName: string;
  onCartChange: (cartName: string) => void;
  visibleColumns: CompleteViewColumnKey[];
  onVisibleColumnsChange: (columns: CompleteViewColumnKey[]) => void;
  periodFilter: PeriodFilter;
}) {
  const dateKeys = new Set(dates.map(formatDateKey));
  const weekRows = reservations
    .filter((reservation) => dateKeys.has(reservation.date))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.cart.localeCompare(b.cart),
    );
  const cartNames = getCompleteViewCartNames(weekRows);
  const selectedCart =
    cartName === allReservationsTab
      ? allReservationsTab
      : cartNames.includes(cartName)
        ? cartName
        : cartNames[0] ?? "Carrinho A";
  const rows = filterReservationsByPeriod(
    filterReservationsByCart(weekRows, selectedCart),
    periodFilter,
  );
  const movementById = new Map(
    movements.map((movement) => [movement.reservationId, movement]),
  );
  const visibleColumnDefinitions = completeViewColumns.filter(({ key }) =>
    visibleColumns.includes(key),
  );
  const visibleGroups = [...new Set(visibleColumnDefinitions.map(({ group }) => group))];
  const allGroups = [...new Set(completeViewColumns.map(({ group }) => group))];
  const completedCount = rows.filter(
    (reservation) => movementById.get(reservation.id)?.status === "Concluído",
  ).length;
  const pendingCount = rows.filter((reservation) => {
    const status = movementById.get(reservation.id)?.status;
    return !status || status === "Não movido" || status === "Não atendida";
  }).length;

  const toggleColumn = (key: CompleteViewColumnKey) => {
    const nextColumns = visibleColumns.includes(key)
      ? visibleColumns.filter((column) => column !== key)
      : completeViewColumns
          .filter(({ key: columnKey }) =>
            columnKey === key || visibleColumns.includes(columnKey),
          )
          .map(({ key: columnKey }) => columnKey);
    if (nextColumns.length > 0) onVisibleColumnsChange(nextColumns);
  };
  const toggleGroup = (group: string) => {
    const groupKeys = completeViewColumns
      .filter((column) => column.group === group)
      .map(({ key }) => key);
    const groupIsVisible = groupKeys.some((key) => visibleColumns.includes(key));
    const next = groupIsVisible
      ? visibleColumns.filter((key) => !groupKeys.includes(key))
      : completeViewColumns
          .filter(({ key }) => groupKeys.includes(key) || visibleColumns.includes(key))
          .map(({ key }) => key);
    if (next.length > 0) onVisibleColumnsChange(next);
  };
  const renderCell = (
    key: CompleteViewColumnKey,
    reservation: Reservation,
    movement: CartMovement | undefined,
  ) => {
    const formatTimestamp = (timestamp?: string) =>
      timestamp ? timeFormatter.format(new Date(timestamp)) : "—";
    switch (key) {
      case "id": return <span className="font-mono font-semibold">{reservation.id}</span>;
      case "date": return dateFormatter.format(new Date(`${reservation.date}T12:00:00`));
      case "time": return <span className="font-mono">{reservation.start}–{reservation.end}</span>;
      case "cart": return <span className="font-semibold">{reservation.cart}</span>;
      case "className": return reservation.className;
      case "teacher": return reservation.teacher;
      case "room": return reservation.room;
      case "segment": return reservation.segment;
      case "subject": return reservation.subject || "—";
      case "period": return reservation.period;
      case "kind": return reservation.kind;
      case "quantity": return reservation.quantity;
      case "reservedChromebooks":
        return <span className="block max-w-64 whitespace-normal">{reservation.reservedChromebooks?.join(", ") || "—"}</span>;
      case "reservationStatus": return <StatusPill status={reservation.status} />;
      case "movementStatus": return <StatusPill status={movement?.status ?? "Não movido"} />;
      case "movedBy": return movement?.movedBy ?? "—";
      case "completedBy": return movement?.completedBy ?? movement?.confirmedBy ?? "—";
      case "requestCount":
        return movement?.requestCount
          ? <span>{movement.requestCount} vez(es){movement.requestAgainAt && <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">{formatTimestamp(movement.requestAgainAt)}</span>}</span>
          : "—";
      case "notReceived":
        return movement?.notReceived
          ? <span className="font-semibold text-[hsl(var(--destructive))]">Sim · {formatTimestamp(movement.notReceivedAt)}</span>
          : "Não";
      case "movedAt": return formatTimestamp(movement?.movedAt);
      case "completedAt": return formatTimestamp(movement?.completedAt);
      case "autoCompleted": return movement?.autoCompleted ? "Sim" : "Não";
      case "movedLate": return movement?.movedLate ? "Sim" : "Não";
      case "notAttendedAt": return formatTimestamp(movement?.notAttendedAt);
      case "confirmedBy": return movement?.confirmedBy ?? "—";
      case "confirmedAt": return formatTimestamp(movement?.confirmedAt);
      case "updatedAt": return formatTimestamp(movement?.updatedAt);
    }
  };

  return (
    <section aria-label="Planilha completa" className="space-y-4">
      <div
        role="tablist"
        aria-label="Filtrar agendamentos"
        className="flex flex-wrap gap-2 rounded-2xl border border-[#a9b7c8] bg-[#eef3f8] p-3"
      >
        {[allReservationsTab, ...cartNames].map((name, index) => {
          const cartCount =
            name === allReservationsTab
              ? weekRows.length
              : filterReservationsByCart(weekRows, name).length;
          const selected = selectedCart === name;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onCartChange(name)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                selected
                  ? "border-[#345779] bg-[#345779] text-white shadow-sm"
                  : "border-[#c0ccda] bg-white text-[#31465f] hover:bg-[#f5f8fb]"
              }`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${selected ? "bg-white/15" : index === 0 ? "bg-slate-200 text-slate-700" : index % 3 === 1 ? "bg-blue-100 text-blue-800" : index % 3 === 2 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {name === allReservationsTab ? "∑" : name === "Reservas" ? "R" : name.match(/Carrinho\s+(.+)$/i)?.[1] ?? name.slice(0, 1)}
              </span>
              {name}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${selected ? "bg-white/15" : "bg-[#edf2f7]"}`}>{cartCount}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Agendamentos · {selectedCart}</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(var(--foreground))]">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Movimentações concluídas</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(var(--primary))]">{completedCount}</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Aguardando movimentação</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(34_60%_32%)]">{pendingCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><Eye size={18} /></span>
          <div>
            <p className="text-sm font-semibold">Campos exibidos</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{visibleColumns.length} de {completeViewColumns.length} colunas · preferência salva neste navegador</p>
          </div>
        </div>
        <details className="group relative">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-xs font-semibold marker:hidden hover:bg-[hsl(var(--muted))]">
            Personalizar colunas <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 z-30 mt-2 max-h-[min(70vh,560px)] w-[min(90vw,460px)] overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--border))] pb-3">
              <p className="text-sm font-semibold">Escolha o que visualizar</p>
              <div className="flex gap-2">
                <button type="button" aria-label="Ver todas as colunas" onClick={() => onVisibleColumnsChange(completeViewColumns.map(({ key }) => key))} className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">Ver todas</button>
                <button type="button" onClick={() => onVisibleColumnsChange([...defaultCompleteViewColumns])} className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><RotateCcw size={12} /> Padrão</button>
              </div>
            </div>
            <div className="space-y-3">
              {allGroups.map((group) => {
                  const groupColumns = completeViewColumns.filter((column) => column.group === group);
                  const selectedCount = groupColumns.filter(({ key }) => visibleColumns.includes(key)).length;
                  return (
                    <fieldset key={group} className="rounded-lg border border-[hsl(var(--border))] p-3">
                      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group}</legend>
                      <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-[hsl(var(--border))] pb-2 text-xs font-semibold">
                        <input type="checkbox" checked={selectedCount === groupColumns.length} disabled={selectedCount === groupColumns.length && visibleColumns.length === groupColumns.length} ref={(element) => { if (element) element.indeterminate = selectedCount > 0 && selectedCount < groupColumns.length; }} onChange={() => toggleGroup(group)} className="h-4 w-4 accent-[hsl(var(--primary))] disabled:opacity-50" />
                        Selecionar grupo
                      </label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {groupColumns.map(({ key, label }) => (
                          <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-[hsl(var(--foreground))]">
                            <input type="checkbox" checked={visibleColumns.includes(key)} disabled={visibleColumns.length === 1 && visibleColumns.includes(key)} onChange={() => toggleColumn(key)} className="h-4 w-4 accent-[hsl(var(--primary))] disabled:opacity-50" />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
            </div>
            <p className="mt-3 text-[11px] text-[hsl(var(--muted-foreground))]">Mantenha ao menos uma coluna visível. A configuração fica salva apenas neste navegador.</p>
          </div>
        </details>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Não há agendamentos para {selectedCart} nesta semana.
        </div>
      ) : <div className="overflow-x-auto rounded-2xl border border-[#a9b7c8] bg-[#eef3f8] shadow-sm">
        <table className="w-full min-w-[920px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="bg-[#345779] text-left text-white">
              {visibleGroups.map((group) => (
                <th key={group} colSpan={visibleColumnDefinitions.filter((column) => column.group === group).length} className="border-r border-white/20 px-2 py-1.5 text-[9px] font-bold uppercase tracking-[.12em] last:border-r-0">{group}</th>
              ))}
            </tr>
            <tr className="bg-[#e8eef6] text-[#173252]">
              {visibleColumnDefinitions.map(({ key, label }) => (
                <th key={key} scope="col" className="whitespace-nowrap border-b border-r border-[#c4d0df] px-2 py-2 font-bold last:border-r-0">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(periodFilter === "Todos" ? ["Manhã", "Tarde"] as const : [periodFilter]).map((period) => {
              const periodRows = rows.filter((reservation) => reservation.period === period);
              if (periodRows.length === 0) return null;
              return (
                <Fragment key={period}>
                  {periodFilter === "Todos" && (
                    <tr className={`border-y border-[#c4d0df] ${period === "Manhã" ? "bg-[#edf4ea] text-[#36552f]" : "bg-[#f4efe4] text-[#765b2f]"}`}>
                      <th colSpan={visibleColumnDefinitions.length} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider">
                        Período da {period.toLocaleLowerCase("pt-BR")}
                      </th>
                    </tr>
                  )}
                  {periodRows.map((reservation, index) => {
                    const movement = movementById.get(reservation.id);
                    return (
                      <tr key={reservation.id} className={`border-b border-[#d5dce5] align-top text-[#25364a] last:border-b-0 hover:bg-[#edf4fa] ${index % 2 === 1 ? "bg-[#f7f9fb]" : "bg-white"}`}>
                        {visibleColumnDefinitions.map(({ key }) => (
                          <td key={key} className="max-w-72 whitespace-nowrap border-r border-[#e0e5eb] px-2 py-2 last:border-r-0">{renderCell(key, reservation, movement)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Mostrando {rows.length} agendamentos {selectedCart === allReservationsTab ? "de todos os carrinhos" : `de ${selectedCart}`} · use “Ver todas” no seletor de colunas para exibir todos os campos.</p>
    </section>
  );
}

export function SpreadsheetViewPage({ readOnly = false }: { readOnly?: boolean }) {
  const {
    reservations,
    movements,
    carts,
    cartSchedules,
    movementSettings,
    replaceReservations,
  } = useCampusData();
  const { floorForRoom } = useRoomDirectory();
  const [mode, setMode] = useState<SpreadsheetMode>(() => readOnly ? "quick" : "complete");
  const [teacherReservations, setTeacherReservations] = useState<Reservation[]>([]);
  const [teacherReservationsLoading, setTeacherReservationsLoading] = useState(readOnly);
  const [teacherReservationsError, setTeacherReservationsError] = useState("");
  const [selectedCompleteCart, setSelectedCompleteCart] = useState(() => {
    try {
      return window.localStorage.getItem(completeCartStorageKey) ?? "Carrinho A";
    } catch {
      return "Carrinho A";
    }
  });
  const [visibleColumns, setVisibleColumns] = useState<CompleteViewColumnKey[]>(() => {
    try {
      const saved = window.localStorage.getItem(completeColumnsStorageKey);
      return saved
        ? getVisibleCompleteViewColumns(JSON.parse(saved))
        : [...defaultCompleteViewColumns];
    } catch {
      return [...defaultCompleteViewColumns];
    }
  });
  const [selectedDate, setSelectedDate] = useState(() =>
    getMondayOfWeek(new Date()),
  );
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("Todos");
  const weekStart = getMondayOfWeek(selectedDate);
  const weekDates = getWeekDates(weekStart);
  const workWeekDates = weekDates.slice(0, 5);
  const teacherFrom = formatDateKey(workWeekDates[0]);
  const teacherTo = formatDateKey(workWeekDates.at(-1)!);
  const visibleReservations = readOnly ? teacherReservations : reservations;
  const floorSuggestions = getFloorOptimizationSuggestions(
    visibleReservations,
    floorForRoom,
    workWeekDates.map(formatDateKey),
  );
  useEffect(() => {
    if (!readOnly) return;
    let active = true;
    const refreshTeacherReservations = () => {
      setTeacherReservationsLoading(true);
      void loadTeacherSpreadsheetReservations(teacherFrom, teacherTo)
        .then((items) => {
          if (!active) return;
          setTeacherReservations(items);
          setTeacherReservationsError("");
        })
        .catch((error: unknown) => {
          if (!active) return;
          setTeacherReservations([]);
          setTeacherReservationsError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a planilha de visualização.",
          );
        })
        .finally(() => {
          if (active) setTeacherReservationsLoading(false);
        });
    };
    refreshTeacherReservations();
    const interval = window.setInterval(refreshTeacherReservations, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [readOnly, teacherFrom, teacherTo]);
  const cartNames = useMemo(
    () =>
      sortCartNames([
        ...carts.map((cart) => cart.name),
        ...visibleReservations.map((reservation) => reservation.cart),
      ]),
    [carts, visibleReservations],
  );

  const moveWeek = (amount: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + amount * 7);
    setSelectedDate(next);
  };
  const saveVisibleColumns = (columns: CompleteViewColumnKey[]) => {
    setVisibleColumns(columns);
    window.localStorage.setItem(completeColumnsStorageKey, JSON.stringify(columns));
  };
  const selectCompleteCart = (cartName: string) => {
    setSelectedCompleteCart(cartName);
    window.localStorage.setItem(completeCartStorageKey, cartName);
  };
  const moveReservation = async (reservation: Reservation) => {
    if (readOnly) throw new Error("A visualização da planilha é somente para consulta.");
    const { id, status: _status, ...data } = reservation;
    await saveSharedReservation(data, id);
    const synchronizedReservations = await loadSharedReservations().catch(() => null);
    if (synchronizedReservations) {
      replaceReservations(synchronizedReservations);
    } else {
      replaceReservations(
        reservations.map((current) =>
          current.id === id ? reservation : current,
        ),
      );
      void requestSharedReservationsRefresh();
    }
  };
  const moveReservationsToCart = async (movedReservations: Reservation[]) => {
    if (readOnly) throw new Error("A visualização da planilha é somente para consulta.");
    if (movedReservations.length === 0) return;
    try {
      await moveSharedReservationsToCart(movedReservations);
    } catch (error) {
      const synchronizedReservations = await loadSharedReservations().catch(() => null);
      if (synchronizedReservations) {
        replaceReservations(synchronizedReservations);
      } else {
        void requestSharedReservationsRefresh();
      }
      throw error;
    }
    const synchronizedReservations = await loadSharedReservations().catch(() => null);
    if (synchronizedReservations) {
      replaceReservations(synchronizedReservations);
      return;
    }
    const movedById = new Map(movedReservations.map((reservation) => [reservation.id, reservation]));
    replaceReservations(
      reservations.map((current) => movedById.get(current.id) ?? current),
    );
    void requestSharedReservationsRefresh();
  };

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        eyebrow={readOnly ? "Área do professor · Somente visualização" : "Área do TI e Administração"}
        title="Visão - Planilha"
        description={readOnly
          ? "Consulte a visão rápida semanal dos agendamentos. Não é possível editar ou mover aulas."
          : "Consulte, organize e mova os agendamentos em formato de planilha semanal."}
      />

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => moveWeek(-1)}
            aria-label="Semana anterior"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Semana anterior</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedDate(getMondayOfWeek(new Date()))}
          >
            <CalendarDays size={15} />
            Hoje
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => moveWeek(1)}
            aria-label="Próxima semana"
          >
            <span className="hidden sm:inline">Próxima semana</span>
            <ChevronRight size={16} />
          </Button>
          <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--foreground))]">
            Período
            <select
              aria-label="Filtrar planilha por período"
              value={periodFilter}
              onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
              className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-xs"
            >
              <option value="Todos">Manhã e tarde</option>
              <option value="Manhã">Manhã</option>
              <option value="Tarde">Tarde</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold capitalize text-[hsl(var(--foreground))]">
              {monthFormatter.format(weekStart)}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {formatWeekLabel(weekDates)}
            </p>
          </div>
          <input
            aria-label="Escolher semana pela data"
            type="date"
            value={formatDateKey(selectedDate)}
            onChange={(event) => {
              if (!event.target.value) return;
              setSelectedDate(
                getMondayOfWeek(new Date(`${event.target.value}T12:00:00`)),
              );
            }}
            className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-xs"
          />
        </div>
      </section>

      {!readOnly && <div
        role="tablist"
        aria-label="Modo de visualização da planilha"
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "quick"}
          onClick={() => setMode("quick")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
            mode === "quick"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
          }`}
        >
          <Table2 size={16} />
          Acesso Rápido
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "complete"}
          onClick={() => setMode("complete")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
            mode === "complete"
              ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
          }`}
        >
          <List size={16} />
          Acesso Completo
        </button>
      </div>}

      <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <FileSpreadsheet size={15} />
        {mode === "quick"
          ? "Layout inspirado na planilha enviada; somente carrinho, horário, turma e professor."
          : "Todos os campos disponíveis do agendamento e do acompanhamento do carrinho."}
      </div>

      {readOnly && teacherReservationsLoading ? (
        <p role="status" className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
          Carregando a visão rápida da planilha...
        </p>
      ) : readOnly && teacherReservationsError ? (
        <p role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm text-[hsl(var(--destructive))]">
          {teacherReservationsError}
        </p>
      ) : mode === "quick" ? (
        <QuickAccess
          dates={workWeekDates}
          cartNames={cartNames}
          reservations={visibleReservations}
          cartSchedules={cartSchedules}
          unavailableCartNames={carts.filter((cart: Cart) => cart.unavailable).map((cart: Cart) => cart.name)}
          allowCartATransitionScheduling={movementSettings.allowCartATransitionScheduling}
          onMoveReservation={moveReservation}
          onMoveReservations={moveReservationsToCart}
          onUndoReservations={moveReservationsToCart}
          periodFilter={periodFilter}
          readOnly={readOnly}
        />
      ) : (
        <CompleteAccess
          dates={weekDates}
          reservations={visibleReservations}
          movements={movements}
          cartName={selectedCompleteCart}
          onCartChange={selectCompleteCart}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={saveVisibleColumns}
          periodFilter={periodFilter}
        />
      )}

      {!readOnly && floorSuggestions.length > 0 && (
        <section
          aria-label="Sugestões de otimização por piso"
          className="overflow-hidden rounded-2xl border border-[#c6d2df] bg-white shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-[#d8e0e8] bg-[#eef3f8] px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#dce7f3] text-[#345779]">
              <Lightbulb size={17} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#173252]">Otimização por piso</h2>
              <p className="text-xs text-[#5f6f82]">Sugestões para aulas futuras desta semana</p>
            </div>
          </div>
          <div className="divide-y divide-[#e0e5eb]">
            {floorSuggestions.slice(0, 5).map(({ current, previous, floor }) => (
              <div
                key={current.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#25364a]">
                    {current.date} · {current.start} · {current.room} ({floor})
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#68788b]">
                    {previous.cart} já estará no mesmo piso às {previous.start} em {previous.room}.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f6edda] px-3 py-1 text-[11px] font-bold text-[#765420]">
                  Sugestão: {previous.cart}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => moveWeek(-1)}>
          <ArrowLeft size={15} />
          Semana anterior
        </Button>
        <Button variant="ghost" size="sm" onClick={() => moveWeek(1)}>
          Próxima semana
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
