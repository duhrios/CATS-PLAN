import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { todayISO } from "@/components/app-ui";

export const segments = [
  "Educação Infantil",
  "Fundamental 1",
  "Fundamental 2",
  "Ensino Médio",
] as const;
export type Segment = (typeof segments)[number];
export type ReservationKind = "Aula" | "Reserva";

export type TeacherProfile = {
  name: string;
  email: string;
  segment: Segment;
  subject: string;
};

export type TeacherAccount = TeacherProfile & {
  id: string;
  password?: string;
  mustSetPassword: boolean;
};

export type TeacherAuthResult = TeacherAccount | "first-access" | null;
export type TeacherRegistrationResult = TeacherAccount | "name-taken" | null;
export type OperatorRegistrationResult =
  | OperatorAccount
  | "name-taken"
  | "invalid-name"
  | "invalid-password";
export type MovementStatus = "Não movido" | "Movendo" | "Concluído";
export type OperatorAccount = { id: string; name: string; password: string };
export type CartMovement = {
  reservationId: number;
  status: MovementStatus;
  updatedAt: string;
  notReceived: boolean;
  autoCompleted: boolean;
  requestCount: number;
};

export const isReservationInProgress = (reservation: Reservation) => {
  if (reservation.date !== todayISO()) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = reservation.start.split(":").map(Number);
  const [endHour, endMinute] = reservation.end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
};

export const normalizeTeacherName = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
export const profileFromTeacherAccount = ({
  name,
  email,
  segment,
  subject,
}: TeacherAccount): TeacherProfile => ({ name, email, segment, subject });

export type WifiPoint = {
  id: string;
  name: string;
  point: string;
  type: "Ponto fixo" | "Antena volante";
  location: string;
  rack: string;
  status: "Disponível" | "Em uso" | "Em manutenção";
  assignedRoom?: string;
};

export type Reservation = {
  id: number;
  teacher: string;
  segment: Segment;
  subject: string;
  className: string;
  room: string;
  period: "Manhã" | "Tarde";
  date: string;
  start: string;
  end: string;
  cart: string;
  status: "Confirmada" | "Aguardando" | "Concluída";
  kind: ReservationKind;
  quantity: number;
};

export type Cart = {
  id: string;
  name: string;
  code: string;
  prefix: string;
  total: number;
  available: number;
  location: string;
  status: string;
  lastCheck: string;
  accent: string;
  unavailable: boolean;
  unavailableUnits: string[];
  reserveCapacity: number;
};

const teacherStorageKey = "controle-carrinhos-teacher";
const reservationStorageKey = "controle-carrinhos-reservations";
const cartStorageKey = "controle-carrinhos-carts";
const teacherAccountsStorageKey = "controle-carrinhos-teacher-accounts";
const rememberedTeacherStorageKey = "controle-carrinhos-remembered-teacher";
const wifiPointsStorageKey = "controle-carrinhos-wifi-points";
const wifiRoomsStorageKey = "controle-carrinhos-wifi-rooms";
const operatorAccountsStorageKey = "controle-carrinhos-operator-accounts";
const movementsStorageKey = "controle-carrinhos-movements";
const movementSettingsStorageKey = "controle-carrinhos-movement-settings";

export const addDaysISO = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const defaultTeacher: TeacherProfile = {
  name: "Marina Lopes",
  email: "marina.lopes@campus.edu.br",
  segment: "Fundamental 2",
  subject: "Ciências",
};

