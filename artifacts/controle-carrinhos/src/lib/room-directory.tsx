import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Segment } from "@/lib/campus-data";
import { initialCampusRooms } from "@/lib/room-directory-seed";
import { getAuthenticatedRole, onAuthenticatedSessionChange } from "@/lib/auth-session";
import {
  loadSharedRooms,
  mergeRoomDirectoryChanges,
  saveSharedRooms,
  SharedRoomDirectoryConflictError,
} from "@/lib/room-directory-api";

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

export const segmentAbbreviation = (segment: Segment) => {
  const abbreviations: Record<Segment, string> = {
    "Educação Infantil": "EI",
    "Fundamental 1": "F1",
    "Fundamental 2": "F2",
    "Ensino Médio": "EM",
    Contraturno: "CT",
  };
  return abbreviations[segment];
};

type RoomDirectoryValue = {
  rooms: Room[];
  roomCatalogLoading: boolean;
  roomsSyncError: string;
  syncRooms: () => Promise<void>;
  classEntries: ClassRoomEntry[];
  roomOptions: string[];
  roomOptionsForSegment: (segment: Segment) => string[];
  addRoom: (room: Omit<Room, "id">) => boolean;
  updateRoom: (id: string, room: Omit<Room, "id">) => boolean;
  deleteRoom: (id: string) => void;
  deleteRooms: (ids: string[]) => void;
  roomForClass: (className: string, period?: Period, segment?: Segment) => string;
  classesForRoom: (room: string, period: Period, segment?: Segment) => string[];
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

const normalize = (value: string) => value.trim().toLowerCase().replace(/[º°]/g, "o").replace(/\s+/g, " ");
const normalizeRoom = (value: string) => value.trim().toLowerCase().replace(/^sala\s*/i, "").replace(/\s+/g, " ");
const roomLabel = (number: string) => `Sala ${number}`;
const isContraturno = (className: string) => normalize(className) === "contraturno";

const normalizeRoomRecord = (room: Room): Room => {
  const normalized = {
    ...room,
    floor: room.floor ?? "Térreo",
    segment: room.segment ?? "Fundamental 2",
  };
  const classes = [...normalized.morningClasses, ...normalized.afternoonClasses];
  if (classes.length > 0 && classes.every(isContraturno)) {
    normalized.segment = "Contraturno";
  }
  return normalized;
};

const segmentForClass = (className: string, fallback: Segment): Segment => {
  const normalized = className.trim().toLocaleUpperCase("pt-BR");
  if (normalized === "CONTRATURNO") return "Contraturno";
  if (/^(PR[EÉ]|MAT\.?)(\s|$)/.test(normalized)) return "Educação Infantil";
  if (/^(INT[-\s]|[1-3]\s*[º°]?\s*EM\b)/.test(normalized)) return "Ensino Médio";
  const grade = normalized.match(/^([1-9])\s*[º°]/);
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
    return parsed.map(normalizeRoomRecord);
  } catch {
    return [];
  }
}

const RoomDirectoryContext = createContext<RoomDirectoryValue | null>(null);

