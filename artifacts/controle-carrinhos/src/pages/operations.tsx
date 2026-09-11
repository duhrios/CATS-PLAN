import { Fragment, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Edit3,
  Filter,
  Laptop,
  MapPin,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCcw,
  Router,
  Search,
  Settings2,
  ShieldCheck,
  Signal,
  SignalHigh,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Link } from "wouter";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  SectionCard,
  StatusPill,
  cx,
  formatDate,
  fridaySabbathMessage,
  isFridayISO,
  inputClass,
  todayISO,
} from "@/components/app-ui";
import { Calendar } from "@/components/ui/calendar";
import { type Period, useRoomDirectory } from "@/lib/room-directory";
import {
  isReservationInProgress,
  segments,
  type Reservation,
  type ReservationKind,
  type Segment,
  useCampusData,
} from "@/lib/campus-data";

const isoToDate = (value: string) => new Date(`${value}T12:00:00`);
const dateToISO = (value: Date) => value.toISOString().slice(0, 10);
const isWeekendISO = (value: string) =>
  [0, 6].includes(isoToDate(value).getDay());

type ScheduleSlot = { start: string; end: string; label?: string };

const campusSchedule: Record<
  string,
  Record<"Manhã" | "Tarde", ScheduleSlot[]>
> = {
  "Carrinho A": {
    Manhã: [
      { start: "07:00", end: "07:45" },
      { start: "07:45", end: "08:30" },
      { start: "08:30", end: "09:35" },
      { start: "09:35", end: "10:20" },
      { start: "10:20", end: "11:05" },
      { start: "11:05", end: "11:50" },
      {
        start: "11:50",
        end: "12:45",
        label: "Faixa protegida para conflito entre turnos",
      },
    ],
    Tarde: [
      { start: "12:45", end: "13:30" },
      { start: "13:30", end: "14:15" },
      { start: "14:15", end: "15:00" },
      { start: "15:00", end: "16:05" },
      { start: "16:05", end: "16:50" },
      { start: "16:50", end: "17:35" },
    ],
  },
  "Carrinho B": {
    Manhã: [
      { start: "07:00", end: "07:45" },
      { start: "07:45", end: "08:30" },
      { start: "08:30", end: "09:15" },
      { start: "09:15", end: "10:20" },
      { start: "10:20", end: "11:05" },
      { start: "11:05", end: "11:50" },
      { start: "11:50", end: "12:35" },
    ],
    Tarde: [
      { start: "12:00", end: "12:45" },
      { start: "12:45", end: "13:30" },
      { start: "13:30", end: "14:15" },
      { start: "14:15", end: "15:20" },
      { start: "15:20", end: "16:05" },
      { start: "16:05", end: "16:50" },
      { start: "16:50", end: "17:35" },
    ],
  },
  "Carrinho C": {
    Manhã: [
      { start: "07:00", end: "07:45" },
      { start: "07:45", end: "08:30" },
      { start: "08:30", end: "09:15" },
      { start: "09:15", end: "10:20" },
      { start: "10:20", end: "11:05" },
      { start: "11:05", end: "11:50" },
      { start: "11:50", end: "12:35" },
    ],
    Tarde: [
      { start: "12:00", end: "12:45" },
      { start: "12:45", end: "13:30" },
      { start: "13:30", end: "14:15" },
      { start: "14:15", end: "15:20" },
      { start: "15:20", end: "16:05" },
      { start: "16:05", end: "16:50" },
      { start: "16:50", end: "17:35" },
    ],
  },
};

const fridayAfternoonSchedule: ScheduleSlot[] = [
  { start: "12:00", end: "12:45" },
  { start: "12:45", end: "13:25" },
  { start: "13:25", end: "14:05" },
  { start: "14:05", end: "15:05" },
  { start: "15:05", end: "15:45" },
  { start: "15:45", end: "16:20" },
  { start: "16:20", end: "17:00" },
];

const scheduleFor = (
  cart: string,
  period: "Manhã" | "Tarde",
  date?: string,
) =>
  date && period === "Tarde" && isFridayISO(date)
    ? fridayAfternoonSchedule
    : campusSchedule[cart]?.[period] ?? [];

const reservationConflictDetails = (reservations: Reservation[]) => {
  const conflicts: Array<{ reservation: Reservation; other: Reservation }> = [];
  reservations.forEach((reservation) =>
    reservations.forEach((other) => {
      if (
        reservation.id >= other.id ||
        reservation.date !== other.date ||
        reservation.cart !== other.cart
      )
        return;
      if (reservation.start < other.end && other.start < reservation.end) {
        conflicts.push({ reservation, other });
      }
    }),
  );
  return conflicts;
};

const historySeed = [
  {
    id: 1,
    time: "06:52",
    title: "Checklist concluído",
    detail: "Carrinho A · 55 Chromebooks disponíveis",
    type: "Equipamento",
    tone: "good",
  },
  {
    id: 2,
    time: "06:48",
    title: "Reserva confirmada",
    detail: "Rafael Nunes · 7º ano A · Carrinho B",
    type: "Reserva",
    tone: "good",
  },
  {
    id: 3,
    time: "06:41",
    title: "Carrinho retirado",
    detail: "Carrinho C · Laboratório 01",
    type: "Movimentação",
    tone: "warm",
  },
  {
    id: 4,
    time: "06:35",
    title: "Sinal em observação",
    detail: "AP-03 · Laboratórios do Bloco 2",
    type: "Wi-Fi",
    tone: "warm",
  },
  {
    id: 5,
    time: "Ontem, 16:32",
    title: "Equipamento enviado à manutenção",
    detail: "C-04 · 4 Chromebooks com bateria baixa",
    type: "Equipamento",
    tone: "bad",
  },
];

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "teal",
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: "teal" | "gold" | "green" | "red";
  href?: string;
}) {
  const colors = {
    teal: "bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]",
    gold: "bg-[hsl(var(--accent)/.2)] text-[hsl(34_60%_32%)]",
    green: "bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]",
    red: "bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]",
  };
  const content = (
    <div
      className={cx(
        "group rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[0_8px_28px_hsl(187_30%_20%/.045)] transition-all duration-200 hover:-translate-y-0.5",
        href &&
          "cursor-pointer hover:border-[hsl(var(--primary)/.35)] hover:shadow-[0_12px_32px_hsl(187_30%_20%/.1)]",
      )}
      data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
          {label}
        </p>
        <span
          className={cx(
            "grid h-9 w-9 place-items-center rounded-xl",
            colors[tone],
          )}
        >
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-4 font-display text-3xl font-semibold tracking-[-.04em]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
        {detail}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} aria-label={`Abrir ${label}`}>
      {content}
    </Link>
  ) : (
    content
  );
}