export const initialReservations: Reservation[] = [
  {
    id: 1,
    teacher: "Marina Lopes",
    segment: "Fundamental 2",
    subject: "Ciências",
    className: "8º ano B · Ciências",
    room: "Laboratório 02",
    period: "Manhã",
    date: todayISO(),
    start: "07:00",
    end: "07:45",
    cart: "Carrinho A",
    status: "Confirmada",
    kind: "Aula",
    quantity: 30,
  },
  {
    id: 2,
    teacher: "Rafael Nunes",
    segment: "Fundamental 2",
    subject: "Matemática",
    className: "7º ano A · Matemática",
    room: "Sala 14",
    period: "Manhã",
    date: todayISO(),
    start: "09:15",
    end: "10:20",
    cart: "Carrinho B",
    status: "Confirmada",
    kind: "Aula",
    quantity: 30,
  },
  {
    id: 3,
    teacher: "Bianca Reis",
    segment: "Fundamental 2",
    subject: "Geografia",
    className: "9º ano C · Geografia",
    room: "Sala 21",
    period: "Manhã",
    date: todayISO(),
    start: "11:50",
    end: "12:45",
    cart: "Carrinho A",
    status: "Aguardando",
    kind: "Aula",
    quantity: 30,
  },
  {
    id: 4,
    teacher: "Caio Martins",
    segment: "Fundamental 1",
    subject: "Português",
    className: "6º ano A · Português",
    room: "Sala 08",
    period: "Tarde",
    date: todayISO(),
    start: "13:30",
    end: "14:15",
    cart: "Carrinho C",
    status: "Concluída",
    kind: "Aula",
    quantity: 25,
  },
  {
    id: 5,
    teacher: "Lívia Costa",
    segment: "Fundamental 2",
    subject: "História",
    className: "8º ano A · História",
    room: "Sala 18",
    period: "Manhã",
    date: addDaysISO(1),
    start: "08:30",
    end: "09:15",
    cart: "Carrinho C",
    status: "Confirmada",
    kind: "Aula",
    quantity: 30,
  },
];

export const initialCarts: Cart[] = [
  {
    id: "a",
    name: "Carrinho A",
    code: "A",
    prefix: "A",
    total: 60,
    available: 55,
    location: "Armário A · Bloco 1",
    status: "Pronto",
    lastCheck: "Hoje, 06:52",
    accent: "bg-[hsl(var(--primary))]",
    unavailable: false,
    unavailableUnits: ["A3", "A12", "A27", "A44", "A58"],
    reserveCapacity: 0,
  },
  {
    id: "b",
    name: "Carrinho B",
    code: "B",
    prefix: "B",
    total: 58,
    available: 54,
    location: "Armário B · Bloco 1",
    status: "Pronto",
    lastCheck: "Hoje, 06:48",
    accent: "bg-[hsl(var(--accent))]",
    unavailable: false,
    unavailableUnits: ["B8", "B19", "B37", "B51"],
    reserveCapacity: 10,
  },
  {
    id: "c",
    name: "Carrinho C",
    code: "C",
    prefix: "C",
    total: 55,
    available: 51,
    location: "Armário C · Bloco 2",
    status: "Em uso",
    lastCheck: "Hoje, 06:41",
    accent: "bg-[hsl(var(--primary))]",
    unavailable: false,
    unavailableUnits: ["C4", "C16", "C33", "C48"],
    reserveCapacity: 10,
  },
];

export const initialTeacherAccounts: TeacherAccount[] = [
  {
    id: "teacher-marina",
    ...defaultTeacher,
    password: undefined,
    mustSetPassword: true,
  },
  {
    id: "teacher-rafael",
    name: "Rafael Nunes",
    email: "rafael.nunes@campus.edu.br",
    segment: "Fundamental 2",
    subject: "Matemática",
    password: "1234",
    mustSetPassword: false,
  },
  {
    id: "teacher-bianca",
    name: "Bianca Reis",
    email: "bianca.reis@campus.edu.br",
    segment: "Fundamental 2",
    subject: "Geografia",
    password: "1234",
    mustSetPassword: false,
  },
];
export const initialOperatorAccounts: OperatorAccount[] = [
  { id: "operator-01", name: "Operador", password: "1234" },
];

export const initialWifiPoints: WifiPoint[] = [
  {
    id: "point-01",
    name: "Bloco 1 · Térreo",
    point: "Ponto AP-01",
    type: "Ponto fixo",
    location: "Armário de rede · Bloco 1",
    rack: "Rack B1 · porta 08",
    status: "Disponível",
  },
  {
    id: "point-02",
    name: "Bloco 1 · 2º andar",
    point: "Ponto AP-02",
    type: "Ponto fixo",
    location: "Armário de rede · Bloco 1",
    rack: "Rack B1 · porta 14",
    status: "Disponível",
  },
  {
    id: "point-03",
    name: "Laboratórios · Bloco 2",
    point: "Ponto AP-03",
    type: "Ponto fixo",
    location: "Sala técnica · Bloco 2",
    rack: "Rack B2 · porta 03",
    status: "Em manutenção",
  },
  {
    id: "point-04",
    name: "Antena volante 01",
    point: "Antena AV-01",
    type: "Antena volante",
    location: "Armário de conectividade",
    rack: "Rack móvel · porta 01",
    status: "Disponível",
  },
  {
    id: "point-05",
    name: "Antena volante 02",
    point: "Antena AV-02",
    type: "Antena volante",
    location: "Armário de conectividade",
    rack: "Rack móvel · porta 02",
    status: "Disponível",
  },
];