export function RoomDirectoryProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>(readRooms);
  const roomsRef = useRef(rooms);
  const [roomCatalogLoading, setRoomCatalogLoading] = useState(true);
  const [roomsSyncError, setRoomsSyncError] = useState("");
  const roomsUpdatedAtRef = useRef<string | null>(null);
  const syncedRoomsRef = useRef(rooms);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const clearRooms = () => {
      roomsRef.current = [];
      setRooms([]);
      window.localStorage.removeItem(storageKey);
      window.localStorage.setItem(factoryResetKey, "1");
      queueRoomSave();
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
      return [{ ...entry, segment: segmentForClass(className, room.segment) }];
    }),
  ), [rooms]);
  const roomOptions = useMemo(() => [...rooms]
    .sort((first, second) => Number(first.number) - Number(second.number))
    .map((room) => roomLabel(room.number)), [rooms]);
  const roomOptionsForSegment = (segment: Segment) => [...new Set(
    classEntries.filter((entry) => entry.segment === segment).map((entry) => entry.room),
  )].sort((first, second) => Number(normalizeRoom(first)) - Number(normalizeRoom(second)));

  const persist = (nextRooms: Room[]) => {
    roomsRef.current = nextRooms;
    setRooms(nextRooms);
    window.localStorage.setItem(storageKey, JSON.stringify(nextRooms));
    window.localStorage.removeItem(factoryResetKey);
    queueRoomSave();
  };

  const saveRooms = async (requestedRooms: Room[]) => {
    let result;
    try {
      result = await saveSharedRooms(requestedRooms, roomsUpdatedAtRef.current);
    } catch (error) {
      if (!(error instanceof SharedRoomDirectoryConflictError)) throw error;
      const remote = await loadSharedRooms();
      const local = roomsRef.current;
      const merged = mergeRoomDirectoryChanges(
        syncedRoomsRef.current,
        local,
        remote.rooms,
      );
      if (JSON.stringify(local) !== JSON.stringify(merged)) {
        roomsRef.current = merged;
        setRooms(merged);
        window.localStorage.setItem(storageKey, JSON.stringify(merged));
      }
      result = JSON.stringify(merged) === JSON.stringify(remote.rooms)
        ? remote
        : await saveSharedRooms(merged, remote.updatedAt);
    }
    roomsUpdatedAtRef.current = result.updatedAt;
    syncedRoomsRef.current = result.rooms;
    return result;
  };

  const queueRoomSave = () => {
    syncQueue.current = syncQueue.current
      .catch(() => undefined)
      .then(async () => {
        await saveRooms(roomsRef.current);
        setRoomsSyncError("");
      })
      .catch((cause: unknown) => {
        setRoomsSyncError(cause instanceof Error ? cause.message : "Não foi possível sincronizar as salas com o servidor.");
      });
  };

  const syncRooms = async () => {
    setRoomsSyncError("");
    try {
      await syncQueue.current;
      await saveRooms(roomsRef.current);
      setRoomsSyncError("");
    } catch (cause) {
      setRoomsSyncError(cause instanceof Error ? cause.message : "Não foi possível sincronizar as salas com o servidor.");
    }
  };

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      const role = getAuthenticatedRole();
      if (!role) {
        setRoomCatalogLoading(false);
        return;
      }
      setRoomCatalogLoading(true);
      try {
        const directory = await loadSharedRooms();
        if (!active) return;
        roomsUpdatedAtRef.current = directory.updatedAt;
        if (directory.configured) {
          const normalizedRooms = directory.rooms.map(normalizeRoomRecord);
          syncedRoomsRef.current = normalizedRooms;
          roomsRef.current = normalizedRooms;
          setRooms(normalizedRooms);
          window.localStorage.setItem(storageKey, JSON.stringify(normalizedRooms));
          window.localStorage.removeItem(factoryResetKey);
          if (
            (role === "admin" || role === "operator") &&
            JSON.stringify(normalizedRooms) !== JSON.stringify(directory.rooms)
          ) {
            await saveRooms(normalizedRooms);
          }
        } else if (role === "user") {
          syncedRoomsRef.current = directory.rooms;
          roomsRef.current = [];
          setRooms([]);
          window.localStorage.removeItem(storageKey);
        } else if (roomsRef.current.length > 0) {
          syncedRoomsRef.current = directory.rooms;
          await saveRooms(roomsRef.current);
        } else {
          syncedRoomsRef.current = directory.rooms;
        }
        setRoomsSyncError("");
      } catch (cause) {
        if (active) {
          setRoomsSyncError(cause instanceof Error ? cause.message : "Não foi possível carregar as salas do servidor.");
        }
      } finally {
        if (active) setRoomCatalogLoading(false);
      }
    };
    void synchronize();
    const unsubscribe = onAuthenticatedSessionChange(() => void synchronize());
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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
    const matchingRooms = new Map<string, string>();
    classEntries.forEach((item) => {
      if (period && item.period !== period) return;
      if (segment && item.segment !== segment) return;
      const fullName = normalize(item.className);
      const classOnly = normalize(item.className.split(" · ")[0]);
      if (input === fullName || input === classOnly) {
        matchingRooms.set(normalizeRoom(item.room), item.room);
      }
    });
    return matchingRooms.size === 1 ? [...matchingRooms.values()][0] : "";
  };

  const classesForRoom = (room: string, period: Period, segment?: Segment) => {
    const matchingClasses = new Map<string, string>();
    classEntries.forEach((item) => {
      if (
        item.period === period &&
        (!segment || item.segment === segment) &&
        normalizeRoom(item.room) === normalizeRoom(room)
      ) {
        matchingClasses.set(normalize(item.className), item.className);
      }
    });
    return [...matchingClasses.values()];
  };
  const floorForRoom = (room: string) =>
    rooms.find((item) => normalizeRoom(roomLabel(item.number)) === normalizeRoom(room))?.floor ?? "Piso não informado";

  return <RoomDirectoryContext.Provider value={{ rooms, roomCatalogLoading, roomsSyncError, syncRooms, classEntries, roomOptions, roomOptionsForSegment, addRoom, updateRoom, deleteRoom, deleteRooms, roomForClass, classesForRoom, floorForRoom }}>{children}</RoomDirectoryContext.Provider>;
}

export function useRoomDirectory() {
  const value = useContext(RoomDirectoryContext);
  if (!value) throw new Error("useRoomDirectory must be used inside RoomDirectoryProvider");
  return value;
}
