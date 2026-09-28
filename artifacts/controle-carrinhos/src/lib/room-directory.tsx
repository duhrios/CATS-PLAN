import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { segments, type Segment } from "@/lib/campus-data";
import { initialCampusRooms } from "@/lib/room-directory-seed";

export const periods = ["Manhã", "Tarde"] as const;
export type Period = (typeof periods)[number];

export type Room = {
  id: string;
  number: string;
  floor: string;
  segment: Segment;
  morningClasses: string[];
  afternoonClasses: string[];
};

export type ClassRoomEntry = {
  className: string;
  room: string;
  period: Period;
  segment: Segment;
  floor: string;
};

type RoomDirectoryValue = {
  rooms: Room[];
  classEntries: ClassRoomEntry[];
  roomOptions: string[];
  roomOptionsForSegment: (segment: Segment) => string[];
  addRoom: (room: Omit<Room, "id">) => boolean;
  updateRoom: (id: string, room: Omit<Room, "id">) => boolean;
  deleteRoom: (id: string) => void;
  deleteRooms: (ids: string[]) => void;
  roomForClass: (className: string, period?: Period, segment?: Segment) => string;
  classesForRoom: (room: string, period: Period) => string[];
  floorForRoom: (room: string) => string;
};

const storageKey = "controle-carrinhos-rooms";
const factoryResetKey = "controle-carrinhos-rooms-factory-reset";
const legacySampleRoomIds = new Set([
  "room-02",
  "room-08",
  "room-14",
  "room-18",
  "room-21",
]);

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeRoom = (value: string) => value.trim().toLowerCase().replace(/^sala\s*/i, "").replace(/\s+/g, " ");
const roomLabel = (number: string) => `Sala ${number}`;

const segmentForClass = (className: string, fallback: Segment): Segment => {
  const normalized = className.trim().toLocaleUpperCase("pt-BR");
  if (/^(PR[EÉ]|MAT\.?)(\s|$)/.test(normalized)) return "Educação Infantil";
  if (/^(INT[-\s]|[1-3]\s*°?\s*EM\b)/.test(normalized)) return "Ensino Médio";
  const grade = normalized.match(/^([1-9])\s*°/);
  if (grade) return Number(grade[1]) <= 5 ? "Fundamental 1" : "Fundamental 2";
  return fallback;
};

function readRooms() {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(storageKey);
    const factoryReset = window.localStorage.getItem(factoryResetKey) === "1";
    const seedEnabled = import.meta.env.VITE_ENABLE_CAMPUS_SEED === "true";
    if (!saved) {
      if (factoryReset || !seedEnabled) return [];
      const seeded = initialCampusRooms.map((room) => ({ ...room }));
      window.localStorage.setItem(storageKey, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(saved) as Room[];
    if (!Array.isArray(parsed)) return [];
    const isLegacySample = parsed.length === legacySampleRoomIds.size &&
      parsed.every((room) => legacySampleRoomIds.has(room.id));
    if (seedEnabled && !factoryReset && isLegacySample) {
      const seeded = initialCampusRooms.map((room) => ({ ...room }));
      window.localStorage.setItem(storageKey, JSON.stringify(seeded));
      return seeded;
    }
    return parsed.map((room) => ({ ...room, floor: room.floor ?? "Térreo", segment: room.segment ?? "Fundamental 2" }));
  } catch {
    return [];
  }
}

const RoomDirectoryContext = createContext<RoomDirectoryValue | null>(null);

export function RoomDirectoryProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(readRooms);
  useEffect(() => {
    const clearRooms = () => {
      setRooms([]);
      window.localStorage.removeItem(storageKey);
      window.localStorage.setItem(factoryResetKey, "1");
    };
    window.addEventListener("controle-carrinhos-clear-rooms", clearRooms);
    return () => window.removeEventListener("controle-carrinhos-clear-rooms", clearRooms);
  }, []);
  const classEntries = useMemo(() => rooms.flatMap((room) =>
    ([
      ...room.morningClasses.map((className) => ({ className, period: "Manhã" as Period })),
      ...room.afternoonClasses.map((className) => ({ className, period: "Tarde" as Period })),
    ]).flatMap(({ className, period }) => {
      const entry = {
        className,
        room: roomLabel(room.number),
        period,
        floor: room.floor,
      };
      const normalizedClass = className.trim().toLocaleLowerCase("pt-BR");
      const entrySegments = normalizedClass === "contraturno"
        ? segments
        : [segmentForClass(className, room.segment)];
      return entrySegments.map((segment) => ({ ...entry, segment }));
    }),
  ), [rooms]);
  const roomOptions = useMemo(() => [...rooms]
    .sort((first, second) => Number(first.number) - Number(second.number))
    .map((room) => roomLabel(room.number)), [rooms]);
  const roomOptionsForSegment = (segment: Segment) => [...new Set(
    classEntries.filter((entry) => entry.segment === segment).map((entry) => entry.room),
  )].sort((first, second) => Number(normalizeRoom(first)) - Number(normalizeRoom(second)));

  const persist = (nextRooms: Room[]) => {
    setRooms(nextRooms);
    window.localStorage.setItem(storageKey, JSON.stringify(nextRooms));
    window.localStorage.removeItem(factoryResetKey);
  };

  const addRoom = (room: Omit<Room, "id">) => {
    const number = room.number.trim();
    if (!number || rooms.some((item) => normalizeRoom(item.number) === normalizeRoom(number))) return false;
    persist([...rooms, { ...room, number, id: `room-${number}-${rooms.length + 1}` }]);
    return true;
  };

  const updateRoom = (id: string, room: Omit<Room, "id">) => {
    const number = room.number.trim();
    if (!number || rooms.some((item) => item.id !== id && normalizeRoom(item.number) === normalizeRoom(number))) return false;
    persist(rooms.map((item) => item.id === id ? { ...room, number, id } : item));
    return true;
  };

  const deleteRoom = (id: string) => {
    persist(rooms.filter((room) => room.id !== id));
  };

  const deleteRooms = (ids: string[]) => {
    const idsToDelete = new Set(ids);
    persist(rooms.filter((room) => !idsToDelete.has(room.id)));
  };

  const roomForClass = (className: string, period?: Period, segment?: Segment) => {
    const input = normalize(className);
    const entry = classEntries.find((item) => {
      if (period && item.period !== period) return false;
      if (segment && item.segment !== segment) return false;
      const fullName = normalize(item.className);
      const classOnly = normalize(item.className.split(" · ")[0]);
      return input === fullName || input === classOnly;
    });
    return entry?.room ?? "";
  };

  const classesForRoom = (room: string, period: Period) => classEntries
    .filter((item) => item.period === period && normalizeRoom(item.room) === normalizeRoom(room))
    .map((item) => item.className);
  const floorForRoom = (room: string) =>
    rooms.find((item) => normalizeRoom(roomLabel(item.number)) === normalizeRoom(room))?.floor ?? "Piso não informado";

  return <RoomDirectoryContext.Provider value={{ rooms, classEntries, roomOptions, roomOptionsForSegment, addRoom, updateRoom, deleteRoom, deleteRooms, roomForClass, classesForRoom, floorForRoom }}>{children}</RoomDirectoryContext.Provider>;
}

export function useRoomDirectory() {
  const value = useContext(RoomDirectoryContext);
  if (!value) throw new Error("useRoomDirectory must be used inside RoomDirectoryProvider");
  return value;
}