export const initialWifiRooms = [
  { room: "Sala 08", hasWifi: false },
  { room: "Sala 14", hasWifi: true },
  { room: "Sala 18", hasWifi: true },
  { room: "Sala 21", hasWifi: false },
  { room: "Laboratório 02", hasWifi: true },
];
export type MovementSettings = {
  alertIntervalMinutes: number;
  alertRepeat: number;
  autoComplete: boolean;
};
export const defaultMovementSettings: MovementSettings = {
  alertIntervalMinutes: 10,
  alertRepeat: 2,
  autoComplete: true,
};

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

type CampusDataValue = {
  teacher: TeacherProfile;
  updateTeacher: (profile: TeacherProfile) => void;
  teacherAccounts: TeacherAccount[];
  addTeacherAccounts: (
    entries: Array<Omit<TeacherAccount, "id" | "password" | "mustSetPassword">>,
  ) => void;
  deleteTeacherAccount: (id: string) => void;
  resetTeacherPassword: (id: string) => void;
  completeTeacherRegistration: (
    id: string,
    name: string,
    password: string,
  ) => TeacherRegistrationResult;
  authenticateTeacher: (name: string, password: string) => TeacherAuthResult;
  rememberTeacherLogin: (id: string, remember: boolean) => void;
  getRememberedTeacher: () => TeacherAccount | null;
  clearRememberedTeacher: () => void;
  operatorAccounts: OperatorAccount[];
  addOperatorAccount: (
    name: string,
    password: string,
  ) => OperatorRegistrationResult;
  deleteOperatorAccount: (id: string) => void;
  authenticateOperator: (name: string, password: string) => OperatorAccount | null;
  movements: CartMovement[];
  updateMovementStatus: (
    reservationId: number,
    status: MovementStatus,
    autoCompleted?: boolean,
  ) => void;
  reportNotReceived: (reservationId: number) => void;
  requestMovementAgain: (reservationId: number) => void;
  movementSettings: MovementSettings;
  updateMovementSettings: (settings: MovementSettings) => void;
  reservations: Reservation[];
  saveReservation: (
    data: Omit<Reservation, "id" | "status">,
    id?: number,
  ) => void;
  deleteReservation: (id: number) => void;
  carts: Cart[];
  addCart: (cart: Omit<Cart, "id">) => void;
  toggleCartUnavailable: (id: string) => void;
  toggleCartUnitUnavailable: (cartId: string, unit: string) => void;
  toggleCartMaintenance: (id: string) => void;
  wifiPoints: WifiPoint[];
  wifiRooms: typeof initialWifiRooms;
  toggleRoomWifi: (room: string) => void;
  updateWifiPointStatus: (id: string, status: WifiPoint["status"]) => void;
  assignMobileAntenna: (pointId: string, room: string | undefined) => void;
  reserveAvailable: number;
  teacherReserved: number;
};

const CampusDataContext = createContext<CampusDataValue | null>(null);

