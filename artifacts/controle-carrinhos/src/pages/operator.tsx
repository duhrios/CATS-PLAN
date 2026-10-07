import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogIn,
  MoveRight,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Button,
  Field,
  PageHeader,
  SectionCard,
  StatusPill,
  inputClass,
  todayISO,
} from "@/components/app-ui";
import {
  isReservationInProgress,
  type CartMovement,
  type Reservation,
  useCampusData,
} from "@/lib/campus-data";
import { Calendar } from "@/components/ui/calendar";
import { useRoomDirectory } from "@/lib/room-directory";
import {
  getDueMovementNotifications,
  getDueRepeatedRoomClassReservations,
  getAlreadyInRoomReservationIds,
  getStaleRepeatedRoomClassMovementIds,
  repeatedLessonAutoCompleteActor,
} from "@/lib/movement-schedule";
import {
  getRememberedOperatorName,
  loginWithCredentials,
  rememberOperatorName,
} from "@/lib/auth-session";
import { isNewTeacherMovementRequest } from "@/lib/movement-notifications";
import {
  enableOperatorAudio,
  playOperatorAlert,
  subscribeToOperatorAudioErrors,
} from "@/lib/operator-audio";

export { playOperatorAlert } from "@/lib/operator-audio";

const operatorSettingsStorageKey = "controle-carrinhos-operator-settings";
export type OperatorSettings = {
  volume: number;
  vibration: boolean;
  tone: "classic" | "double" | "soft" | "custom";
  notificationMode: "selection" | "classic";
  customToneName: string;
  customToneUrl: string;
  alarmDurationSeconds: number;
};
const defaultOperatorSettings: OperatorSettings = {
  volume: 70,
  vibration: true,
  tone: "classic",
  notificationMode: "selection",
  customToneName: "",
  customToneUrl: "",
  alarmDurationSeconds: 5,
};
export const readOperatorSettings = (): OperatorSettings => {
  if (typeof window === "undefined") return defaultOperatorSettings;
  try {
    const saved = window.localStorage.getItem(operatorSettingsStorageKey);
    if (!saved) return defaultOperatorSettings;
    const parsed = JSON.parse(saved) as Partial<OperatorSettings>;
    return {
      ...defaultOperatorSettings,
      ...parsed,
      notificationMode:
        parsed.notificationMode === "classic" ? "classic" : "selection",
      alarmDurationSeconds: Math.max(
        5,
        Number(parsed.alarmDurationSeconds ?? 5),
      ),
    };
  } catch {
    return defaultOperatorSettings;
  }
};
type FutureFilter = "day" | "week" | "month" | "calendar";
const toLocalDate = (value: string) => new Date(`${value}T12:00:00`);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const startOfWeek = (value: Date) => {
  const date = new Date(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
};

function FutureReservations({
  reservations,
  movements,
  onViewChange,
}: {
  reservations: Reservation[];
  movements: ReturnType<typeof useCampusData>["movements"];
  onViewChange: (view: "pending" | "completed") => void;
}) {
  const [filter, setFilter] = useState<FutureFilter>("day");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = toLocalDate(todayISO());
  const futureReservations = reservations
    .filter((item) => item.kind === "Aula" && toLocalDate(item.date) > today)
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const filterDate = toLocalDate(
    selectedDate ?? futureReservations[0]?.date ?? todayISO(),
  );
  const visible = futureReservations.filter((item) => {
    const date = toLocalDate(item.date);
    if (filter === "day" || filter === "calendar")
      return item.date === isoDate(filterDate);
    if (filter === "week") {
      const start = startOfWeek(filterDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return date >= start && date < end;
    }
    return (
      date.getFullYear() === filterDate.getFullYear() &&
      date.getMonth() === filterDate.getMonth()
    );
  });
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-[hsl(var(--border))]">
        <button
          type="button"
          onClick={() => onViewChange("pending")}
          className="border-b-2 border-transparent px-1 pb-3 text-xs font-bold text-[hsl(var(--muted-foreground))]"
        >
          Para atender
        </button>
        <button
          type="button"
          onClick={() => onViewChange("completed")}
          className="border-b-2 border-transparent px-1 pb-3 text-xs font-bold text-[hsl(var(--muted-foreground))]"
        >
          Concluído
        </button>
        <span className="border-b-2 border-[hsl(var(--primary))] px-1 pb-3 text-xs font-bold text-[hsl(var(--primary))]">
          Futuras
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-[hsl(var(--border))] pb-3">
            <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--muted-foreground))]">
              <CalendarDays size={14} /> Filtrar
            </span>
            {(
              [
                ["day", "Dia"],
                ["week", "Semana"],
                ["month", "Mês"],
                ["calendar", "Dia selecionado"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === value ? "bg-[hsl(var(--primary))] text-white" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="p-4 text-sm text-[hsl(var(--muted-foreground))]">
              {futureReservations.length === 0
                ? "Nenhum agendamento futuro."
                : "Nenhum agendamento neste filtro."}
            </p>
          ) : (
            <div className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))]">
              {visible.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <div className="min-w-32">
                    <p className="font-data text-sm font-semibold">
                      {item.start}–{item.end}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {item.date}
                    </p>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-semibold">{item.className}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {item.room} · {item.teacher}
                    </p>
                  </div>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-[11px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                    {movements.find((entry) => entry.reservationId === item.id)
                      ?.status ?? "Não movido"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] p-3">
          <p className="mb-2 text-xs font-bold text-[hsl(var(--muted-foreground))]">
            Escolha uma data para os filtros
          </p>
          <Calendar
            mode="single"
            selected={filterDate}
            onSelect={(date) => setSelectedDate(date ? isoDate(date) : null)}
          />
        </div>
      </div>
    </div>
  );
}

export function OperatorLoginPage() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState(() => getRememberedOperatorName() || "TI");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() =>
    Boolean(getRememberedOperatorName()),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center px-4 py-8">
      <form
        className="w-full max-w-md space-y-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-lg sm:p-8"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          setError("");
          void loginWithCredentials("operator", name, password)
            .then((session) => {
              rememberOperatorName(session.name, remember);
              window.localStorage.setItem(
                "controle-carrinhos-operator-name",
                session.name,
              );
              setLocation("/operador");
            })
            .catch((loginError: unknown) => {
              setError(loginError instanceof Error ? loginError.message : "Não foi possível autenticar.");
            })
            .finally(() => setSubmitting(false));
        }}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-white">
            <LogIn size={20} />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold">Acesso do TI</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Agenda e movimentação dos carrinhos
            </p>
          </div>
        </div>
        <Field label="Nome">
          <input
            required
            name="username"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            autoComplete="username"
          />
        </Field>
        <Field label="Senha">
          <input
            required
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
            placeholder="Senha do TI"
            autoComplete="current-password"
          />
        </Field>
        <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />{" "}
          Lembrar meu usuário neste dispositivo (não salva a senha)
        </label>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Para salvar a senha, aceite a opção oferecida pelo navegador após entrar.
        </p>
        {error && (
          <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? "Verificando..." : "Entrar"}
        </Button>
        <Link
          href="/"
          className="block text-center text-xs font-semibold text-[hsl(var(--primary))]"
        >
          Voltar para acessos
        </Link>
      </form>
    </div>
  );
}