function ProgressBar({
  value,
  tone = "teal",
}: {
  value: number;
  tone?: "teal" | "gold" | "red";
}) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500",
          tone === "teal" && "bg-[hsl(var(--primary))]",
          tone === "gold" && "bg-[hsl(var(--accent))]",
          tone === "red" && "bg-[hsl(var(--destructive))]",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function OverviewPage() {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("06:55");
  const [loading, setLoading] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    setLoading(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setLoading(false);
      setLastRefresh(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }, 650);
  };
  if (loading)
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Quarta-feira, 19 de março"
          title="Bom dia, equipe."
          description="Preparando o pulso operacional do Campus Vila Nova."
        />
        <SectionCard>
          <div className="p-6">
            <div className="skeleton h-5 w-52 rounded" />
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="skeleton h-28 rounded-2xl" />
              <div className="skeleton h-28 rounded-2xl" />
              <div className="skeleton h-28 rounded-2xl" />
            </div>
          </div>
        </SectionCard>
      </div>
    );
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Quarta-feira, 19 de março · turno da manhã"
        title="Bom dia, equipe."
        description="O essencial para colocar a primeira aula em movimento, sem surpresas."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-[11px] text-[hsl(var(--muted-foreground))] sm:inline">
              Atualizado às {lastRefresh}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={refresh}
              data-testid="button-refresh-overview"
            >
              <RefreshCcw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />{" "}
              Atualizar
            </Button>
            <Link
              href="/reservas?hoje=1"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs font-semibold transition hover:border-[hsl(var(--primary)/.4)]"
              data-testid="link-today-reservation"
            >
              <CalendarDays size={14} /> Reserva de hoje
            </Link>
            <Link
              href="/reservas"
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 text-xs font-semibold text-[hsl(var(--primary-foreground))] transition hover:brightness-105"
              data-testid="link-new-reservation"
            >
              <Plus size={14} /> Nova reserva
            </Link>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Reservas hoje"
          value="12"
          detail="3 acontecendo agora"
          icon={CalendarDays}
          tone="teal"
          href="/reservas?hoje=1"
        />
        <Metric
          label="Chromebooks prontos"
          value="160 / 173"
          detail="3 carrinhos cadastrados"
          icon={Laptop}
          tone="gold"
          href="/carrinhos"
        />
        <Metric
          label="Wi-Fi saudável"
          value="4 / 5"
          detail="AP-03 pede atenção"
          icon={SignalHigh}
          tone="green"
          href="/wifi"
        />
        <Metric
          label="Conflitos"
          value="1"
          detail="Requer decisão até 11:50"
          icon={AlertTriangle}
          tone="red"
          href="/reservas?conflitos=1"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.45fr_.85fr]">
        <SectionCard
          title="Pulso do dia"
          eyebrow="Acompanhamento em tempo real"
          action={
            <Link
              href="/reservas"
              className="inline-flex items-center gap-1 text-xs font-bold text-[hsl(var(--primary))] hover:underline"
              data-testid="link-view-all-reservations"
            >
              Ver agenda <ArrowUpRight size={14} />
            </Link>
          }
        >
          <div className="divide-y divide-[hsl(var(--border))]">
            {[
              {
                time: "07:00",
                room: "Laboratório 02",
                title: "8º ano B · Ciências",
                owner: "Marina Lopes",
                cart: "Carrinho A",
                state: "Em andamento",
                dot: "bg-[hsl(var(--primary))]",
              },
              {
                time: "09:15",
                room: "Sala 14",
                title: "7º ano A · Matemática",
                owner: "Rafael Nunes",
                cart: "Carrinho B",
                state: "Próxima",
                dot: "bg-[hsl(var(--accent))]",
              },
              {
                time: "11:50",
                room: "Sala 21",
                title: "9º ano C · Geografia",
                owner: "Bianca Reis",
                cart: "Carrinho A",
                state: "Conflito",
                dot: "bg-[hsl(var(--destructive))]",
              },
              {
                time: "13:30",
                room: "Sala 08",
                title: "6º ano A · Português",
                owner: "Caio Martins",
                cart: "Carrinho C",
                state: "Mais tarde",
                dot: "bg-[hsl(var(--muted-foreground))]",
              },
            ].map((item, index) => (
              <Link
                key={item.time}
                href={
                  item.state === "Conflito"
                    ? "/reservas?conflitos=1"
                    : `/reservas?hoje=1`
                }
                className={cx(
                  "flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[hsl(var(--muted)/.45)] sm:px-6",
                  index === 2 && "bg-[hsl(var(--accent)/.07)]",
                )}
                data-testid={`row-timeline-${item.time.replace(":", "")}`}
              >
                <div className="w-12 shrink-0">
                  <p className="font-data text-sm font-semibold">{item.time}</p>
                  <span
                    className={cx(
                      "mt-1 block h-1.5 w-1.5 rounded-full",
                      item.dot,
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {item.owner} · {item.room}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-semibold">{item.cart}</p>
                  <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                    {item.state}
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="text-[hsl(var(--muted-foreground))]"
                />
              </Link>
            ))}
          </div>
        </SectionCard>
        <SectionCard
          title="Pronto para a aula?"
          eyebrow="Checklist de abertura"
        >
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]">
                <Check size={18} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Carrinhos conferidos</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  86 unidades disponíveis
                </p>
              </div>
              <span className="font-data text-xs font-bold text-[hsl(var(--primary))]">
                100%
              </span>
            </div>
            <ProgressBar value={100} />
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--accent)/.18)] text-[hsl(34_60%_32%)]">
                <Signal size={18} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Sinal verificado</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  1 ponto em observação
                </p>
              </div>
              <span className="font-data text-xs font-bold text-[hsl(34_60%_32%)]">
                80%
              </span>
            </div>
            <ProgressBar value={80} tone="gold" />
            <Link
              href="/wifi"
              className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-xs font-semibold transition hover:border-[hsl(var(--primary)/.4)]"
              data-testid="link-check-wifi"
            >
              <span>Ver pontos que precisam de atenção</span>
              <ArrowUpRight size={15} className="text-[hsl(var(--primary))]" />
            </Link>
          </div>
        </SectionCard>
      </div>
      <SectionCard
        title="Últimas movimentações"
        eyebrow="Registro da operação"
        action={
          <Link
            href="/historico"
            className="text-xs font-bold text-[hsl(var(--primary))] hover:underline"
            data-testid="link-view-history"
          >
            Abrir histórico
          </Link>
        }
      >
        <div className="grid gap-px bg-[hsl(var(--border))] sm:grid-cols-3">
          {historySeed.slice(0, 3).map((event) => (
            <div
              key={event.id}
              className="bg-[hsl(var(--card))] p-5"
              data-testid={`card-activity-${event.id}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-data text-[11px] text-[hsl(var(--muted-foreground))]">
                  {event.time}
                </span>
                <StatusPill
                  status={
                    event.tone === "bad"
                      ? "Atenção"
                      : event.tone === "warm"
                        ? "Em uso"
                        : "Concluída"
                  }
                />
              </div>
              <p className="mt-4 text-sm font-semibold">{event.title}</p>
              <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                {event.detail}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ReservationModal({
  reservation,
  initialDate: initialDateValue,
  mode = "admin",
  onClose,
  onSave,
  teacher,
  reserveAvailable,
  teacherReserved,
}: {
  reservation?: Reservation;
  initialDate?: string;
  mode?: "admin" | "user" | "operator";
  onClose: () => void;
  onSave: (value: Omit<Reservation, "id" | "status">) => void;
  teacher: { name: string; segment: Segment; subject: string };
  reserveAvailable: number;
  teacherReserved: number;
}) {
  const { classEntries, roomForClass, classesForRoom, roomOptionsForSegment } =
    useRoomDirectory();
  const { carts, wifiRooms } = useCampusData();
  const [error, setError] = useState("");
  const initialPeriod = reservation?.period ?? ("Manhã" as Period);
  const initialCart = reservation?.cart ?? "Carrinho A";
  const selectedInitialDate = reservation?.date ?? initialDateValue ?? todayISO();
  const initialSlots = scheduleFor(initialCart, initialPeriod, selectedInitialDate);
  const initialSlot =
    initialSlots.find((slot) => slot.start === reservation?.start) ??
    initialSlots[0];
  const [form, setForm] = useState({
    teacher: reservation?.teacher ?? teacher.name,
    segment: reservation?.segment ?? teacher.segment,
    subject: reservation?.subject ?? teacher.subject,
    kind: reservation?.kind ?? ("Aula" as ReservationKind),
    className: reservation?.className ?? "",
    room: reservation?.room ?? "",
    period: initialPeriod,
    date: selectedInitialDate,
    start: initialSlot?.start ?? reservation?.start ?? "07:00",
    end: initialSlot?.end ?? reservation?.end ?? "07:45",
    cart: initialCart,
    quantity: String(reservation?.quantity ?? 1),
  });
  const eligibleEntries = classEntries.filter(
    (item) => item.segment === form.segment,
  );
  const eligibleRooms = roomOptionsForSegment(form.segment);
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "kind" && value === "Reserva") {
        next.cart = "Reservas";
        next.className = "";
        next.room = "";
      }
      if (key === "kind" && value === "Aula" && next.cart === "Reservas")
        next.cart = "Carrinho A";
      if (key === "segment") {
        const segment = value as Segment;
        const rooms = roomOptionsForSegment(segment);
        next.room = rooms.length === 1 ? rooms[0] : "";
        next.className =
          segment === "Educação Infantil" || segment === "Fundamental 1"
            ? next.room
            : "";
      }
      if (key === "className")
        next.room = roomForClass(value, next.period, next.segment);
      if (key === "room") {
        const matchingClasses = classesForRoom(value, next.period);
        if (matchingClasses.length === 1) next.className = matchingClasses[0];
      }
      if (key === "period") {
        const period = value as Period;
        const matchingRoom = roomForClass(next.className, period, next.segment);
        const matchingClasses = classesForRoom(next.room, period);
        if (matchingRoom) next.room = matchingRoom;
        if (matchingClasses.length === 1) next.className = matchingClasses[0];
      }
      if (key === "start" && next.kind === "Aula") {
        const slot = scheduleFor(next.cart, next.period, next.date).find(
          (item) => item.start === value,
        );
        if (slot) next.end = slot.end;
      }
      if (
        (key === "cart" || key === "period" || key === "kind" || key === "date") &&
        next.kind === "Aula"
      ) {
        const slots = scheduleFor(next.cart, next.period, next.date);
        const slot =
          slots.find((item) => item.start === next.start) ?? slots[0];
        if (slot) {
          next.start = slot.start;
          next.end = slot.end;
        }
      }
      return next;
    });
  const matchedRoom = roomForClass(form.className, form.period, form.segment);
  const roomClasses = classesForRoom(form.room, form.period);
  const selectedRoomWifi = wifiRooms.find(
    (item) => item.room.toLowerCase() === form.room.toLowerCase(),
  );
  const sameDayBlocked =
    mode === "user" && form.kind === "Aula" && form.date === todayISO();
  const isReserve = form.kind === "Reserva";
  const weekendBlocked =
    mode === "user" && form.kind === "Aula" && isWeekendISO(form.date);
  const availableSchedule = isReserve
    ? []
    : scheduleFor(form.cart, form.period, form.date);
  const selectedScheduleSlot = availableSchedule.find(
    (slot) => slot.start === form.start && slot.end === form.end,
  );
  const maxForTeacher = Math.max(
    0,
    10 -
      teacherReserved +
      (reservation?.kind === "Reserva" ? reservation.quantity : 0),
  );

  return (
    <Modal
      title={reservation ? "Editar reserva" : "Nova reserva"}
      onClose={onClose}
    >
      <form
        className="space-y-5 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const quantity = Math.max(1, Number(form.quantity) || 1);
          if (isReserve && quantity > maxForTeacher) {
            setError(
              `Você pode reservar no máximo ${maxForTeacher} Chromebook(s).`,
            );
            return;
          }
          if (
            isReserve &&
            quantity >
              reserveAvailable +
                (reservation?.kind === "Reserva" ? reservation.quantity : 0)
          ) {
            setError(
              "Os Chromebooks de reserva estão indisponíveis neste momento.",
            );
            return;
          }
          if (weekendBlocked) {
            setError("As aulas só podem ser agendadas em dias úteis.");
            return;
          }
          if (!isReserve && !selectedScheduleSlot) {
            setError(
              "O horário escolhido não faz parte do cronograma deste carrinho.",
            );
            return;
          }
          if (!sameDayBlocked)
            onSave({
              ...form,
              quantity,
              segment: form.segment,
              subject: form.subject,
              kind: form.kind,
              className: isReserve
                ? "Chromebooks de reserva"
                : form.className || form.room,
              room: isReserve ? "Reserva" : form.room,
              cart: isReserve ? "Reservas" : form.cart,
            });
        }}
        data-testid="form-reservation"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Professor(a)"
            hint="Preenchido automaticamente pelo seu cadastro."
          >
            <input
              required
              readOnly
              value={form.teacher}
              className={`${inputClass} bg-[hsl(var(--muted))]`}
              data-testid="input-reservation-teacher"
            />
          </Field>
          <Field label="Tipo de solicitação">
            <select
              value={form.kind}
              onChange={(event) => update("kind", event.target.value)}
              className={inputClass}
              data-testid="select-reservation-kind"
            >
              <option value="Aula">Reserva para aula</option>
              <option value="Reserva">Chromebooks de reserva</option>
            </select>
          </Field>
          {!isReserve && (
            <Field label="Seguimento">
              <select
                value={form.segment}
                onChange={(event) => update("segment", event.target.value)}
                className={inputClass}
                data-testid="select-reservation-segment"
              >
                {segments.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {!isReserve && (
            <Field
              label="Matéria"
              hint="Obrigatória para Fundamental 2 e Ensino Médio."
            >
              <input
                required={
                  form.segment === "Fundamental 2" ||
                  form.segment === "Ensino Médio"
                }
                value={form.subject}
                onChange={(event) => update("subject", event.target.value)}
                className={inputClass}
                placeholder="Ex.: Ciências"
                data-testid="input-reservation-subject"
              />
            </Field>
          )}
          {!isReserve && (
            <Field
              label="Turma e disciplina"
              hint={
                form.segment === "Educação Infantil" ||
                form.segment === "Fundamental 1"
                  ? "Este seguimento usa a sala cadastrada pelo administrador."
                  : "Escolha uma turma do seu seguimento para preencher a sala."
              }
            >
              <input
                list="reservation-classes"
                required
                value={form.className}
                onChange={(event) => update("className", event.target.value)}
                className={inputClass}
                placeholder="Ex.: 7º ano A · Matemática"
                data-testid="input-reservation-class"
              />
              <datalist id="reservation-classes">
                {eligibleEntries.map((item) => (
                  <option
                    key={`${item.period}-${item.className}`}
                    value={item.className}
                  >
                    {item.room} · {item.period}
                  </option>
                ))}
              </datalist>
            </Field>
          )}
          {!isReserve && (
            <Field label="Período">
              <select
                value={form.period}
                onChange={(event) => update("period", event.target.value)}
                className={inputClass}
                data-testid="select-reservation-period"
              >
                <option value="Manhã">Manhã</option>
                <option value="Tarde">Tarde</option>
              </select>
            </Field>
          )}
          <Field label="Data">
            <input
              required
              type="date"
              value={form.date}
              onChange={(event) => update("date", event.target.value)}
              className={inputClass}
              data-testid="input-reservation-date"
            />
          </Field>
          {!isReserve && (
            <Field
              label="Sala"
              hint={
                matchedRoom
                  ? "Sala preenchida automaticamente."
                  : roomClasses.length > 1
                    ? `${roomClasses.length} turmas cadastradas nesta sala.`
                    : "Salas filtradas pelo seguimento do professor."
              }
            >
              <input
                required
                list="reservation-rooms"
                value={form.room}
                readOnly={Boolean(matchedRoom) || eligibleRooms.length === 1}
                onChange={(event) => update("room", event.target.value)}
                className={cx(
                  inputClass,
                  (matchedRoom || eligibleRooms.length === 1) &&
                    "bg-[hsl(var(--muted))]",
                )}
                placeholder="Ex.: Sala 14"
                data-testid="input-reservation-room"
              />
              <datalist id="reservation-rooms">
                {eligibleRooms.map((room) => (
                  <option key={room} value={room} />
                ))}
              </datalist>
            </Field>
          )}
          {!isReserve && selectedRoomWifi && !selectedRoomWifi.hasWifi && (
            <div
              className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-[hsl(var(--accent)/.6)] bg-[hsl(var(--accent)/.12)] p-4 text-xs leading-5 text-[hsl(34_60%_32%)]"
              data-testid="alert-reservation-mobile-antenna"
            >
              <WifiOff size={17} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Esta sala não tem acesso ao Wi‑Fi fixo
                </p>
                <p className="mt-1">
                  Ao agendar o carrinho para {form.room}, será necessário levar
                  a <strong>antena volante</strong>. O ponto será cadastrado
                  pela coordenação na tela Pontos Wi‑Fi.
                </p>
              </div>
            </div>
          )}
          <Field
            label="Início"
            hint={
              isReserve
                ? "A reserva pode ser solicitada em qualquer horário."
                : "Horários conforme o cronograma do carrinho."
            }
          >
            {isReserve ? (
              <input
                required
                type="time"
                value={form.start}
                onChange={(event) => update("start", event.target.value)}
                className={inputClass}
                data-testid="input-reservation-start"
              />
            ) : (
              <select
                required
                value={form.start}
                onChange={(event) => update("start", event.target.value)}
                className={inputClass}
                data-testid="select-reservation-start"
              >
                {availableSchedule.map((slot) => (
                  <option key={slot.start} value={slot.start}>
                    {slot.start}
                    {slot.label ? ` · ${slot.label}` : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Fim">
            {isReserve ? (
              <input
                required
                type="time"
                value={form.end}
                onChange={(event) => update("end", event.target.value)}
                className={inputClass}
                data-testid="input-reservation-end"
              />
            ) : (
              <input
                readOnly
                value={form.end}
                className={`${inputClass} bg-[hsl(var(--muted))]`}
                data-testid="input-reservation-end"
              />
            )}
          </Field>
          {isReserve && (
            <Field
              label="Quantidade"
              hint={`Limite por professor: 10. Disponíveis agora: ${Math.max(0, reserveAvailable)}.`}
            >
              <input
                required
                type="number"
                min={1}
                max={10}
                value={form.quantity}
                onChange={(event) => update("quantity", event.target.value)}
                className={inputClass}
                data-testid="input-reservation-quantity"
              />
            </Field>
          )}
        </div>
        {mode === "user" && (
          <div
            className={cx(
              "rounded-xl border px-3 py-3 text-xs leading-5",
              sameDayBlocked || weekendBlocked
                ? "border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.08)] text-[hsl(var(--destructive))]"
                : "border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.1)] text-[hsl(34_60%_32%)]",
            )}
            data-testid="text-reservation-date-rule"
          >
            {sameDayBlocked
              ? "Não é possível criar ou alterar uma reserva de aula para hoje."
              : weekendBlocked
                ? "Aulas só podem ser agendadas de segunda a sexta."
                : isReserve
                  ? "Chromebooks de reserva podem ser solicitados em qualquer horário."
                  : "Reservas de aula do dia ficam bloqueadas para alteração."}
          </div>
        )}
        {!isReserve && (
          <Field label="Carrinho">
            <select
              value={form.cart}
              onChange={(event) => update("cart", event.target.value)}
              className={inputClass}
              data-testid="select-reservation-cart"
            >
              {carts
                .filter(
                  (cart) => !cart.unavailable && cart.status !== "Manutenção",
                )
                .map((cart) => (
                  <option key={cart.id} value={cart.name}>
                    {cart.name} · {cart.available} Chromebooks disponíveis
                  </option>
                ))}
            </select>
          </Field>
        )}
        {error && (
          <p
            className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]"
            data-testid="text-reservation-error"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="button-cancel-reservation"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={sameDayBlocked || weekendBlocked}
            data-testid="button-save-reservation"
          >
            <Check size={15} />{" "}
            {reservation
              ? "Salvar alterações"
              : isReserve
                ? "Solicitar Chromebooks"
                : "Criar reserva"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ReservationsPage({
  mode = "admin",
}: {
  mode?: "admin" | "user" | "operator";
}) {
  const {
    reservations,
    saveReservation,
    teacher,
    reserveAvailable,
    teacherReserved,
    movements,
    updateMovementStatus,
    reportNotReceived,
    requestMovementAgain,
    deleteReservation,
  } = useCampusData();
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("Todos");
  const [conflictOnly, setConflictOnly] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("conflitos"),
  );
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [segmentFilter, setSegmentFilter] = useState("Todos");
  const [kindFilter, setKindFilter] = useState("Todos");
  const [expandedReservationId, setExpandedReservationId] = useState<number | null>(null);
  const [modal, setModal] = useState<{
    open: boolean;
    reservation?: Reservation;
  }>({ open: false });
  const conflictDetails = useMemo(
    () => reservationConflictDetails(reservations),
    [reservations],
  );
  const conflictIds = useMemo(
    () =>
      new Set(
        conflictDetails.flatMap(({ reservation, other }) => [
          reservation.id,
          other.id,
        ]),
      ),
    [conflictDetails],
  );
  const visibleReservations = useMemo(
    () =>
      mode === "user"
        ? reservations.filter((item) => item.teacher === teacher.name)
        : reservations,
    [mode, reservations, teacher.name],
  );
  const filtered = useMemo(
    () =>
      visibleReservations.filter((item) => {
        const matchesQuery =
          `${item.teacher} ${item.className} ${item.room} ${item.cart}`
            .toLowerCase()
            .includes(query.toLowerCase());
        const matchesDate =
          dateFilter === "Todos" ||
          (dateFilter === "Hoje" && item.date === todayISO()) ||
          (dateFilter === "Agendamento futuro" && item.date > todayISO()) ||
          (dateFilter === "Calendário" && item.date === calendarDate);
        const matchesSegment =
          segmentFilter === "Todos" || item.segment === segmentFilter;
        const matchesKind = kindFilter === "Todos" || item.kind === kindFilter;
        const matchesConflict = !conflictOnly || conflictIds.has(item.id);
        return (
          matchesQuery &&
          matchesDate &&
          matchesSegment &&
          matchesKind &&
          matchesConflict
        );
      }),
    [
      visibleReservations,
      query,
      dateFilter,
      calendarDate,
      segmentFilter,
      kindFilter,
      conflictOnly,
      conflictIds,
    ],
  );
  const groupedReservations = useMemo(
    () =>
      filtered.reduce<Record<string, Reservation[]>>((groups, item) => {
        (groups[item.date] ??= []).push(item);
        return groups;
      }, {}),
    [filtered],
  );
  const nextConflict = conflictDetails[0];
  const bookedDates = visibleReservations.map((item) => isoToDate(item.date));
  const calendarSelectedDate = calendarDate
    ? isoToDate(calendarDate)
    : undefined;
  const selectedFridayMessage = calendarDate && isFridayISO(calendarDate)
    ? fridaySabbathMessage(calendarDate)
    : null;
  const selectCalendarDate = (date?: Date) => {
    if (!date) return;
    setCalendarDate(dateToISO(date));
    setDateFilter("Calendário");
  };
  const handleSaveReservation = (data: Omit<Reservation, "id" | "status">) => {
    saveReservation(data, modal.reservation?.id);
    setModal({ open: false });
  };
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow={mode === "user" ? "Área do professor" : mode === "operator" ? "Área do TI" : "Agenda compartilhada"}
        title="Reservas"
        description={
          mode === "user"
            ? "Escolha um dia no calendário para consultar ou criar uma reserva."
            : mode === "operator"
              ? "Consulte os agendamentos para organizar a movimentação dos carrinhos."
            : "Consulte a agenda por dia e distribua os carrinhos sem conflitos."
        }
        action={
          mode !== "operator" && <Button
              onClick={() => setModal({ open: true, reservation: undefined })}
              data-testid="button-new-reservation"
            >
              <Plus size={16} /> Nova reserva
            </Button>
        }
      />
      {selectedFridayMessage && (
        <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.14)] p-4 text-sm">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[hsl(34_60%_32%)]" />
          <div>
            <p className="font-semibold text-[hsl(34_60%_28%)]">Preparação para o Sábado do Senhor</p>
            <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{selectedFridayMessage}</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label={mode === "user" ? "Minhas reservas" : "Hoje"}
          value={
            mode === "user"
              ? String(
                  reservations.filter((item) => item.teacher === teacher.name)
                    .length,
                )
              : String(
                  reservations.filter((item) => item.date === todayISO())
                    .length,
                )
          }
          detail={mode === "user" ? teacher.name : "reservas na agenda"}
          icon={CalendarDays}
        />
        <Metric
          label="Chromebooks de reserva"
          value={String(reserveAvailable)}
          detail="disponíveis para solicitação"
          icon={Laptop}
          tone={reserveAvailable > 0 ? "green" : "red"}
        />
        <Metric
          label="Próximo conflito"
          value={nextConflict?.reservation.start ?? "—"}
          detail={
            nextConflict
              ? `${nextConflict.reservation.cart} · ${nextConflict.reservation.room}`
              : "Nenhum conflito"
          }
          icon={AlertTriangle}
          tone="red"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[20rem_1fr]">
        <SectionCard title="Calendário" eyebrow="Agendamentos por dia">
          <div className="p-3">
            <Calendar
              mode="single"
              selected={calendarSelectedDate}
              onSelect={selectCalendarDate}
              modifiers={{ agendado: bookedDates }}
              modifiersClassNames={{
                agendado: "font-bold text-[hsl(var(--primary))]",
              }}
              disabled={mode === "user" ? { dayOfWeek: [0, 6] } : undefined}
              data-testid="calendar-reservations"
            />
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-[hsl(var(--border))] pt-3">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                {calendarDate
                  ? `Dia selecionado: ${formatDate(calendarDate)}`
                  : "Todos os dias"}
              </span>
              {calendarDate && (
                <button
                  type="button"
                  className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                  onClick={() => {
                    setCalendarDate(null);
                    setDateFilter("Todos");
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
            {mode === "user" && (
              <p className="mt-3 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">
                Aulas podem ser agendadas de segunda a sexta. Os dias com ponto
                indicam agendamentos existentes.
              </p>
            )}
          </div>
        </SectionCard>
        <SectionCard>
          <div className="flex flex-col gap-3 border-b border-[hsl(var(--border))] p-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:max-w-xs">
                <Search
                  size={15}
                  className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={cx(inputClass, "pl-9")}
                  placeholder="Buscar professor, sala..."
                  data-testid="input-search-reservations"
                />
              </div>
              <div className="flex items-center gap-2 overflow-auto">
                <Filter
                  size={14}
                  className="shrink-0 text-[hsl(var(--muted-foreground))]"
                />
                {["Todos", "Hoje", "Agendamento futuro"].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setDateFilter(filter);
                      setConflictOnly(false);
                      if (filter !== "Calendário") setCalendarDate(null);
                    }}
                    className={cx(
                      "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
                      dateFilter === filter
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1 overflow-auto">
              {["Todos", ...segments].map((segment) => (
                <button
                  key={segment}
                  type="button"
                  onClick={() => setSegmentFilter(segment)}
                  className={cx(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
                    segmentFilter === segment
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                  )}
                >
                  {segment}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setKindFilter(kindFilter === "Reserva" ? "Todos" : "Reserva");
                  setConflictOnly(false);
                }}
                className={cx(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
                  kindFilter === "Reserva"
                    ? "bg-[hsl(var(--accent))] text-[hsl(34_60%_25%)]"
                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                )}
              >
                Reservas
              </button>
              <button
                type="button"
                onClick={() => setConflictOnly((value) => !value)}
                className={cx(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
                  conflictOnly
                    ? "bg-[hsl(var(--destructive))] text-white"
                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                )}
                data-testid="button-filter-conflicts"
              >
                Conflitos
              </button>
            </div>
          </div>
          {conflictDetails.length > 0 && (
            <div className="m-4 rounded-xl border border-[hsl(var(--destructive)/.45)] bg-[hsl(var(--destructive)/.07)] p-4 text-xs">
              <strong className="text-[hsl(var(--destructive))]">
                Conflito de carrinho:
              </strong>{" "}
              {conflictDetails[0].reservation.teacher} e{" "}
              {conflictDetails[0].other.teacher} no mesmo horário.
            </div>
          )}
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma reserva encontrada"
              message="Escolha outro dia ou crie um novo agendamento."
              action={
                <Button
                  size="sm"
                  onClick={() =>
                    setModal({ open: true, reservation: undefined })
                  }
                >
                  <Plus size={14} /> Criar reserva
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    <th className="px-6 py-3">Horário</th>
                    <th className="px-3 py-3">Professor e turma</th>
                    <th className="px-3 py-3">Sala</th>
                    <th className="px-3 py-3">Carrinho</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedReservations)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, items]) => (
                      <Fragment key={date}>
                        <tr className="bg-[hsl(var(--muted)/.45)]">
                          <td
                            colSpan={6}
                            className="px-6 py-3 text-xs font-bold uppercase tracking-[.1em] text-[hsl(var(--primary))]"
                          >
                            {date === todayISO() ? "Hoje" : formatDate(date)} ·{" "}
                            {items.length} agendamento
                            {items.length === 1 ? "" : "s"}
                          </td>
                        </tr>
                        {items
                          .sort((a, b) => a.start.localeCompare(b.start))
                          .map((item) => (
                            <Fragment key={item.id}>
                            <tr
                              key={item.id}
                              data-testid={`row-reservation-${item.id}`}
                              className={mode === "user" ? "cursor-pointer hover:bg-[hsl(var(--muted)/.35)]" : undefined}
                              onClick={() => mode === "user" && setExpandedReservationId((current) => current === item.id ? null : item.id)}
                            >
                              <td className="px-6 py-4 font-data text-sm">
                                {item.start}–{item.end}
                              </td>
                              <td className="px-3 py-4">
                                <p className="text-sm font-semibold">
                                  {item.teacher}
                                </p>
                                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                  {item.className}
                                </p>
                              </td>
                              <td className="px-3 py-4 text-sm">{item.room}</td>
                              <td className="px-3 py-4 text-sm">{item.cart}</td>
                              <td className="px-3 py-4">
                                <StatusPill
                                  status={
                                    conflictIds.has(item.id)
                                      ? "Conflito: carrinho ocupado"
                                      : movements.find((entry) => entry.reservationId === item.id)?.status ?? item.status
                                  }
                                />
                              </td>
                              <td className="px-6 py-4 text-right">
                                {mode === "user" ? (
                                  <span className="text-[11px] font-semibold text-[hsl(var(--primary))]">
                                    {expandedReservationId === item.id ? "Fechar" : "Ver agendamento"}
                                  </span>
                                ) : mode === "operator" ? null : (
                                  <IconButton
                                    label={`Editar reserva ${item.id}`}
                                    onClick={() =>
                                      setModal({
                                        open: true,
                                        reservation: item,
                                      })
                                    }
                                  >
                                    <Edit3 size={15} />
                                  </IconButton>
                                )}
                              </td>
                            </tr>
                            {mode === "user" && expandedReservationId === item.id && (
                              <tr className="bg-[hsl(var(--primary)/.04)]">
                                <td colSpan={6} className="px-6 py-4">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-[.1em] text-[hsl(var(--primary))]">Status da entrega</p>
                                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Confirme o recebimento do carrinho ou avise a operação.</p>
                                      {movements.find((entry) => entry.reservationId === item.id)?.notReceived && (
                                        <p className="mt-2 text-xs font-semibold text-[hsl(var(--destructive))]">Carrinho não movimentado: a operação foi avisada.</p>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                                      <Button size="sm" disabled={!isReservationInProgress(item) || movements.find((entry) => entry.reservationId === item.id)?.status === "Concluído"} onClick={() => updateMovementStatus(item.id, "Concluído")}><Check size={14} /> Concluído</Button>
                                      <Button size="sm" variant="secondary" disabled={!isReservationInProgress(item) || (movements.find((entry) => entry.reservationId === item.id)?.status === "Concluído" && !movements.find((entry) => entry.reservationId === item.id)?.autoCompleted)} onClick={() => reportNotReceived(item.id)}>Não Recebi</Button>
                                      <Button size="sm" variant="secondary" disabled={!isReservationInProgress(item) || !movements.find((entry) => entry.reservationId === item.id)?.notReceived} onClick={() => requestMovementAgain(item.id)}>Pedir novamente</Button>
                                      <div className="basis-full pt-8">
                                        <Button size="sm" variant="danger" onClick={() => { if (window.confirm("Excluir este agendamento?")) { deleteReservation(item.id); setExpandedReservationId(null); } }}>Excluir agendamento</Button>
                                      </div>
                                      {!isReservationInProgress(item) && <span className="self-center text-xs text-[hsl(var(--muted-foreground))]">Disponível somente no horário da aula.</span>}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                            </Fragment>
                          ))}
                      </Fragment>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
      {modal.open && (
        <ReservationModal
          mode={mode}
          reservation={modal.reservation}
          initialDate={calendarDate ?? undefined}
          teacher={teacher}
          reserveAvailable={reserveAvailable}
          teacherReserved={teacherReserved}
          onClose={() => setModal({ open: false })}
          onSave={handleSaveReservation}
        />
      )}
    </div>
  );
}

export function CartsPage({ readOnly = false }: { readOnly?: boolean }) {
  const {
    carts,
    addCart,
    toggleCartUnavailable,
    toggleCartUnitUnavailable,
    toggleCartMaintenance,
    reservations,
    reserveAvailable,
    movementSettings,
    updateMovementSettings,
  } = useCampusData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [newCart, setNewCart] = useState({ letter: "", location: "" });
  const [expandedCarts, setExpandedCarts] = useState<string[]>([]);
  const filtered = carts.filter(
    (cart) =>
      (filter === "Todos" || filter === "Reservas"
        ? filter === "Todos" || cart.reserveCapacity > 0
        : cart.name === filter) &&
      `${cart.name} ${cart.code} ${cart.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const reserveUsed = reservations
    .filter((item) => item.kind === "Reserva")
    .reduce((total, item) => total + item.quantity, 0);
  const agendaReservations = reservations.filter((item) =>
    filter === "Todos"
      ? true
      : filter === "Reservas"
        ? item.kind === "Reserva"
        : item.cart === filter,
  );
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Ativos e disponibilidade"
        title="Carrinhos"
        description="Clique no código de cada Chromebook para marcar apenas a unidade quebrada ou indisponível. A categoria Reservas fica separada para solicitações de professores."
        action={
          !readOnly && (
          <Button
            onClick={() => setModalOpen(true)}
            data-testid="button-new-cart"
          >
            <Plus size={16} /> Adicionar carrinho
          </Button>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Inventário total"
          value={String(carts.reduce((total, cart) => total + cart.total, 0))}
          detail={`${carts.length} carrinhos cadastrados`}
          icon={Laptop}
        />
        <Metric
          label="Disponíveis agora"
          value={String(
            carts.reduce(
              (total, cart) => total + (cart.unavailable ? 0 : cart.available),
              0,
            ),
          )}
          detail="Clique no card para indisponibilizar"
          icon={CheckCircle2}
          tone="green"
        />
        <Metric
          label="Reservas"
          value={`${reserveAvailable}`}
          detail={`${reserveUsed} Chromebooks solicitados · limite 10 por professor`}
          icon={Settings2}
          tone={reserveAvailable > 0 ? "gold" : "red"}
        />
      </div>
      <SectionCard title="Movimentação dos carrinhos" eyebrow="Configurações operacionais">
        <div className="grid max-w-2xl gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Intervalo do alerta (minutos)">
            <input
              type="number"
              min="1"
              max="60"
              value={movementSettings.alertIntervalMinutes}
              onChange={(event) =>
                updateMovementSettings({
                  ...movementSettings,
                  alertIntervalMinutes: Math.max(
                    1,
                    Number(event.target.value),
                  ),
                })
              }
              className={`${inputClass} h-9`}
            />
          </Field>
          <Field label="Repetições do alerta">
            <input
              type="number"
              min="1"
              max="10"
              value={movementSettings.alertRepeat}
              onChange={(event) =>
                updateMovementSettings({
                  ...movementSettings,
                  alertRepeat: Math.max(1, Number(event.target.value)),
                })
              }
              className={`${inputClass} h-9`}
            />
          </Field>
          <Field label="Aviso de movimentação antecipada (minutos)">
            <input
              type="number"
              min="1"
              max="120"
              disabled={!movementSettings.earlyWarningEnabled}
              value={movementSettings.earlyWarningMinutes}
              onChange={(event) =>
                updateMovementSettings({
                  ...movementSettings,
                  earlyWarningMinutes: Math.min(
                    120,
                    Math.max(1, Number(event.target.value)),
                  ),
                })
              }
              className={`${inputClass} h-9`}
            />
          </Field>
          <label className="flex h-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] p-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={movementSettings.autoComplete}
              onChange={(event) =>
                updateMovementSettings({
                  ...movementSettings,
                  autoComplete: event.target.checked,
                })
              }
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Concluir automaticamente após o intervalo
          </label>
          <label className="flex h-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] p-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={movementSettings.earlyWarningEnabled}
              onChange={(event) =>
                updateMovementSettings({
                  ...movementSettings,
                  earlyWarningEnabled: event.target.checked,
                })
              }
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Avisar quando o TI movimentar o carrinho antecipadamente
          </label>
        </div>
      </SectionCard>
      <SectionCard
        title="Inventário operacional"
        eyebrow="Cada Chromebook tem um código próprio: A1, A2, B1..."
        action={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={`${inputClass} h-9 w-32 text-xs`}
              data-testid="select-filter-carts"
            >
              <option value="Todos">Todos</option>
              <option value="Reservas">Reservas</option>
              {carts.map((cart) => (
                <option key={cart.id} value={cart.name}>
                  {cart.name}
                </option>
              ))}
            </select>
            <div className="relative w-40">
              <Search
                size={14}
                className="absolute left-3 top-2.5 text-[hsl(var(--muted-foreground))]"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={cx(inputClass, "h-9 pl-8 text-xs")}
                placeholder="Buscar A1, B2..."
                data-testid="input-search-carts"
              />
            </div>
          </div>
        }
      >
        {filter === "Reservas" && (
          <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--accent)/.1)] px-5 py-4 text-xs leading-5 text-[hsl(34_60%_32%)] sm:px-6">
            <strong>Categoria Reservas:</strong> 10 Chromebooks foram separados
            dos carrinhos B e C. Professores podem solicitar até 10 no total, em
            qualquer horário. Disponíveis agora:{" "}
            <strong>{reserveAvailable}</strong>.
          </div>
        )}
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhum carrinho encontrado"
            message="Tente outra letra, código ou localização."
          />
        ) : (
          <div className="grid gap-px bg-[hsl(var(--border))] sm:grid-cols-2">
            {filtered.map((cart) => {
              const expanded = expandedCarts.includes(cart.id);
              const units = Array.from(
                { length: cart.total },
                (_, index) => `${cart.prefix}${index + 1}`,
              );
              const visibleUnits = expanded ? units : units.slice(0, 12);
              return (
                <div
                  key={cart.id}
                  className="bg-[hsl(var(--card))] p-5 transition-colors hover:bg-[hsl(var(--muted)/.3)] sm:p-6"
                  data-testid={`card-cart-${cart.id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={cx(
                          "grid h-11 w-11 place-items-center rounded-2xl text-white shadow-sm",
                          cart.accent,
                        )}
                      >
                        <Laptop size={19} />
                      </span>
                      <div>
                        <p className="font-display text-lg font-semibold">
                          {cart.name}
                        </p>
                        <p className="font-data text-[11px] text-[hsl(var(--muted-foreground))]">
                          Código {cart.code} · {cart.location}
                        </p>
                      </div>
                    </div>
                    <StatusPill
                      status={cart.unavailable ? "Indisponível" : cart.status}
                    />
                  </div>
                  <div className="mt-6 flex items-end justify-between">
                    <div className="w-2/3">
                      <div className="mb-2 flex justify-between text-xs">
                        <span className="text-[hsl(var(--muted-foreground))]">
                          Chromebooks disponíveis
                        </span>
                        <span className="font-data font-semibold">
                          {cart.unavailable ? 0 : cart.available}/{cart.total}
                        </span>
                      </div>
                      <ProgressBar
                        value={
                          cart.unavailable
                            ? 0
                            : (cart.available / cart.total) * 100
                        }
                        tone={
                          cart.unavailable
                            ? "red"
                            : cart.status === "Atenção"
                              ? "red"
                              : cart.status === "Em uso"
                                ? "gold"
                                : "teal"
                        }
                      />
                    </div>
                    <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                      {cart.lastCheck}
                    </span>
                  </div>
                  <div
                    className="mt-5 rounded-xl bg-[hsl(var(--muted)/.55)] p-3"
                    data-testid={`list-chromebooks-${cart.id}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
                        Identificação dos Chromebooks
                      </span>
                      <span className="font-data text-[11px] font-semibold">
                        {cart.prefix}1–{cart.prefix}
                        {cart.total}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleUnits.map((unit) => {
                        const unavailable =
                          cart.unavailable ||
                          cart.unavailableUnits.includes(unit);
                        return (
                          <button
                            type="button"
                            key={unit}
                            disabled={readOnly}
                            onClick={() =>
                              toggleCartUnitUnavailable(cart.id, unit)
                            }
                            className={cx(
                              "rounded-md border px-2 py-1 font-data text-[11px] transition-colors",
                              unavailable
                                ? "border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))] line-through"
                                : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/.6)]",
                            )}
                            aria-label={`${unit}: ${unavailable ? "marcar disponível" : "marcar indisponível"}`}
                            data-testid={`button-unit-${unit}`}
                          >
                            {unit}
                          </button>
                        );
                      })}
                    </div>
                    {cart.total > 12 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCarts((current) =>
                            expanded
                              ? current.filter((id) => id !== cart.id)
                              : [...current, cart.id],
                          )
                        }
                        className="mt-2 text-[11px] font-semibold text-[hsl(var(--primary))] hover:underline"
                      >
                        {expanded
                          ? "Mostrar menos"
                          : `Ver todos os ${cart.total} códigos`}
                      </button>
                    )}
                  </div>
                  {cart.reserveCapacity > 0 && (
                    <p className="mt-3 rounded-lg bg-[hsl(var(--accent)/.12)] px-3 py-2 text-[11px] font-semibold text-[hsl(34_60%_32%)]">
                      Categoria Reservas · até {cart.reserveCapacity}{" "}
                      Chromebooks
                    </p>
                  )}
                  <div className="mt-5 flex items-center justify-between border-t border-[hsl(var(--border))] pt-4">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggleCartUnavailable(cart.id)}
                      className="flex items-center gap-1.5 text-left text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      <ShieldCheck
                        size={14}
                        className="text-[hsl(var(--primary))]"
                      />{" "}
                      {cart.unavailable
                        ? "Disponibilizar carrinho inteiro"
                        : "Indisponibilizar carrinho inteiro"}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={readOnly}
                      onClick={() => toggleCartMaintenance(cart.id)}
                      data-testid={`button-toggle-cart-${cart.id}`}
                    >
                      {cart.status === "Manutenção"
                        ? "Marcar pronto"
                        : "Enviar manutenção"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      <SectionCard
        title="Agenda dos carrinhos"
        eyebrow={
          filter === "Todos"
            ? "Todas as reservas"
            : filter === "Reservas"
              ? "Categoria Reservas"
              : filter
        }
      >
        {agendaReservations.length === 0 ? (
          <EmptyState
            title="Nenhuma reserva neste filtro"
            message="As reservas aparecerão aqui assim que forem cadastradas."
          />
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {agendaReservations
              .sort((a, b) =>
                `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
              )
              .map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"
                  data-testid={`row-cart-agenda-${item.id}`}
                >
                  <div className="w-28 shrink-0">
                    <p className="font-data text-sm font-semibold">
                      {item.start}–{item.end}
                    </p>
                    <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {formatDate(item.date)}
                    </p>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-semibold">{item.teacher}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      {item.kind === "Reserva"
                        ? `${item.quantity} Chromebooks de reserva`
                        : item.className}
                    </p>
                  </div>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-[11px] font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">
                    {item.cart}
                  </span>
                  <StatusPill status={item.status} />
                </div>
              ))}
          </div>
        )}
      </SectionCard>
      {modalOpen && (
        <Modal title="Adicionar carrinho" onClose={() => setModalOpen(false)}>
          <form
            className="space-y-5 p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const letter =
                newCart.letter.trim().toUpperCase().slice(0, 1) || "D";
              addCart({
                name: `Carrinho ${letter}`,
                code: letter,
                prefix: letter,
                total: 60,
                available: 60,
                location: newCart.location || "A definir",
                status: "Pronto",
                lastCheck: "Agora",
                accent: "bg-[hsl(var(--primary))]",
                unavailable: false,
                unavailableUnits: [],
                reserveCapacity: 0,
              });
              setNewCart({ letter: "", location: "" });
              setModalOpen(false);
            }}
            data-testid="form-cart"
          >
            <Field
              label="Letra do carrinho"
              hint="Essa letra será usada para nomear os Chromebooks: D1, D2, D3..."
            >
              <input
                required
                maxLength={1}
                value={newCart.letter}
                onChange={(event) =>
                  setNewCart({ ...newCart, letter: event.target.value })
                }
                className={inputClass}
                placeholder="Ex.: D"
                data-testid="input-cart-letter"
              />
            </Field>
            <Field label="Localização">
              <input
                required
                value={newCart.location}
                onChange={(event) =>
                  setNewCart({ ...newCart, location: event.target.value })
                }
                className={inputClass}
                placeholder="Ex.: Armário D · Bloco 1"
                data-testid="input-cart-location"
              />
            </Field>
            <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
              <Button
                variant="ghost"
                onClick={() => setModalOpen(false)}
                data-testid="button-cancel-cart"
              >
                Cancelar
              </Button>
              <Button type="submit" data-testid="button-save-cart">
                <Plus size={15} /> Adicionar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function WifiPage({ readOnly = false }: { readOnly?: boolean }) {
  const {
    wifiPoints,
    wifiRooms,
    toggleRoomWifi,
    updateWifiPointStatus,
    assignMobileAntenna,
  } = useCampusData();
  const { roomOptions } = useRoomDirectory();
  const [filter, setFilter] = useState("Todos");
  const [selected, setSelected] = useState<string | null>(null);
  const [roomToAdd, setRoomToAdd] = useState("");
  const filtered = wifiPoints.filter(
    (point) =>
      filter === "Todos" ||
      point.status === filter ||
      (filter === "Antenas volantes" && point.type === "Antena volante"),
  );
  const activePoint = wifiPoints.find((point) => point.id === selected);
  const fixedPoints = wifiPoints.filter((point) => point.type === "Ponto fixo");
  const mobilePoints = wifiPoints.filter(
    (point) => point.type === "Antena volante",
  );
  const roomsWithoutWifi = wifiRooms.filter((room) => !room.hasWifi);
  const addRoomWithoutWifi = () => {
    if (!roomToAdd || wifiRooms.some((room) => room.room === roomToAdd)) return;
    toggleRoomWifi(roomToAdd);
    setRoomToAdd("");
  };
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Conectividade do campus"
        title="Pontos Wi‑Fi"
        description="Cadastre os pontos físicos e identifique as salas sem cobertura fixa. Quando uma sala sem Wi‑Fi receber um agendamento, a reserva avisará que será preciso levar uma antena volante."
        action={
          !readOnly && (
          <Button
            variant="secondary"
            onClick={() => setSelected(null)}
            data-testid="button-refresh-wifi"
          >
            <RefreshCcw size={15} /> Atualizar cadastro
          </Button>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Pontos cadastrados"
          value={String(wifiPoints.length)}
          detail={`${fixedPoints.length} fixos · ${mobilePoints.length} antenas volantes`}
          icon={Network}
        />
        <Metric
          label="Salas sem Wi‑Fi fixo"
          value={String(roomsWithoutWifi.length)}
          detail="exigem antena volante na reserva"
          icon={WifiOff}
          tone={roomsWithoutWifi.length ? "gold" : "green"}
        />
        <Metric
          label="Antenas disponíveis"
          value={String(
            mobilePoints.filter((point) => point.status === "Disponível")
              .length,
          )}
          detail="prontas para deslocamento"
          icon={Router}
          tone="teal"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <SectionCard
          title="Cadastro de pontos"
          eyebrow="Pontos fixos e antenas volantes"
          action={
            <div className="flex items-center gap-1 rounded-lg bg-[hsl(var(--muted))] p-1">
              {["Todos", "Disponível", "Em manutenção", "Antenas volantes"].map(
                (item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setFilter(item)}
                    className={cx(
                      "rounded-md px-2.5 py-1.5 text-[11px] font-semibold",
                      filter === item
                        ? "bg-[hsl(var(--card))] shadow-sm"
                        : "text-[hsl(var(--muted-foreground))]",
                    )}
                    data-testid={`button-filter-wifi-${item.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
          }
        >
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhum ponto encontrado"
              message="Cadastre ou ajuste o filtro para consultar um ponto."
            />
          ) : (
            <div className="divide-y divide-[hsl(var(--border))]">
              {filtered.map((point) => (
                <button
                  type="button"
                  key={point.id}
                  onClick={() => setSelected(point.id)}
                  className={cx(
                    "flex w-full items-start gap-4 px-5 py-5 text-left transition-colors hover:bg-[hsl(var(--muted)/.35)] sm:px-6",
                    selected === point.id && "bg-[hsl(var(--primary)/.06)]",
                  )}
                  data-testid={`row-wifi-${point.id}`}
                >
                  <span
                    className={cx(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                      point.type === "Antena volante"
                        ? "bg-[hsl(var(--accent)/.2)] text-[hsl(34_60%_32%)]"
                        : "bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]",
                    )}
                  >
                    {point.type === "Antena volante" ? (
                      <Router size={18} />
                    ) : (
                      <Wifi size={18} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {point.name}
                      </p>
                      <StatusPill status={point.status} />
                    </div>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      {point.point} · {point.type}
                    </p>
                    <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {point.location} · {point.rack}
                      {point.assignedRoom ? ` · em ${point.assignedRoom}` : ""}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="mt-2 text-[hsl(var(--muted-foreground))]"
                  />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard
          title={activePoint ? activePoint.point : "Salas sem cobertura fixa"}
          eyebrow={
            activePoint ? activePoint.name : "Alerta automático nas reservas"
          }
        >
          {activePoint ? (
            <div className="space-y-5 p-5 sm:p-6">
              <div className="rounded-xl bg-[hsl(var(--muted)/.5)] p-4">
                <p className="text-xs font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
                  Identificação operacional
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {activePoint.location}
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {activePoint.rack}
                </p>
              </div>
              <Field label="Status do ponto">
                <select
                  value={activePoint.status}
                  onChange={(event) =>
                    updateWifiPointStatus(
                      activePoint.id,
                      event.target.value as
                        "Disponível" | "Em uso" | "Em manutenção",
                    )
                  }
                  className={inputClass}
                  data-testid={`select-wifi-status-${activePoint.id}`}
                >
                  <option>Disponível</option>
                  <option>Em uso</option>
                  <option>Em manutenção</option>
                </select>
              </Field>
              {activePoint.type === "Antena volante" && (
                <Field
                  label="Sala atendida agora"
                  hint="A antena volta para Disponível quando a sala é removida."
                >
                  <select
                    value={activePoint.assignedRoom ?? ""}
                    onChange={(event) =>
                      assignMobileAntenna(
                        activePoint.id,
                        event.target.value || undefined,
                      )
                    }
                    className={inputClass}
                    disabled={readOnly}
                    data-testid={`select-wifi-room-${activePoint.id}`}
                  >
                    <option value="">Nenhuma sala</option>
                    {roomsWithoutWifi.map((room) => (
                      <option key={room.room} value={room.room}>
                        {room.room}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                Marque aqui as salas que não têm ponto fixo. Elas aparecerão com
                um alerta na criação de uma reserva, indicando a necessidade da
                antena volante e permitindo consultar qual ponto está
                cadastrado.
              </p>
              <div className="mt-5 space-y-2">
                {wifiRooms.map((room) => (
                  <label
                    key={room.room}
                    className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={room.hasWifi}
                      disabled={readOnly}
                      onChange={() => toggleRoomWifi(room.room)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      data-testid={`checkbox-wifi-room-${room.room.replaceAll(" ", "-")}`}
                    />
                    <span className="flex-1">{room.room}</span>
                    <span
                      className={cx(
                        "text-[11px] font-semibold",
                        room.hasWifi
                          ? "text-[hsl(var(--primary))]"
                          : "text-[hsl(34_60%_32%)]",
                      )}
                    >
                      {room.hasWifi ? "Ponto fixo" : "Antena volante"}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <select
                  value={roomToAdd}
                  onChange={(event) => setRoomToAdd(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Adicionar sala ao cadastro</option>
                  {roomOptions
                    .filter(
                      (room) => !wifiRooms.some((item) => item.room === room),
                    )
                    .map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                </select>
                <Button
                  size="sm"
                  onClick={addRoomWithoutWifi}
                  disabled={readOnly || !roomToAdd}
                >
                  <Plus size={14} /> Adicionar
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export function HistoryPage() {
  const { movements, reservations } = useCampusData();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("Todos");
  const [exported, setExported] = useState(false);
  const types = ["Todos", "Reserva", "Equipamento", "Wi-Fi", "Movimentação"];
  const movementHistory = movements.flatMap((movement) => {
    const reservation = reservations.find((item) => item.id === movement.reservationId);
    if (!reservation) return [];
    const events = [];
    if (movement.movedAt) {
      events.push({
        id: `movement-${movement.reservationId}-moved`,
        time: new Date(movement.movedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        title: movement.movedLate ? "Carrinho movido com atraso" : "Carrinho em movimentação",
        detail: `${reservation.cart} · ${reservation.room} · Movido por: ${movement.movedBy ?? "TI"}`,
        type: "Movimentação",
        tone: "warm",
      });
    }
    if (movement.completedAt) {
      events.push({
        id: `movement-${movement.reservationId}-completed`,
        time: new Date(movement.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        title: "Movimentação concluída",
        detail: `${reservation.cart} · ${reservation.room} · Concluído por: ${movement.completedBy ?? "TI"}`,
        type: "Movimentação",
        tone: "good",
      });
    }
    return events;
  });
  const historyEvents = [...movementHistory, ...historySeed];
  const filtered = historyEvents.filter(
    (event) =>
      (type === "Todos" || event.type === type) &&
      `${event.title} ${event.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Rastro da operação"
        title="Histórico"
        description="Tudo que aconteceu com as reservas, equipamentos e conectividade do campus."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setExported(true);
              window.setTimeout(() => setExported(false), 2200);
            }}
            data-testid="button-export-history"
          >
            <Download size={15} />{" "}
            {exported ? "Arquivo preparado" : "Exportar registro"}
          </Button>
        }
      />
      <SectionCard>
        <div className="flex flex-col gap-3 border-b border-[hsl(var(--border))] p-4 sm:flex-row sm:items-center sm:px-6">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={cx(inputClass, "pl-9")}
              placeholder="Buscar no histórico..."
              data-testid="input-search-history"
            />
          </div>
          <div className="flex gap-1 overflow-auto">
            {types.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setType(item)}
                className={cx(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold",
                  type === item
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                )}
                data-testid={`button-filter-history-${item.toLowerCase().replaceAll("-", "")}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma atividade encontrada"
            message="Tente remover filtros ou buscar por outro termo."
          />
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {filtered.map((event) => (
              <div
                key={event.id}
                className="flex gap-4 px-5 py-5 sm:px-6"
                data-testid={`row-history-${event.id}`}
              >
                <div className="w-12 shrink-0 pt-0.5">
                  <p className="font-data text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                    {event.time}
                  </p>
                </div>
                <div
                  className={cx(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    event.tone === "good" &&
                      "bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]",
                    event.tone === "warm" &&
                      "bg-[hsl(var(--accent)/.18)] text-[hsl(34_60%_32%)]",
                    event.tone === "bad" &&
                      "bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]",
                  )}
                >
                  {event.type === "Wi-Fi" ? (
                    <Wifi size={16} />
                  ) : event.type === "Reserva" ? (
                    <CalendarDays size={16} />
                  ) : (
                    <Laptop size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <StatusPill
                      status={
                        event.type === "Wi-Fi"
                          ? "Atenção"
                          : event.tone === "bad"
                            ? "Atenção"
                            : "Concluída"
                      }
                    />
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                    {event.detail}
                  </p>
                </div>
                <MoreHorizontal
                  size={17}
                  className="shrink-0 text-[hsl(var(--muted-foreground))]"
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