export function CampusDataProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherProfile>(() => ({
    ...defaultTeacher,
    ...readStorage<Partial<TeacherProfile>>(teacherStorageKey, {}),
  }));
  const [reservations, setReservations] = useState<Reservation[]>(() =>
    readStorage<Partial<Reservation>[]>(
      reservationStorageKey,
      initialReservations,
    ).map(
      (item) =>
        ({
          ...item,
          segment: item.segment ?? "Fundamental 2",
          subject: item.subject ?? "",
          kind: item.kind ?? "Aula",
          quantity: item.quantity ?? 1,
        }) as Reservation,
    ),
  );
  const [carts, setCarts] = useState<Cart[]>(() =>
    readStorage<Partial<Cart>[]>(cartStorageKey, initialCarts).map(
      (cart) =>
        ({
          ...cart,
          unavailable: cart.unavailable ?? false,
          unavailableUnits: cart.unavailableUnits ?? [],
          reserveCapacity:
            cart.reserveCapacity ??
            (cart.code === "B" || cart.code === "C" ? 10 : 0),
        }) as Cart,
    ),
  );
  const [teacherAccounts, setTeacherAccounts] = useState<TeacherAccount[]>(() =>
    readStorage(teacherAccountsStorageKey, initialTeacherAccounts),
  );
  const [wifiPoints, setWifiPoints] = useState<WifiPoint[]>(() =>
    readStorage(wifiPointsStorageKey, initialWifiPoints),
  );
  const [wifiRooms, setWifiRooms] = useState<typeof initialWifiRooms>(() =>
    readStorage(wifiRoomsStorageKey, initialWifiRooms),
  );
  const [operatorAccounts, setOperatorAccounts] = useState<OperatorAccount[]>(() =>
    readStorage(operatorAccountsStorageKey, initialOperatorAccounts),
  );
  const [movements, setMovements] = useState<CartMovement[]>(() =>
    readStorage<Partial<CartMovement>[]>(movementsStorageKey, []).map((item) => ({
      reservationId: item.reservationId as number,
      status: item.status ?? "Não movido",
      updatedAt: item.updatedAt ?? new Date().toISOString(),
      notReceived: item.notReceived ?? false,
      autoCompleted: item.autoCompleted ?? false,
      requestCount: item.requestCount ?? (item.notReceived ? 1 : 0),
    })),
  );
  const [movementSettings, setMovementSettings] = useState<MovementSettings>(() =>
    readStorage(movementSettingsStorageKey, defaultMovementSettings),
  );

  const persistTeacher = (next: TeacherProfile) => {
    setTeacher(next);
    window.localStorage.setItem(teacherStorageKey, JSON.stringify(next));
  };
  const persistReservations = (next: Reservation[]) => {
    setReservations(next);
    window.localStorage.setItem(reservationStorageKey, JSON.stringify(next));
  };
  const persistCarts = (next: Cart[]) => {
    setCarts(next);
    window.localStorage.setItem(cartStorageKey, JSON.stringify(next));
  };
  const persistTeacherAccounts = (next: TeacherAccount[]) => {
    setTeacherAccounts(next);
    window.localStorage.setItem(
      teacherAccountsStorageKey,
      JSON.stringify(next),
    );
  };
  const persistWifiPoints = (next: WifiPoint[]) => {
    setWifiPoints(next);
    window.localStorage.setItem(wifiPointsStorageKey, JSON.stringify(next));
  };
  const persistWifiRooms = (next: typeof initialWifiRooms) => {
    setWifiRooms(next);
    window.localStorage.setItem(wifiRoomsStorageKey, JSON.stringify(next));
  };
  const persistOperatorAccounts = (next: OperatorAccount[]) => {
    setOperatorAccounts(next);
    window.localStorage.setItem(
      operatorAccountsStorageKey,
      JSON.stringify(next),
    );
  };
  const addOperatorAccount = (
    name: string,
    password: string,
  ): OperatorRegistrationResult => {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 3) return "invalid-name";
    if (password.length < 6) return "invalid-password";
    if (
      operatorAccounts.some(
        (account) =>
          account.name.toLocaleLowerCase("pt-BR") ===
          normalizedName.toLocaleLowerCase("pt-BR"),
      )
    ) {
      return "name-taken";
    }
    const account: OperatorAccount = {
      id: `operator-${Date.now()}`,
      name: normalizedName,
      password,
    };
    persistOperatorAccounts([...operatorAccounts, account]);
    return account;
  };
  const deleteOperatorAccount = (id: string) => {
    persistOperatorAccounts(
      operatorAccounts.filter((account) => account.id !== id),
    );
  };
  const persistMovements = (next: CartMovement[]) => {
    setMovements(next);
    window.localStorage.setItem(movementsStorageKey, JSON.stringify(next));
  };
  const updateMovementStatus = (
    reservationId: number,
    status: MovementStatus,
    autoCompleted = false,
  ) => {
    const current = movements.find((item) => item.reservationId === reservationId);
    const nextItem = {
      reservationId,
      status,
      updatedAt: new Date().toISOString(),
      notReceived: current?.notReceived ?? false,
      autoCompleted,
      requestCount: current?.requestCount ?? 0,
    };
    persistMovements([...movements.filter((item) => item.reservationId !== reservationId), nextItem]);
  };
  const reportNotReceived = (reservationId: number) => {
    const current = movements.find((item) => item.reservationId === reservationId);
    if (current?.status === "Concluído" && !current.autoCompleted) return;
    const nextItem = { reservationId, status: "Não movido" as const, updatedAt: new Date().toISOString(), notReceived: true, autoCompleted: false, requestCount: (current?.requestCount ?? 0) + 1 };
    persistMovements([...movements.filter((item) => item.reservationId !== reservationId), { ...current, ...nextItem }]);
  };
  const requestMovementAgain = (reservationId: number) => {
    reportNotReceived(reservationId);
  };
  const updateMovementSettings = (settings: MovementSettings) => {
    setMovementSettings(settings);
    window.localStorage.setItem(movementSettingsStorageKey, JSON.stringify(settings));
  };

  const saveReservation = (
    data: Omit<Reservation, "id" | "status">,
    id?: number,
  ) => {
    const next = id
      ? reservations.map((item) =>
          item.id === id ? { ...item, ...data } : item,
        )
      : [
          {
            ...data,
            id: Math.max(...reservations.map((item) => item.id), 0) + 1,
            status: "Aguardando" as const,
          },
          ...reservations,
        ];
    persistReservations(next);
  };
  const deleteReservation = (id: number) => {
    persistReservations(reservations.filter((item) => item.id !== id));
    persistMovements(movements.filter((item) => item.reservationId !== id));
  };

  const toggleCartUnavailable = (id: string) => {
    persistCarts(
      carts.map((cart) =>
        cart.id === id
          ? {
              ...cart,
              unavailable: !cart.unavailable,
              status: !cart.unavailable ? "Indisponível" : "Pronto",
            }
          : cart,
      ),
    );
  };
  const toggleCartUnitUnavailable = (cartId: string, unit: string) => {
    persistCarts(
      carts.map((cart) => {
        if (cart.id !== cartId) return cart;
        const unavailableUnits = cart.unavailableUnits.includes(unit)
          ? cart.unavailableUnits.filter((item) => item !== unit)
          : [...cart.unavailableUnits, unit];
        return {
          ...cart,
          unavailableUnits,
          available: Math.max(0, cart.total - unavailableUnits.length),
          status:
            unavailableUnits.length >= cart.total
              ? "Indisponível"
              : cart.status === "Indisponível"
                ? "Pronto"
                : cart.status,
        };
      }),
    );
  };
  const addCart = (cart: Omit<Cart, "id">) => {
    persistCarts([
      ...carts,
      { ...cart, id: `cart-${cart.code.toLowerCase()}-${carts.length + 1}` },
    ]);
  };
  const toggleCartMaintenance = (id: string) => {
    persistCarts(
      carts.map((cart) =>
        cart.id === id
          ? {
              ...cart,
              status: cart.status === "Manutenção" ? "Pronto" : "Manutenção",
            }
          : cart,
      ),
    );
  };
  const addTeacherAccounts = (
    entries: Array<Omit<TeacherAccount, "id" | "password" | "mustSetPassword">>,
  ) => {
    const next = [...teacherAccounts];
    entries.forEach((entry) => {
      const email = entry.email.trim().toLowerCase();
      if (!email || next.some((account) => account.email === email)) return;
      next.push({
        ...entry,
        email,
        id: `teacher-${Date.now()}-${next.length}`,
        mustSetPassword: true,
      });
    });
    persistTeacherAccounts(next);
  };
  const deleteTeacherAccount = (id: string) => {
    const nextAccounts = teacherAccounts.filter((account) => account.id !== id);
    persistTeacherAccounts(nextAccounts);
    const remembered = readStorage<{ accountId: string } | null>(
      rememberedTeacherStorageKey,
      null,
    );
    if (remembered?.accountId === id)
      window.localStorage.removeItem(rememberedTeacherStorageKey);
  };
  const resetTeacherPassword = (id: string) => {
    persistTeacherAccounts(
      teacherAccounts.map((account) =>
        account.id === id
          ? { ...account, password: undefined, mustSetPassword: true }
          : account,
      ),
    );
    const remembered = readStorage<{ accountId: string } | null>(
      rememberedTeacherStorageKey,
      null,
    );
    if (remembered?.accountId === id)
      window.localStorage.removeItem(rememberedTeacherStorageKey);
  };
  const completeTeacherRegistration = (
    id: string,
    name: string,
    password: string,
  ): TeacherRegistrationResult => {
    const trimmedName = name.trim().replace(/\s+/g, " ");
    if (!trimmedName || password.length < 6) return null;
    if (
      teacherAccounts.some(
        (account) =>
          account.id !== id &&
          normalizeTeacherName(account.name) ===
            normalizeTeacherName(trimmedName),
      )
    ) {
      return "name-taken";
    }
    const current = teacherAccounts.find((account) => account.id === id);
    if (!current) return null;
    const updated = {
      ...current,
      name: trimmedName,
      password,
      mustSetPassword: false,
    };
    persistTeacherAccounts(
      teacherAccounts.map((account) => (account.id === id ? updated : account)),
    );
    return updated;
  };
  const authenticateTeacher = (
    name: string,
    password: string,
  ): TeacherAuthResult => {
    const account = teacherAccounts.find(
      (item) => normalizeTeacherName(item.name) === normalizeTeacherName(name),
    );
    if (!account) return null;
    if (account.mustSetPassword) return "first-access" as const;
    return account.password === password ? account : null;
  };
  const rememberTeacherLogin = (id: string, remember: boolean) => {
    if (remember) {
      window.localStorage.setItem(
        rememberedTeacherStorageKey,
        JSON.stringify({ accountId: id }),
      );
    } else {
      window.localStorage.removeItem(rememberedTeacherStorageKey);
    }
  };
  const getRememberedTeacher = () => {
    const remembered = readStorage<{ accountId: string } | null>(
      rememberedTeacherStorageKey,
      null,
    );
    if (!remembered) return null;
    const account = teacherAccounts.find(
      (item) => item.id === remembered.accountId && !item.mustSetPassword,
    );
    if (!account) {
      window.localStorage.removeItem(rememberedTeacherStorageKey);
      return null;
    }
    return account;
  };
  const clearRememberedTeacher = () => {
    window.localStorage.removeItem(rememberedTeacherStorageKey);
  };
  const toggleRoomWifi = (room: string) => {
    persistWifiRooms(
      wifiRooms.map((item) =>
        item.room === room ? { ...item, hasWifi: !item.hasWifi } : item,
      ),
    );
  };
  const updateWifiPointStatus = (id: string, status: WifiPoint["status"]) => {
    persistWifiPoints(
      wifiPoints.map((point) =>
        point.id === id ? { ...point, status } : point,
      ),
    );
  };
  const assignMobileAntenna = (pointId: string, room: string | undefined) => {
    persistWifiPoints(
      wifiPoints.map((point) => {
        if (point.id === pointId)
          return {
            ...point,
            assignedRoom: room,
            status: room ? "Em uso" : "Disponível",
          };
        if (
          room &&
          point.type === "Antena volante" &&
          point.assignedRoom === room
        )
          return { ...point, assignedRoom: undefined, status: "Disponível" };
        return point;
      }),
    );
  };

  const reserveAvailable = useMemo(
    () =>
      carts.reduce((total, cart) => total + cart.reserveCapacity, 0) -
      reservations
        .filter((item) => item.kind === "Reserva")
        .reduce((total, item) => total + item.quantity, 0),
    [carts, reservations],
  );
  const teacherReserved = useMemo(
    () =>
      reservations
        .filter(
          (item) => item.kind === "Reserva" && item.teacher === teacher.name,
        )
        .reduce((total, item) => total + item.quantity, 0),
    [reservations, teacher.name],
  );

  return (
    <CampusDataContext.Provider
      value={{
        teacher,
        updateTeacher: persistTeacher,
        teacherAccounts,
        addTeacherAccounts,
        deleteTeacherAccount,
        resetTeacherPassword,
        completeTeacherRegistration,
        authenticateTeacher,
        rememberTeacherLogin,
        getRememberedTeacher,
        clearRememberedTeacher,
        operatorAccounts,
        addOperatorAccount,
        deleteOperatorAccount,
        authenticateOperator: (name, password) => operatorAccounts.find((item) => item.name.toLowerCase() === name.trim().toLowerCase() && item.password === password) ?? null,
        movements,
        updateMovementStatus,
        reportNotReceived,
        requestMovementAgain,
        movementSettings,
        updateMovementSettings,
        reservations,
        saveReservation,
        deleteReservation,
        carts,
        addCart,
        toggleCartUnavailable,
        toggleCartUnitUnavailable,
        toggleCartMaintenance,
        wifiPoints,
        wifiRooms,
        toggleRoomWifi,
        updateWifiPointStatus,
        assignMobileAntenna,
        reserveAvailable,
        teacherReserved,
      }}
    >
      {children}
    </CampusDataContext.Provider>
  );
}

export function useCampusData() {
  const value = useContext(CampusDataContext);
  if (!value)
    throw new Error("useCampusData must be used inside CampusDataProvider");
  return value;
}