export function OperatorPage() {
  const {
    reservations,
    movements,
    carts,
    movementSettings,
    updateMovementStatus,
    markMovementNotAttended,
    wifiRooms,
    wifiPoints,
    assignMobileAntenna,
    releaseMobileAntenna,
  } = useCampusData();
  const { floorForRoom } = useRoomDirectory();
  const isOperatorAdmin =
    typeof window !== "undefined" &&
    window.localStorage.getItem("controle-carrinhos-role") === "admin";
  const [warning, setWarning] = useState("");
  const [alarmQueue, setAlarmQueue] = useState<Reservation[]>([]);
  const [alarmIndex, setAlarmIndex] = useState(0);
  const [view, setView] = useState<
    "pending" | "completed" | "notAttended" | "future"
  >("pending");
  const alarmQueueRef = useRef<Reservation[]>([]);
  const alertedReservationsRef = useRef(new Set<number>());
  const requestCountsRef = useRef(new Map<number, CartMovement>());
  const alarmStopRef = useRef<(() => void) | null>(null);
  const operatorSettings = readOperatorSettings();
  useEffect(
    () =>
      subscribeToOperatorAudioErrors((message) =>
        toast.error(message, {
          action: {
            label: "Ativar som",
            onClick: () => {
              void enableOperatorAudio()
                .then(() =>
                  playOperatorAlert(
                    readOperatorSettings(),
                    movementSettings.alertRepeat,
                  ),
                )
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Não foi possível ativar o som.",
                  );
                });
            },
          },
        }),
      ),
    [movementSettings.alertRepeat],
  );
  const today = reservations
    .filter((item) => item.date === todayISO() && item.kind === "Aula")
    .sort((a, b) => a.start.localeCompare(b.start));
  const [now, setNow] = useState(Date.now());
  const alreadyInRoomReservationIds = getAlreadyInRoomReservationIds(
    today,
    movements,
  );
  const alarm = alarmQueue[alarmIndex] ?? null;
  const removeAlarm = (reservationId: number) => {
    const nextQueue = alarmQueueRef.current.filter(
      (reservation) => reservation.id !== reservationId,
    );
    if (nextQueue.length === alarmQueueRef.current.length) return;
    if (alarm?.id === reservationId) {
      alarmStopRef.current?.();
      alarmStopRef.current = null;
    }
    alarmQueueRef.current = nextQueue;
    setAlarmQueue(nextQueue);
    setAlarmIndex((currentIndex) =>
      Math.min(currentIndex, Math.max(0, nextQueue.length - 1)),
    );
  };
  const liveAvailability = useMemo(() => {
    const time = new Date(now).toTimeString().slice(0, 5);
    return carts.reduce(
      (summary, cart) => {
        const unavailable = cart.unavailable
          ? cart.total
          : cart.unavailableUnits.length + cart.reservedUnits.length;
        const inUse = reservations
          .filter(
            (item) =>
              item.date === todayISO() &&
              item.cart === cart.name &&
              item.status !== "Concluída" &&
              item.start <= time &&
              time < item.end,
          )
          .reduce((total, item) => total + item.quantity, 0);
        summary.available += Math.max(0, cart.total - unavailable - inUse);
        summary.total += cart.total;
        return summary;
      },
      { available: 0, total: 0 },
    );
  }, [carts, reservations, now]);
  const playMovementAlert = () => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    alarmStopRef.current?.();
    alarmStopRef.current = playOperatorAlert(
      operatorSettings,
      movementSettings.alertRepeat,
    );
  };
  const movementActor = () =>
    window.localStorage.getItem("controle-carrinhos-operator-name") ?? "TI";
  const canUpdateMovement = (start: string, end: string) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    const isEarly = currentMinutes < startMinutes;
    const isWithinWarningWindow =
      isEarly &&
      currentMinutes >= startMinutes - movementSettings.earlyWarningMinutes;
    if (movementSettings.earlyWarningEnabled && isWithinWarningWindow) {
      setWarning(
        `Atenção: o carrinho está sendo movimentado ${startMinutes - currentMinutes} minuto${startMinutes - currentMinutes === 1 ? "" : "s"} antes do início da aula (${start}–${end}).`,
      );
    } else {
      setWarning("");
    }

    return { allowed: true, late: currentMinutes > startMinutes };
  };
  useEffect(() => {
    const refreshTime = () => setNow(Date.now());
    const timer = window.setInterval(refreshTime, 5000);
    window.addEventListener("focus", refreshTime);
    document.addEventListener("visibilitychange", refreshTime);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshTime);
      document.removeEventListener("visibilitychange", refreshTime);
    };
  }, []);
  useEffect(() => {
    getStaleRepeatedRoomClassMovementIds(today, movements).forEach(
      (reservationId) => {
        updateMovementStatus(
          reservationId,
          "Não movido",
          false,
          "Correção de regra de aula consecutiva",
        );
      },
    );
  }, [today, movements, updateMovementStatus]);
  useEffect(() => {
    if (!movementSettings.autoComplete) return;
    movements.forEach((movement) => {
      if (
        movement.status === "Movendo" &&
        now - new Date(movement.updatedAt).getTime() >=
          movementSettings.alertIntervalMinutes * 60000
      )
        updateMovementStatus(movement.reservationId, "Concluído", true);
    });
  }, [now, movementSettings, movements, updateMovementStatus]);
  useEffect(() => {
    const current = new Date(now);
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    getDueRepeatedRoomClassReservations(
      today,
      movements,
      currentMinutes,
    ).forEach((reservation) => {
      updateMovementStatus(
        reservation.id,
        "Concluído",
        true,
        repeatedLessonAutoCompleteActor,
      );
    });
  }, [now, today, movements, updateMovementStatus]);
  useEffect(() => {
    const currentMinutes =
      new Date(now).getHours() * 60 + new Date(now).getMinutes();
    today.forEach((reservation) => {
      if (alreadyInRoomReservationIds.has(reservation.id)) return;
      const movement = movements.find(
        (entry) => entry.reservationId === reservation.id,
      );
      const [hour, minute] = reservation.end.split(":").map(Number);
      if (
        currentMinutes >= hour * 60 + minute &&
        (!movement || movement.status === "Não movido")
      ) {
        markMovementNotAttended(reservation.id);
      }
    });
  }, [
    now,
    today,
    movements,
    markMovementNotAttended,
    alreadyInRoomReservationIds,
  ]);
  useEffect(() => {
    const requestedReservations: Reservation[] = [];
    movements.forEach((movement) => {
      const previousMovement = requestCountsRef.current.get(
        movement.reservationId,
      );
      requestCountsRef.current.set(movement.reservationId, movement);
      if (!isNewTeacherMovementRequest(previousMovement, movement)) return;

      const reservation = today.find(
        (item) => item.id === movement.reservationId,
      );
      if (!reservation || !isReservationInProgress(reservation)) return;

      alertedReservationsRef.current.delete(movement.reservationId);
      alertedReservationsRef.current.add(movement.reservationId);
      const alreadyQueued = alarmQueueRef.current.some(
        (item) => item.id === movement.reservationId,
      );
      if (!alreadyQueued) requestedReservations.push(reservation);
    });
    if (requestedReservations.length === 0) return;
    const shouldPlayAlert = alarmQueueRef.current.length === 0;
    const nextQueue = [...alarmQueueRef.current, ...requestedReservations];
    alarmQueueRef.current = nextQueue;
    if (shouldPlayAlert) setAlarmIndex(0);
    setAlarmQueue(nextQueue);
    setView("pending");
    playMovementAlert();
  }, [movements, today]);
  useEffect(() => {
    const current = new Date(now);
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    const pendingQueue = alarmQueueRef.current.filter((reservation) => {
      if (
        reservation.date !== todayISO() ||
        alreadyInRoomReservationIds.has(reservation.id)
      ) {
        return false;
      }
      const [endHour, endMinute] = reservation.end.split(":").map(Number);
      if (currentMinutes >= endHour * 60 + endMinute) return false;
      const movement = movements.find(
        (entry) => entry.reservationId === reservation.id,
      );
      return !movement || movement.status === "Não movido";
    });
    if (pendingQueue.length !== alarmQueueRef.current.length) {
      if (!pendingQueue.some((item) => item.id === alarm?.id)) {
        alarmStopRef.current?.();
        alarmStopRef.current = null;
      }
      alarmQueueRef.current = pendingQueue;
      setAlarmQueue(pendingQueue);
      setAlarmIndex((index) =>
        pendingQueue.length === 0
          ? 0
          : Math.min(index, pendingQueue.length - 1),
      );
    }
    const dueReservations = getDueMovementNotifications(
      today,
      movements,
      currentMinutes,
      movementSettings.earlyWarningEnabled,
      movementSettings.earlyWarningMinutes,
      [...alertedReservationsRef.current],
    );
    if (dueReservations.length === 0) return;
    const currentAlarmIds = new Set(
      alarmQueueRef.current.map((reservation) => reservation.id),
    );
    const newReservations = dueReservations.filter(
      (reservation) => !currentAlarmIds.has(reservation.id),
    );
    if (newReservations.length === 0) return;
    newReservations.forEach((reservation) =>
      alertedReservationsRef.current.add(reservation.id),
    );
    const shouldPlayAlert = alarmQueueRef.current.length === 0;
    const nextQueue = [...alarmQueueRef.current, ...newReservations];
    alarmQueueRef.current = nextQueue;
    if (shouldPlayAlert) setAlarmIndex(0);
    setAlarmQueue(nextQueue);
    setView("pending");
    if (shouldPlayAlert) playMovementAlert();
  }, [
    now,
    today,
    movements,
    movementSettings,
    alreadyInRoomReservationIds,
    alarm,
  ]);
  useEffect(() => () => alarmStopRef.current?.(), []);
  useEffect(() => {
    const current = new Date();
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    wifiPoints
      .filter(
        (point) =>
          point.type === "Antena volante" &&
          point.assignedRoom &&
          point.status === "Em uso",
      )
      .forEach((point) => {
        const stillInUse = today.some((reservation) => {
          if (reservation.room !== point.assignedRoom) return false;
          const [hour, minute] = reservation.end.split(":").map(Number);
          return currentMinutes < hour * 60 + minute;
        });
        if (!stillInUse) releaseMobileAntenna(point.id);
      });
  }, [now, today, wifiPoints, releaseMobileAntenna]);
  const visibleToday = today.filter((item) => {
    if (view === "pending" && alreadyInRoomReservationIds.has(item.id))
      return false;
    const movement = movements.find((entry) => entry.reservationId === item.id);
    if (view === "completed") return movement?.status === "Concluído";
    if (view === "notAttended") return movement?.status === "Não atendida";
    return (
      movement?.status !== "Concluído" && movement?.status !== "Não atendida"
    );
  });
  const handleAlarmMove = (reservation: Reservation) => {
    const timing = canUpdateMovement(reservation.start, reservation.end);
    if (!timing.allowed) return;
    const roomWifi = wifiRooms.find((room) => room.room === reservation.room);
    const roomNeedsAntenna = !roomWifi || !roomWifi.hasWifi;
    const mobileAntenna = wifiPoints.find(
      (point) =>
        point.type === "Antena volante" &&
        (!point.assignedRoom || point.assignedRoom === reservation.room) &&
        point.status === "Disponível",
    );
    if (roomNeedsAntenna && mobileAntenna)
      assignMobileAntenna(mobileAntenna.id, reservation.room);
    updateMovementStatus(
      reservation.id,
      "Movendo",
      false,
      movementActor(),
      timing.late,
    );
  };
  const handleAlarmComplete = (reservation: Reservation) => {
    const timing = canUpdateMovement(reservation.start, reservation.end);
    if (!timing.allowed) return;
    alarmStopRef.current?.();
    alarmStopRef.current = null;
    updateMovementStatus(
      reservation.id,
      "Concluído",
      false,
      movementActor(),
      timing.late,
    );
    removeAlarm(reservation.id);
  };
  const alarmMovement = alarm
    ? movements.find((entry) => entry.reservationId === alarm.id)
    : null;
  const alarmActionLabel =
    alarmMovement?.status === "Movendo" ? "Concluído" : "Mover carrinho";
  const previousCartReservation = alarm
    ? [...reservations]
        .filter(
          (entry) =>
            entry.cart === alarm.cart &&
            `${entry.date}${entry.start}` < `${alarm.date}${alarm.start}`,
        )
        .sort((a, b) =>
          `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`),
        )[0]
    : null;
  const clearAlarmQueue = () => {
    alarmStopRef.current?.();
    alarmStopRef.current = null;
    alarmQueueRef.current = [];
    setAlarmQueue([]);
    setAlarmIndex(0);
  };
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Área do TI"
        title="Agenda de movimentações"
        description={`Leve os carrinhos até as salas e atualize cada etapa. Disponíveis agora: ${liveAvailability.available} de ${liveAvailability.total} Chromebooks.`}
        action={
          isOperatorAdmin ? (
            <Link
              href="/admin"
              className="text-xs font-semibold text-[hsl(var(--primary))]"
            >
              Voltar ao administrador
            </Link>
          ) : undefined
        }
      />
      {operatorSettings.notificationMode === "classic" &&
        alarmQueue.length > 0 && (
          <section
            role="alert"
            className="space-y-3 rounded-[28px] border border-[#d7e4f6] bg-[linear-gradient(135deg,#eaf3ff_0%,#dfeeff_28%,#ffffff_100%)] p-4 text-slate-800 shadow-[0_22px_48px_rgba(15,53,94,0.12)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#176bd0] text-white">
                  <Bell size={19} />
                </div>
                <h2 className="text-xl font-black text-[#0f2340]">
                  Tem movimentação
                </h2>
              </div>
              <button
                type="button"
                onClick={clearAlarmQueue}
                className="rounded-full bg-white/80 p-2 text-slate-600 transition hover:bg-white"
                aria-label="Fechar avisos"
              >
                <X size={18} />
              </button>
            </div>
            {alarmQueue.map((reservation) => {
              const movement = movements.find(
                (entry) => entry.reservationId === reservation.id,
              );
              return (
                <div
                  key={reservation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#bfd6f6] bg-white p-3"
                >
                  <div>
                    <p className="font-bold text-[#102b4d]">
                      {reservation.start}–{reservation.end} · {reservation.cart}
                    </p>
                    <p className="text-sm font-semibold">
                      {reservation.room} · {reservation.className}
                    </p>
                    <p className="text-xs text-slate-600">
                      {reservation.teacher}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => removeAlarm(reservation.id)}
                    >
                      Dispensar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        movement?.status === "Movendo"
                          ? handleAlarmComplete(reservation)
                          : handleAlarmMove(reservation)
                      }
                    >
                      {movement?.status === "Movendo"
                        ? "Concluído"
                        : "Mover carrinho"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      {operatorSettings.notificationMode === "selection" && alarm && (
        <div
          role="alert"
          className="overflow-hidden rounded-[28px] border border-[#d7e4f6] bg-[linear-gradient(135deg,#eaf3ff_0%,#dfeeff_28%,#ffffff_100%)] p-4 text-slate-800 shadow-[0_22px_48px_rgba(15,53,94,0.12)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#0f5ec8_0%,#3c8ef8_100%)] ring-1 ring-[#b9d1f0]">
                <Bell size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#2f5e8f]">
                  Notificação
                </p>
                <p className="mt-1 text-[1.8rem] font-black leading-none tracking-[-0.05em] text-[#0f2340]">
                  Tem movimentação
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearAlarmQueue}
              className="rounded-full bg-white/80 p-2 text-slate-600 transition hover:bg-white"
              aria-label="Fechar avisos"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-4 rounded-[22px] border border-[#bfd6f6] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8a6b1d]">
                Agendamento
              </p>
              {alarmQueue.length > 1 && (
                <span className="text-xs font-bold text-[#2f5e8f]">
                  Movimentação {alarmIndex + 1} de {alarmQueue.length}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xl font-black tracking-[-0.04em] text-[#102b4d]">
                {alarm.start}–{alarm.end}
              </p>
              <span className="rounded-full border border-[#f0b400] bg-[linear-gradient(135deg,#fff3a6_0%,#ffd84d_100%)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#684900] shadow-[0_2px_8px_rgba(240,180,0,0.2)]">
                {alarm.cart}
              </span>
            </div>
            <p className="mt-1 text-base font-semibold text-slate-800">
              {alarm.className}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {alarm.room} · {alarm.teacher}
            </p>
            {previousCartReservation && (
              <p className="mt-2 rounded-lg border border-[#dfe9f9] bg-[#f3f8ff] px-2.5 py-2 text-xs font-semibold text-[#234b79]">
                Último uso do carrinho: {previousCartReservation.room} &rarr;{" "}
                {floorForRoom(previousCartReservation.room)}
              </p>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            {alarmQueue.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setAlarmIndex(
                      (index) =>
                        (index - 1 + alarmQueue.length) % alarmQueue.length,
                    )
                  }
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#bfd1e7] bg-white text-[#174d8d] hover:bg-[#eef6ff]"
                  aria-label="Movimentação anterior"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAlarmIndex((index) => (index + 1) % alarmQueue.length)
                  }
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#bfd1e7] bg-white text-[#174d8d] hover:bg-[#eef6ff]"
                  aria-label="Próxima movimentação"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() =>
                alarmMovement?.status === "Movendo"
                  ? handleAlarmComplete(alarm)
                  : handleAlarmMove(alarm)
              }
              className="flex-1 rounded-xl bg-[linear-gradient(135deg,#2d8ef5_0%,#0f5ec8_100%)] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(15,94,200,0.28)] transition hover:brightness-110"
            >
              {alarmActionLabel}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">
            O aviso reúne movimentações simultâneas. Use as setas para navegar
            entre elas.
          </p>
        </div>
      )}
      {warning && (
        <div
          role="alert"
          className="rounded-xl border border-[hsl(var(--destructive)/.4)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm font-semibold text-[hsl(var(--destructive))]"
        >
          {warning}
        </div>
      )}
      {view === "future" ? (
        <SectionCard
          title="Agendamentos futuros"
          eyebrow="Próximas movimentações"
        >
          <FutureReservations
            reservations={reservations}
            movements={movements}
            onViewChange={(nextView) => setView(nextView)}
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Movimentações de hoje"
          eyebrow={`${visibleToday.length} agendamento${visibleToday.length === 1 ? "" : "s"} ${view === "completed" ? "concluído" : view === "notAttended" ? "não atendido" : "para atender"}`}
        >
          <div className="flex flex-wrap gap-2 border-b border-[hsl(var(--border))] px-5 pt-4 sm:px-6">
            <button
              type="button"
              onClick={() => setView("pending")}
              className={`border-b-2 px-1 pb-3 text-xs font-bold ${view === "pending" ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "border-transparent text-[hsl(var(--muted-foreground))]"}`}
            >
              Para atender
            </button>{" "}
            <button
              type="button"
              onClick={() => setView("completed")}
              className={`border-b-2 px-1 pb-3 text-xs font-bold ${view === "completed" ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "border-transparent text-[hsl(var(--muted-foreground))]"}`}
            >
              Concluídos
            </button>
            <button
              type="button"
              onClick={() => setView("notAttended")}
              className={`border-b-2 px-1 pb-3 text-xs font-bold ${view === "notAttended" ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "border-transparent text-[hsl(var(--muted-foreground))]"}`}
            >
              Não atendidas
            </button>
            <button
              type="button"
              onClick={() => setView("future")}
              className="border-b-2 border-transparent px-1 pb-3 text-xs font-bold text-[hsl(var(--muted-foreground))]"
            >
              Futuras
            </button>
          </div>
          {visibleToday.length === 0 ? (
            <p className="p-6 text-sm text-[hsl(var(--muted-foreground))]">
              {" "}
              {view === "completed"
                ? "Nenhuma movimentação concluída hoje."
                : view === "notAttended"
                  ? "Nenhuma movimentação não atendida hoje."
                  : "Nenhuma movimentação para hoje."}
            </p>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              {visibleToday.map((item) => {
                const movement = movements.find(
                  (entry) => entry.reservationId === item.id,
                );
                const status = movement?.status ?? "Não movido";
                const roomWifi = wifiRooms.find(
                  (room) => room.room === item.room,
                );
                const roomNeedsAntenna = !roomWifi || !roomWifi.hasWifi;
                const mobileAntenna = wifiPoints.find(
                  (point) =>
                    point.type === "Antena volante" &&
                    (!point.assignedRoom || point.assignedRoom === item.room) &&
                    point.status === "Disponível",
                );
                const previousCartReservation = reservations
                  .filter(
                    (entry) =>
                      entry.cart === item.cart &&
                      `${entry.date}${entry.start}` <
                        `${item.date}${item.start}`,
                  )
                  .sort((a, b) =>
                    `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`),
                  )[0];
                return (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-[#e7edf5] bg-[linear-gradient(180deg,#ffffff_0%,#f5f7fb_100%)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf3fc] text-[hsl(var(--primary))] ring-1 ring-[#dfe8f3]">
                          <MoveRight size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                            Agendamento
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <p className="text-[1.55rem] font-black leading-none tracking-[-0.06em] text-slate-900">
                              {item.start}–{item.end}
                            </p>{" "}
                            <span className="rounded-full border border-[#f0b400] bg-[#ffd84d] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#684900] shadow-[0_2px_8px_rgba(240,180,0,0.2)]">
                              {item.cart}
                            </span>
                          </div>
                          <p className="mt-1 text-base font-semibold text-slate-800">
                            {item.className}
                          </p>{" "}
                          <p className="mt-1 text-sm text-slate-700">
                            {item.room} · {floorForRoom(item.room)} · Professor:{" "}
                            {item.teacher}
                          </p>
                          {movement?.notReceived && (
                            <p className="mt-2 rounded-lg bg-[hsl(var(--destructive)/.08)] p-2 text-xs font-semibold text-[hsl(var(--destructive))]">
                              Carrinho não movimentado — o professor não
                              recebeu. Solicitação{" "}
                              {movement.requestCount > 1
                                ? `repetida (${movement.requestCount}x)`
                                : "registrada"}
                              .
                            </p>
                          )}
                          {roomNeedsAntenna && (
                            <p className="mt-2 rounded-lg border border-[#d7dee8] bg-[#f3f5f8] p-2 text-xs font-semibold text-black">
                              Sala sem conexão fixa ·{" "}
                              {mobileAntenna
                                ? `${mobileAntenna.name} (${mobileAntenna.point})`
                                : "nenhuma antena volante disponível"}
                            </p>
                          )}
                        </div>
                      </div>
                      <StatusPill status={status} />
                    </div>
                    {view === "pending" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={
                            status === "Movendo" ? "primary" : "secondary"
                          }
                          onClick={() => {
                            const timing = canUpdateMovement(
                              item.start,
                              item.end,
                            );
                            if (!timing.allowed) return;
                            if (roomNeedsAntenna && mobileAntenna)
                              assignMobileAntenna(mobileAntenna.id, item.room);
                            playMovementAlert();
                            updateMovementStatus(
                              item.id,
                              "Movendo",
                              false,
                              movementActor(),
                              timing.late,
                            );
                          }}
                        >
                          <Clock3 size={14} /> Movendo
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            status === "Concluído" ? "primary" : "secondary"
                          }
                          onClick={() => {
                            const timing = canUpdateMovement(
                              item.start,
                              item.end,
                            );
                            if (!timing.allowed) return;
                            if (roomNeedsAntenna && mobileAntenna)
                              assignMobileAntenna(mobileAntenna.id, item.room);
                            updateMovementStatus(
                              item.id,
                              "Concluído",
                              false,
                              movementActor(),
                              timing.late,
                            );
                          }}
                        >
                          {" "}
                          <Check size={14} /> Concluir
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
