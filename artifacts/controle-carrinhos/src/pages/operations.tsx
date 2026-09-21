import { Fragment, useEffect, useMemo, useState } from "react";
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
  Pencil,
  Save,
  Trash2,
  Settings2,
  ShieldCheck,
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
  isCartTransitionConflict,
  reservationsOverlap,
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
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: "teal" | "gold" | "green" | "red";
  href?: string;
  onClick?: () => void;
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
    <Link href={href} onClick={onClick} aria-label={`Abrir ${label}`}>
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
  const { adminAccounts, operatorAccounts, carts, reservations } = useCampusData();
  const storedAdminName = typeof window !== "undefined"
    ? window.localStorage.getItem("controle-carrinhos-admin-name")
    : null;
  const storedOperatorName = typeof window !== "undefined"
    ? window.localStorage.getItem("controle-carrinhos-operator-name")
    : null;
  const userName =
    adminAccounts.find((account) => account.name === storedAdminName)?.name ??
    operatorAccounts.find((account) => account.name === storedOperatorName)?.name ??
    storedAdminName ??
    storedOperatorName ??
    "Administrador";
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("06:55");
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const liveCartAvailability = useMemo(() => {
    const today = todayISO();
    const time = currentTime.toTimeString().slice(0, 5);
    return carts.reduce(
      (summary, cart) => {
        const unavailableUnits = cart.unavailable ? cart.total : cart.unavailableUnits.length;
        const reservedUnits = reservations
          .filter((reservation) =>
            reservation.date === today &&
            reservation.cart === cart.name &&
            reservation.status !== "Concluída" &&
            reservation.start <= time &&
            time < reservation.end,
          )
          .reduce((total, reservation) => total + reservation.quantity, 0);
        const available = Math.max(0, cart.total - unavailableUnits - reservedUnits);
        summary.total += cart.total;
        summary.available += available;
        summary.inUse += reservedUnits;
        summary.unavailable += unavailableUnits;
        return summary;
      },
      { total: 0, available: 0, inUse: 0, unavailable: 0 },
    );
  }, [carts, reservations, currentTime]);
  const overviewConflicts = useMemo(
    () => reservationConflictDetails(reservations),
    [reservations],
  );
  const nextOverviewConflict = overviewConflicts[0];
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
          title={`Bom dia, ${userName}.`}
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
        title={`Bom dia, ${userName}.`}
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
          value={String(overviewConflicts.length)}
          detail={nextOverviewConflict
            ? `Requer decisão até ${nextOverviewConflict.reservation.start}`
            : "Nenhuma sobreposição de carrinhos"}
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
                state: overviewConflicts.length > 0 ? "Conflito" : "Mais tarde",
                dot: overviewConflicts.length > 0
                  ? "bg-[hsl(var(--destructive))]"
                  : "bg-[hsl(var(--muted-foreground))]",
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
            <Link href="/carrinhos" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            <div className="flex items-center gap-3 transition-colors hover:text-[hsl(var(--primary))]">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]">
                <Check size={18} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Carrinhos conferidos</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {liveCartAvailability.available} de {liveCartAvailability.total} Chromebooks disponíveis agora
                </p>
              </div>
              <span className="font-data text-xs font-bold text-[hsl(var(--primary))]">
                {liveCartAvailability.total > 0
                  ? `${Math.round((liveCartAvailability.available / liveCartAvailability.total) * 100)}%`
                  : "0%"}
              </span>
            </div>
            <ProgressBar value={liveCartAvailability.total > 0 ? (liveCartAvailability.available / liveCartAvailability.total) * 100 : 0} />
            </Link>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
              <span><strong className="text-[hsl(var(--foreground))]">{liveCartAvailability.available}</strong> disponíveis</span>
              <span><strong className="text-[hsl(var(--foreground))]">{liveCartAvailability.inUse}</strong> em agenda</span>
              <span><strong className="text-[hsl(var(--foreground))]">{liveCartAvailability.unavailable}</strong> indisponíveis</span>
            </div>
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
  onSave: (value: Omit<Reservation, "id" | "status">) => boolean;
  teacher: { name: string; segment: Segment; subject: string };
  reserveAvailable: number;
  teacherReserved: number;
}) {
  const { classEntries, roomForClass, classesForRoom, roomOptionsForSegment } =
    useRoomDirectory();
  const { carts, reservations, wifiRooms, wifiPoints, movementSettings, campusSettings } = useCampusData();
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
    reservedChromebooks: reservation?.reservedChromebooks?.join(", ") ?? "",
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
  const mobileWifiPoints = wifiPoints.filter((point) => point.type === "Antena volante");
  const sameDayBlocked =
    mode === "user" && form.kind === "Aula" && form.date === todayISO();
  const isReserve = form.kind === "Reserva";
  const weekendBlocked =
    mode === "user" && form.kind === "Aula" && isWeekendISO(form.date);
  const availableSchedule = isReserve
    ? []
    : scheduleFor(form.cart, form.period, form.date).filter(
        (slot) =>
          !isCartTransitionConflict({
            cart: form.cart,
            start: slot.start,
            kind: form.kind,
          }, movementSettings.allowCartATransitionScheduling),
      );
  const selectedScheduleSlot = availableSchedule.find(
    (slot) => slot.start === form.start && slot.end === form.end,
  );
  const maxForTeacher = Math.max(
    0,
    campusSettings.reservationLimit -
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
          if (isReserve && !campusSettings.reservationsEnabled) {
            setError("As reservas de Chromebooks estão desativadas pelo administrador.");
            return;
          }
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
          const reservationData = {
            ...form,
            quantity,
            reservedChromebooks: form.reservedChromebooks.split(",").map((item) => item.trim()).filter(Boolean).slice(0, quantity),
            segment: form.segment,
            subject: form.subject,
            kind: form.kind,
            className: isReserve
              ? "Chromebooks de reserva"
              : form.className || form.room,
            room: isReserve ? "Reserva" : form.room,
            cart: isReserve ? "Reservas" : form.cart,
          };
          if (!isReserve && isCartTransitionConflict(reservationData, movementSettings.allowCartATransitionScheduling)) {
            setError("O horário de transição entre turnos (11:50–12:45 ou 12:00–12:45) está indisponível para todos os carrinhos.");
            return;
          }
          if (!isReserve && reservations.some(
            (item) => item.id !== reservation?.id && reservationsOverlap(item, reservationData),
          )) {
            setError("Este carrinho já está reservado nesse horário. Escolha outro horário ou carrinho.");
            return;
          }
          if (!sameDayBlocked && !onSave(reservationData)) {
            setError("Este carrinho acabou de ser reservado nesse horário. Escolha outro horário ou carrinho.");
          }
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
                <p className="mt-1">
                  Antenas cadastradas:{" "}
                  <strong>
                    {mobileWifiPoints.length
                      ? mobileWifiPoints.map((point) => point.point).join(", ")
                      : "nenhuma"}
                  </strong>
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
                max={Math.min(campusSettings.reservationLimit, maxForTeacher)}
                value={form.quantity}
                onChange={(event) => update("quantity", event.target.value)}
                className={inputClass}
                data-testid="input-reservation-quantity"
              />
            </Field>
          )}
          {isReserve && (
            <Field label="Códigos opcionais" hint="Informe códigos separados por vírgula. Sem códigos, os últimos disponíveis serão separados automaticamente.">
              <input value={form.reservedChromebooks} onChange={(event) => update("reservedChromebooks", event.target.value)} className={inputClass} placeholder="B51, B52, C49" />
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
  const { floorForRoom } = useRoomDirectory();
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
    carts,
    movementSettings,
  } = useCampusData();
  const recommendCart = (data: Omit<Reservation, "id" | "status">) => {
    if (data.kind !== "Aula" || data.cart === "Reservas") return data.cart;
    const floor = floorForRoom(data.room);
    const candidates = ["Carrinho A", "Carrinho B", "Carrinho C"].filter((cart) => {
      const matchingCart = carts.find((item) => item.name === cart);
      return !matchingCart?.unavailable &&
        !isCartTransitionConflict({ cart, start: data.start, kind: data.kind }, movementSettings.allowCartATransitionScheduling);
    });
    const available = candidates.filter((cart) =>
      !reservations.some((item) =>
        item.id !== modal.reservation?.id &&
        item.date === data.date &&
        item.cart === cart &&
        item.start < data.end &&
        data.start < item.end,
      ),
    );
    // Keep the requested cart when every candidate is occupied so the save
    // layer can reject the request instead of creating a duplicate booking.
    if (available.length === 0) return data.cart;
    const pool = available;
    const floorHistory = reservations.filter((item) =>
      item.date === data.date &&
      item.kind === "Aula" &&
      floorForRoom(item.room) === floor &&
      pool.includes(item.cart),
    );
    return [...pool].sort((first, second) => {
      const firstLast = floorHistory.filter((item) => item.cart === first).sort((a, b) => b.start.localeCompare(a.start))[0];
      const secondLast = floorHistory.filter((item) => item.cart === second).sort((a, b) => b.start.localeCompare(a.start))[0];
      if (firstLast && !secondLast) return -1;
      if (secondLast && !firstLast) return 1;
      return first === data.cart ? -1 : second === data.cart ? 1 : first.localeCompare(second);
    })[0] ?? data.cart;
  };
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
  const floorSuggestions = useMemo(() => {
    const suggestions: Array<{ current: Reservation; previous: Reservation; floor: string }> = [];
    const ordered = [...reservations].filter((item) => item.kind === "Aula").sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
    ordered.forEach((current, index) => {
      const previous = ordered.slice(0, index).reverse().find((item) =>
        item.date === current.date &&
        item.cart !== current.cart &&
        item.start < current.start &&
        floorForRoom(item.room) === floorForRoom(current.room),
      );
      if (previous && !suggestions.some((item) => item.current.id === current.id)) {
        suggestions.push({ current, previous, floor: floorForRoom(current.room) });
      }
    });
    return suggestions;
  }, [floorForRoom, reservations]);
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
    const saved = saveReservation({ ...data, cart: recommendCart(data) }, modal.reservation?.id);
    if (saved) setModal({ open: false });
    return saved;
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
      {mode !== "user" && floorSuggestions.length > 0 && (
        <SectionCard title="Otimização por piso" eyebrow="Sugestões para reduzir trocas de andar">
          <div className="divide-y divide-[hsl(var(--border))]">
            {floorSuggestions.slice(0, 5).map(({ current, previous, floor }) => (
              <div key={current.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                <div>
                  <p className="text-sm font-semibold">{current.date} · {current.start} · {current.room} ({floor})</p>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">O {previous.cart} já estará no mesmo piso às {previous.start} em {previous.room}.</p>
                </div>
                <span className="rounded-full bg-[hsl(var(--accent)/.18)] px-3 py-1 text-xs font-bold text-[hsl(34_60%_32%)]">Sugestão: {previous.cart}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
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
                              <td className="px-3 py-4 text-sm"><p>{item.room}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{floorForRoom(item.room)}</p></td>
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
    deleteCart,
    toggleCartUnavailable,
    toggleCartUnitUnavailable,
    reservations,
    reserveAvailable,
    campusSettings,
    updateCampusSettings,
  } = useCampusData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [reserveCategoryOpen, setReserveCategoryOpen] = useState(false);
  const [newCart, setNewCart] = useState({ letter: "", location: "" });
  const [expandedCarts, setExpandedCarts] = useState<string[]>([]);
  const isSuperAdmin =
    typeof window !== "undefined" &&
    window.localStorage.getItem("controle-carrinhos-super-admin") === "true";
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
          detail={`${reserveUsed} Chromebooks solicitados`}
          icon={Settings2}
          tone={reserveAvailable > 0 ? "gold" : "red"}
        />
      </div>
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
            <button type="button" className="w-full text-left" onClick={() => setFilter("Reservas")}>
              <strong>Categoria Reservas</strong>
              <span className="ml-2">· Últimos Chromebooks adicionados automaticamente · Disponíveis agora: <strong>{reserveAvailable}</strong>.</span>
            </button>
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
              const reserveUnits = units.slice(-Math.max(1, cart.reserveCapacity));
              const visibleUnits = filter === "Reservas"
                ? reserveUnits
                : expanded ? units : units.slice(0, 12);
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
                    className="mt-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3"
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
                    <p className="mt-3 rounded-lg bg-[hsl(var(--card))] px-3 py-2 text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                      Categoria Reservas
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
                    <div className="flex items-center gap-2">
                      {isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const used = reservations.some((item) => item.cart === cart.name);
                            const warning = used
                              ? `Este carrinho aparece em agendamentos existentes. Excluir ${cart.name} mesmo assim?`
                              : `Excluir ${cart.name}? Esta ação não pode ser desfeita.`;
                            if (window.confirm(warning)) deleteCart(cart.id);
                          }}
                          data-testid={`button-delete-cart-${cart.id}`}
                        >
                          <Trash2 size={14} /> Excluir carrinho
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      <SectionCard
        title="Categoria Reservas"
        eyebrow="Configuração operacional"
        action={
          <button
            type="button"
            onClick={() => setReserveCategoryOpen((open) => !open)}
            aria-expanded={reserveCategoryOpen}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--muted))]"
          >
            {reserveCategoryOpen ? "Recolher" : "Abrir"}
            <ChevronRight size={15} className={reserveCategoryOpen ? "rotate-90 transition-transform" : "transition-transform"} />
          </button>
        }
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setReserveCategoryOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") setReserveCategoryOpen((open) => !open);
          }}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[hsl(var(--muted)/.35)] sm:px-6"
          aria-expanded={reserveCategoryOpen}
        >
          <span>
            <span className="block text-sm font-semibold">Disponibilizar reservas</span>
            <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">A reserva usa os carrinhos B e C. Sem códigos escolhidos, os últimos disponíveis serão separados.</span>
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              updateCampusSettings({ ...campusSettings, reservationsEnabled: !campusSettings.reservationsEnabled });
            }}
            aria-pressed={campusSettings.reservationsEnabled}
            className="ml-4 shrink-0 rounded-full border border-[hsl(var(--border))] px-3 py-1 text-xs font-semibold text-[hsl(var(--primary))] transition hover:border-[hsl(var(--primary)/.55)] hover:bg-[hsl(var(--primary)/.06)]"
          >
            {campusSettings.reservationsEnabled ? "Ativa" : "Desativada"}
          </button>
        </div>
        {reserveCategoryOpen && (
          <div className="grid gap-3 border-t border-[hsl(var(--border))] p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">Os códigos podem ser escolhidos na reserva. Quando não forem informados, o sistema adiciona automaticamente os últimos disponíveis.</p>
            <Field label="Limite por professor">
              <input type="number" min="1" value={campusSettings.reservationLimit} onChange={(event) => updateCampusSettings({ ...campusSettings, reservationLimit: Math.max(1, Number(event.target.value) || 1) })} className={`${inputClass} h-9`} />
            </Field>
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
    updateWifiPoint,
    addWifiPoint,
    deleteWifiPoint,
    assignMobileAntenna,
  } = useCampusData();
  const { roomOptions } = useRoomDirectory();
  const [selected, setSelected] = useState<string | null>(null);
  const [roomTab, setRoomTab] = useState<"fixed" | "mobile">("fixed");
  const [roomSearch, setRoomSearch] = useState("");
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [draftPoint, setDraftPoint] = useState({ name: "", point: "", rack: "", observations: "" });
  const [newAntennaOpen, setNewAntennaOpen] = useState(false);
  const [editingAntenna, setEditingAntenna] = useState<string | null>(null);
  const [newAntenna, setNewAntenna] = useState({ name: "", point: "", rack: "", observations: "" });
  const [antennaError, setAntennaError] = useState("");
  const activePoint = wifiPoints.find((point) => point.id === selected);
  const allWifiRooms = roomOptions.map(
    (room) => wifiRooms.find((item) => item.room === room) ?? { room, hasWifi: true },
  );
  const fixedPoints = wifiPoints.filter((point) => point.type === "Ponto fixo");
  const mobilePoints = wifiPoints.filter(
    (point) => point.type === "Antena volante",
  );
  const filtered = mobilePoints;
  const roomsWithoutWifi = allWifiRooms.filter((room) => !room.hasWifi);
  const roomsWithWifi = allWifiRooms.filter((room) => room.hasWifi);
  const visibleRoomList = (roomTab === "fixed" ? roomsWithWifi : roomsWithoutWifi)
    .filter((room) => room.room.toLowerCase().includes(roomSearch.trim().toLowerCase()));
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Conectividade do campus"
        title="Pontos Wi‑Fi"
        description="Cadastre os pontos físicos e identifique as salas sem cobertura fixa. Quando uma sala sem Wi‑Fi receber um agendamento, a reserva avisará que será preciso levar uma antena volante."
        action={
          !readOnly && (
          <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setAntennaError(""); setNewAntennaOpen(true); }} data-testid="button-create-mobile-antenna">
            <Plus size={15} /> Nova antena volante
          </Button>
          <Button
            variant="secondary"
            onClick={() => { setSelected(null); setEditingRoom(null); setNewAntennaOpen(false); }}
            data-testid="button-refresh-wifi"
          >
            <RefreshCcw size={15} /> Atualizar cadastro
          </Button>
          </div>
          )
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Pontos cadastrados"
          value={String(wifiPoints.length)}
          detail={`${fixedPoints.length} fixos · ${mobilePoints.length} antenas volantes`}
          icon={Network}
          href="#wifi-rooms"
          onClick={() => setRoomTab("fixed")}
        />
        <Metric
          label="Salas sem Wi‑Fi fixo"
          value={String(roomsWithoutWifi.length)}
          detail="exigem antena volante na reserva"
          icon={WifiOff}
          tone={roomsWithoutWifi.length ? "gold" : "green"}
          href="#wifi-rooms-without-coverage"
          onClick={() => setRoomTab("mobile")}
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
          href="#mobile-antennas"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div id="mobile-antennas" className="scroll-mt-24">
          <SectionCard
            title="Antenas volantes"
            eyebrow="Acompanhe a antena e a sala atendida"
            action={<span className="rounded-full bg-[hsl(var(--accent)/.2)] px-3 py-1.5 text-xs font-semibold text-[hsl(34_60%_32%)]">{mobilePoints.length} cadastradas</span>}
          >
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma antena volante cadastrada"
              message="Use o botão Nova antena volante para cadastrar uma antena."
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
                      {point.location}{point.rack ? ` · ${point.rack}` : ""}
                    </p>
                    <p className={cx("mt-2 text-xs font-semibold", point.assignedRoom ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]")}>
                      {point.assignedRoom ? `Sala atendida: ${point.assignedRoom} · ${point.point}` : `Sem sala atendida · ${point.point}`}
                    </p>
                    {point.attendedRoom && !point.assignedRoom && (
                      <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                        Última sala atendida: {point.attendedRoom}
                      </p>
                    )}
                    {point.observations && (
                      <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                        {point.observations}
                      </p>
                    )}
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
        </div>
        <div id="wifi-rooms" className="scroll-mt-24">
          <SectionCard
            title={activePoint ? activePoint.point : "Salas e cobertura"}
            eyebrow={
              activePoint ? activePoint.name : "Organize as salas por cobertura"
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
                  {activePoint.rack || "Rack não informado"}
                </p>
                {activePoint.attendedRoom && (
                  <p className="mt-2 text-xs font-semibold text-[hsl(var(--primary))]">
                    Sala atendida: {activePoint.attendedRoom}
                  </p>
                )}
                {activePoint.observations && (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {activePoint.observations}
                  </p>
                )}
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
              {!readOnly && activePoint.type === "Antena volante" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingAntenna(activePoint.id);
                      setNewAntenna({
                        name: activePoint.name,
                        point: activePoint.point,
                        rack: activePoint.rack ?? "",
                        observations: activePoint.observations ?? "",
                      });
                      setAntennaError("");
                    }}
                  >
                    <Pencil size={14} /> Editar antena
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]"
                    onClick={() => {
                      if (window.confirm(`Excluir ${activePoint.name}?`)) {
                        deleteWifiPoint(activePoint.id);
                        setSelected(null);
                      }
                    }}
                    data-testid={`button-delete-wifi-${activePoint.id}`}
                  >
                    <Trash2 size={14} /> Excluir antena volante
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <div className="relative mb-4">
                <Search
                  size={15}
                  className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]"
                />
                <input
                  type="search"
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                  className={cx(inputClass, "pl-9")}
                  placeholder="Buscar por sala..."
                  aria-label="Buscar por sala"
                  data-testid="input-search-wifi-room"
                />
              </div>
              <div id="wifi-rooms-without-coverage" className="scroll-mt-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.25)] p-1">
                <div className="grid grid-cols-2 gap-1">
                  {([
                    ["fixed", "Salas com Wi‑Fi", Wifi, roomsWithWifi.length],
                    ["mobile", "Salas sem cobertura fixa", WifiOff, roomsWithoutWifi.length],
                  ] as const).map(([value, label, Icon, count]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setRoomTab(value)}
                      className={cx(
                        "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors",
                        roomTab === value
                          ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                          : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
                      )}
                      data-testid={`tab-wifi-rooms-${value}`}
                    >
                      <Icon size={14} />
                      <span>{label}</span>
                      <span className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px]">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
              {roomTab === "mobile" && (
                <p className="mt-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                  Salas sem cobertura fixa. Ao criar uma reserva, o sistema avisará que será necessário levar uma antena volante.
                </p>
              )}
              <div className="mt-4 space-y-2">
                {visibleRoomList.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-5 text-center text-xs text-[hsl(var(--muted-foreground))]">
                    Nenhuma sala nesta aba.
                  </div>
                ) : visibleRoomList.map((room) => {
                  const assignedPoints = wifiPoints.filter((point) => point.assignedRoom === room.room);
                  const availablePoints = wifiPoints.filter(
                    (point) => point.type === "Ponto fixo" && (!point.assignedRoom || point.assignedRoom === room.room),
                  );
                  const startEdit = (point?: typeof wifiPoints[number]) => {
                    setEditingPointId(point?.id ?? null);
                    setEditingRoom(room.room);
                    setDraftPoint({ name: point?.name ?? room.room, point: point?.point ?? "", rack: point?.rack ?? "", observations: point?.observations ?? "" });
                  };
                  return (
                  <div
                    key={room.room}
                    className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm"
                  >
                    {room.hasWifi ? <Wifi size={16} className="shrink-0 text-[hsl(var(--primary))]" /> : <WifiOff size={16} className="shrink-0 text-[hsl(34_60%_32%)]" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{room.room}</p>
                      {assignedPoints.map((assignedPoint) => (
                        <div key={assignedPoint.id} className="mt-1 space-y-0.5 text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">
                          <p className="break-words"><span className="font-medium text-[hsl(var(--muted-foreground))]">Ponto:</span>{" "}{assignedPoint.point}</p>
                          {assignedPoint.rack && <p className="break-words"><span className="font-medium text-[hsl(var(--muted-foreground))]">Rack:</span>{" "}{assignedPoint.rack}</p>}
                          {assignedPoint.observations && <p className="break-words"><span className="font-medium text-[hsl(var(--muted-foreground))]">Observações:</span>{" "}{assignedPoint.observations}</p>}
                        </div>
                      ))}
                    </div>
                    <Button type="button" size="sm" variant="ghost" disabled={readOnly} onClick={() => startEdit(assignedPoints[0])} className="shrink-0" data-testid={`button-edit-wifi-room-${room.room.replaceAll(" ", "-")}`}>
                      <Pencil size={14} /> Editar
                    </Button>
                    {room.hasWifi && (
                      <Button type="button" size="sm" variant="ghost" disabled={readOnly} onClick={() => startEdit()} className="shrink-0">
                        <Plus size={14} /> Adicionar ponto
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="max-w-full shrink-0"
                      disabled={readOnly}
                      onClick={() => toggleRoomWifi(room.room)}
                      data-testid={`button-move-wifi-room-${room.room.replaceAll(" ", "-")}`}
                    >
                      {room.hasWifi ? "Mover para sem cobertura" : "Mover para com Wi‑Fi"}
                    </Button>
                    {editingRoom === room.room && (
                      <div className="basis-full min-w-0 border-t border-[hsl(var(--border))] pt-3">
                        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
                        <select
                          value={editingPointId ?? ""}
                          onChange={(event) => {
                            const point = wifiPoints.find((item) => item.id === event.target.value);
                            setEditingPointId(point?.id ?? null);
                            setDraftPoint({
                              name: point?.name ?? room.room,
                              point: point?.point ?? "",
                              rack: point?.rack ?? "",
                              observations: point?.observations ?? "",
                            });
                          }}
                          className={`${inputClass} h-9 min-w-0 text-xs`}
                          aria-label={`Selecionar ponto da ${room.room}`}
                        >
                          <option value="">Novo ponto</option>
                          {availablePoints.map((point) => (
                            <option key={point.id} value={point.id}>
                              {point.point} · {point.name}
                            </option>
                          ))}
                        </select>
                        <input value={draftPoint.name} onChange={(event) => setDraftPoint({ ...draftPoint, name: event.target.value })} className={`${inputClass} h-9 min-w-0 text-xs`} placeholder="Nome do ponto" />
                        <input value={draftPoint.point} onChange={(event) => setDraftPoint({ ...draftPoint, point: event.target.value })} className={`${inputClass} h-9 min-w-0 text-xs`} placeholder="Ponto" />
                        <input value={draftPoint.rack} onChange={(event) => setDraftPoint({ ...draftPoint, rack: event.target.value })} className={`${inputClass} h-9 min-w-0 text-xs`} placeholder="Rack (opcional)" />
                        <input value={draftPoint.observations} onChange={(event) => setDraftPoint({ ...draftPoint, observations: event.target.value })} className={`${inputClass} h-9 min-w-0 text-xs`} placeholder="Observações: switch, ponto..." />
                        <IconButton
                          label="Cancelar edição do ponto"
                          onClick={() => {
                            setEditingRoom(null);
                            setEditingPointId(null);
                          }}
                        >
                          <X size={15} />
                        </IconButton>
                        <Button type="button" size="sm" className="w-full lg:w-auto" disabled={!draftPoint.name.trim() || !draftPoint.point.trim()} onClick={() => {
                          const data = { name: draftPoint.name.trim(), point: draftPoint.point.trim(), rack: draftPoint.rack.trim() || undefined, observations: draftPoint.observations.trim() || undefined };
                          const pointToUpdate = wifiPoints.find((point) => point.id === editingPointId);
                          if (pointToUpdate) {
                            updateWifiPoint(pointToUpdate.id, { ...data, assignedRoom: room.room });
                          } else {
                            addWifiPoint({
                              ...data,
                              type: "Ponto fixo",
                              location: room.room,
                              status: "Disponível",
                              assignedRoom: room.room,
                            });
                          }
                          setEditingRoom(null);
                          setEditingPointId(null);
                        }}><Save size={14} /> Salvar</Button>
                        {editingPointId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="w-full text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] lg:w-auto"
                            onClick={() => {
                              const pointToDelete = wifiPoints.find((point) => point.id === editingPointId);
                              if (pointToDelete && window.confirm(`Excluir o ponto ${pointToDelete.point}?`)) {
                                deleteWifiPoint(pointToDelete.id);
                                setEditingRoom(null);
                                setEditingPointId(null);
                              }
                            }}
                          >
                            <Trash2 size={14} /> Excluir ponto
                          </Button>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            </div>
          )}
          </SectionCard>
        </div>
      </div>
      {(newAntennaOpen || editingAntenna) && (
        <Modal
          title={editingAntenna ? "Editar antena volante" : "Nova antena volante"}
          onClose={() => {
            setNewAntennaOpen(false);
            setEditingAntenna(null);
            setAntennaError("");
          }}
        >
          <form className="space-y-4 p-5" onSubmit={(event) => {
            event.preventDefault();
            const name = newAntenna.name.trim();
            const point = newAntenna.point.trim();
            if (!name || !point) {
              setAntennaError("Informe o nome da antena e a nomenclatura do ponto.");
              return;
            }
            const data = {
              name,
              point,
              rack: newAntenna.rack.trim() || undefined,
              observations: newAntenna.observations.trim() || undefined,
            };
            if (editingAntenna) {
              updateWifiPoint(editingAntenna, data);
            } else {
              addWifiPoint({ ...data, type: "Antena volante", location: "Armário de conectividade", status: "Disponível" });
            }
            setNewAntenna({ name: "", point: "", rack: "", observations: "" });
            setAntennaError("");
            setNewAntennaOpen(false);
            setEditingAntenna(null);
          }}>
            <Field label="Nome da antena"><input required autoFocus value={newAntenna.name} onChange={(event) => setNewAntenna({ ...newAntenna, name: event.target.value })} className={inputClass} placeholder="Ex.: Antena volante 03" /></Field>
            <Field label="Ponto"><input required value={newAntenna.point} onChange={(event) => setNewAntenna({ ...newAntenna, point: event.target.value })} className={inputClass} placeholder="Ex.: Antena AV-03" /></Field>
            <Field label="Rack (opcional)"><input value={newAntenna.rack} onChange={(event) => setNewAntenna({ ...newAntenna, rack: event.target.value })} className={inputClass} placeholder="Ex.: Armário móvel · porta 03" /></Field>
            <Field label="Observações" hint="Informe rack, switch, porta e ponto de rede."><textarea value={newAntenna.observations} onChange={(event) => setNewAntenna({ ...newAntenna, observations: event.target.value })} className={`${inputClass} h-20 resize-none py-2`} placeholder="Ex.: Switch SW-02 · porta 18 · ponto de rede P-18" /></Field>
            {antennaError && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">{antennaError}</p>}
            <div className="flex items-center justify-end gap-2">
              <IconButton
                label="Cancelar cadastro da antena"
                onClick={() => {
                  setNewAntennaOpen(false);
                  setEditingAntenna(null);
                  setAntennaError("");
                }}
              >
                <X size={15} />
              </IconButton>
              <Button type="submit"><Save size={14} /> {editingAntenna ? "Salvar alterações" : "Criar antena"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function HistoryPage() {
  const { movements, reservations } = useCampusData();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("Todos");
  const [period, setPeriod] = useState("Todos");
  const [profile, setProfile] = useState("Todos");
  const [person, setPerson] = useState("Todos");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const types = ["Todos", "Reserva", "Equipamento", "Wi-Fi", "Movimentação"];
  type HistoryEvent = { id: string | number; time: string; date: string; title: string; detail: string; type: string; tone: string; person?: string; profile?: "Professor" | "TI" };
  const reservationHistory: HistoryEvent[] = reservations.flatMap((reservation) => [{
    id: `reservation-${reservation.id}`,
    time: reservation.start,
    date: reservation.date,
    title: `Reserva ${reservation.status.toLocaleLowerCase("pt-BR")}`,
    detail: `${reservation.className} · ${reservation.room} · ${reservation.cart} · Professor: ${reservation.teacher}`,
    type: "Reserva",
    tone: reservation.status === "Concluída" ? "good" : "neutral",
    person: reservation.teacher,
    profile: "Professor",
  }]);
  const movementHistory: HistoryEvent[] = movements.flatMap((movement) => {
    const reservation = reservations.find((item) => item.id === movement.reservationId);
    if (!reservation) return [];
    const eventDate = (value?: string) => value ? dateToISO(new Date(value)) : reservation.date;
    const eventPerson = (value?: string) => value ?? reservation.teacher;
    const events: HistoryEvent[] = [];
    if (movement.movedAt) {
      events.push({
        id: `movement-${movement.reservationId}-moved`,
        time: new Date(movement.movedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        date: eventDate(movement.movedAt),
        title: movement.movedLate ? "Carrinho movido com atraso" : "Carrinho em movimentação",
        detail: `${reservation.cart} · ${reservation.room} · Movido por: ${movement.movedBy ?? "TI"}`,
        type: "Movimentação",
        tone: "warm",
        person: eventPerson(movement.movedBy),
        profile: "TI",
      });
    }
    if (movement.completedAt) {
      events.push({
        id: `movement-${movement.reservationId}-completed`,
        time: new Date(movement.completedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        date: eventDate(movement.completedAt),
        title: "Movimentação concluída",
        detail: `${reservation.cart} · ${reservation.room} · Concluído por: ${movement.completedBy ?? "TI"}`,
        type: "Movimentação",
        tone: "good",
        person: eventPerson(movement.completedBy),
        profile: "TI",
      });
    }
    if (movement.notReceivedAt) {
      events.push({
        id: `movement-${movement.reservationId}-not-received`,
        time: new Date(movement.notReceivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        date: eventDate(movement.notReceivedAt),
        title: "Professor informou que não recebeu",
        detail: `${reservation.cart} · ${reservation.room} · Professor: ${reservation.teacher}`,
        type: "Movimentação",
        tone: "bad",
        person: reservation.teacher,
        profile: "Professor",
      });
    }
    if (movement.notAttendedAt) {
      events.push({
        id: `movement-${movement.reservationId}-not-attended`,
        time: new Date(movement.notAttendedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        date: eventDate(movement.notAttendedAt),
        title: "Movimentação não atendida",
        detail: `${reservation.cart} · ${reservation.room} · O carrinho não foi movimentado no horário da aula.`,
        type: "Movimentação",
        tone: "bad",
        person: reservation.teacher,
        profile: "TI",
      });
    }
    if (movement.requestAgainAt) {
      events.push({
        id: `movement-${movement.reservationId}-request-again`,
        time: new Date(movement.requestAgainAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        date: eventDate(movement.requestAgainAt),
        title: "Professor pediu nova movimentação",
        detail: `${reservation.cart} · ${reservation.room} · Solicitação ${movement.requestCount}x`,
        type: "Movimentação",
        tone: "warm",
        person: reservation.teacher,
        profile: "Professor",
      });
    }
    if (movement.confirmedAt) {
      events.push({
        id: `movement-${movement.reservationId}-confirmed`,
        time: new Date(movement.confirmedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        date: eventDate(movement.confirmedAt),
        title: "Recebimento confirmado pelo professor",
        detail: `${reservation.cart} · ${reservation.room} · Confirmado por: ${movement.confirmedBy ?? reservation.teacher}`,
        type: "Reserva",
        tone: "good",
        person: eventPerson(movement.confirmedBy),
        profile: "Professor",
      });
    }
    return events;
  });
  const historyEvents: HistoryEvent[] = [...reservationHistory, ...movementHistory, ...historySeed.map((event) => ({ ...event, date: todayISO() }))];
  const localToday = (() => {
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  })();
  const periodStart = (() => {
    if (period === "Todos") return undefined;
    const date = new Date(`${localToday}T12:00:00`);
    if (period === "Mês") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    if (period === "Semana") date.setDate(date.getDate() - 6);
    return dateToISO(date);
  })();
  const filtered = historyEvents.filter(
    (event) =>
      (type === "Todos" || event.type === type) &&
      (profile === "Todos" || event.profile === profile) &&
      (person === "Todos" || event.person === person) &&
      (!periodStart || event.date >= periodStart) &&
      (period !== "Dia" || event.date === localToday) &&
      (event.person ?? "").toLowerCase().includes(query.trim().toLowerCase()),
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
        <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.18)] p-4 sm:p-5">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-3 text-[hsl(var(--muted-foreground))]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={cx(inputClass, "pl-9")}
              placeholder="Buscar pelo nome da pessoa..."
              data-testid="input-search-history"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
              <span className="px-2 text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Período</span>
              {["Todos", "Dia", "Semana", "Mês"].map((item) => (
                <button type="button" key={item} onClick={() => setPeriod(item)} className={cx("rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors", period === item ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]")} data-testid={`button-filter-period-${item.toLowerCase()}`}>{item}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
              <span className="px-2 text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Perfil</span>
              {["Todos", "Professor", "TI"].map((item) => (
                <button type="button" key={item} onClick={() => { setProfile(item); setPerson("Todos"); }} className={cx("rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors", profile === item ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]")} data-testid={`button-filter-profile-${item.toLowerCase()}`}>{item === "Professor" ? "Professores" : item}</button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Tipo</span>
            {types.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setType(item)}
                className={cx(
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  type === item
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                    : "border-transparent bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border))]",
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
                <div className="relative shrink-0">
                  <button type="button" className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label={`Opções de ${event.title}`} onClick={() => setActiveMenu(activeMenu === String(event.id) ? null : String(event.id))} data-testid={`button-history-menu-${event.id}`}>
                    <MoreHorizontal size={17} />
                  </button>
                  {activeMenu === String(event.id) && (
                    <div className="absolute right-0 top-9 z-10 w-44 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1.5 shadow-lg">
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]" onClick={() => { setQuery(event.title); setActiveMenu(null); }}>Filtrar este evento</button>
                      {event.person && <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]" onClick={() => { setPerson(event.person ?? "Todos"); setActiveMenu(null); }}>Ver por esta pessoa</button>}
                      <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-[hsl(var(--muted))]" onClick={() => { setType(event.type); setActiveMenu(null); }}>Ver por tipo</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
