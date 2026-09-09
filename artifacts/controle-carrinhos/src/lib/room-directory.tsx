import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { type Segment } from "@/lib/campus-data";

export const periods = ["Manhã", "Tarde"] as const;
export type Period = (typeof periods)[number];

export type Room = {
  id: string;
  number: string;
  segment: Segment;
  morningClasses: string[];
  afternoonClasses: string[];
};

export type ClassRoomEntry = {
  className: string;
  room: string;
  period: Period;
  segment: Segment;
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
};

const storageKey = "controle-carrinhos-rooms";

const defaultRooms: Room[] = [
  { id: "room-08", number: "08", segment: "Fundamental 2", morningClasses: ["8º ano C · Artes"], afternoonClasses: ["6º ano A · Português"] },
  { id: "room-14", number: "14", segment: "Fundamental 2", morningClasses: ["7º ano A · Matemática"], afternoonClasses: ["7º ano B · Matemática"] },
  { id: "room-18", number: "18", segment: "Fundamental 2", morningClasses: ["8º ano A · História"], afternoonClasses: ["8º ano D · História"] },
  { id: "room-02", number: "02", segment: "Fundamental 2", morningClasses: ["8º ano B · Ciências"], afternoonClasses: ["9º ano A · Ciências"] },
  { id: "room-21", number: "21", segment: "Fundamental 2", morningClasses: ["9º ano C · Geografia"], afternoonClasses: ["9º ano B · Geografia"] },
];

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeRoom = (value: string) => value.trim().toLowerCase().replace(/^sala\s*/i, "").replace(/\s+/g, " ");
const roomLabel = (number: string) => `Sala ${number}`;

function readRooms() {
  if (typeof window === "undefined") return defaultRooms;
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? (JSON.parse(saved) as Room[]).map((room) => ({ ...room, segment: room.segment ?? "Fundamental 2" })) : defaultRooms;
  } catch {
    return defaultRooms;
  }
}

const RoomDirectoryContext = createContext<RoomDirectoryValue | null>(null);

export function RoomDirectoryProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(readRooms);
  const classEntries = useMemo(() => rooms.flatMap((room) => [
     ...room.morningClasses.map((className) => ({ className, room: roomLabel(room.number), period: "Manhã" as Period, segment: room.segment })),
     ...room.afternoonClasses.map((className) => ({ className, room: roomLabel(room.number), period: "Tarde" as Period, segment: room.segment })),
  ]), [rooms]);
  const roomOptions = useMemo(() => [...rooms]
    .sort((first, second) => Number(first.number) - Number(second.number))
    .map((room) => roomLabel(room.number)), [rooms]);
  const roomOptionsForSegment = (segment: Segment) => rooms
    .filter((room) => room.segment === segment)
    .sort((first, second) => Number(first.number) - Number(second.number))
    .map((room) => roomLabel(room.number));

  const persist = (nextRooms: Room[]) => {
    setRooms(nextRooms);
    window.localStorage.setItem(storageKey, JSON.stringify(nextRooms));
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

  return <RoomDirectoryContext.Provider value={{ rooms, classEntries, roomOptions, roomOptionsForSegment, addRoom, updateRoom, deleteRoom, deleteRooms, roomForClass, classesForRoom }}>{children}</RoomDirectoryContext.Provider>;
}

export function useRoomDirectory() {
  const value = useContext(RoomDirectoryContext);
  if (!value) throw new Error("useRoomDirectory must be used inside RoomDirectoryProvider");
  return value;
}
