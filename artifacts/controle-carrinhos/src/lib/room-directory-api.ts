import type { Room } from "@/lib/room-directory";
import { segments, type Segment } from "@/lib/campus-data";

const isRoom = (value: unknown): value is Room => {
  if (!value || typeof value !== "object") return false;
  const room = value as Record<string, unknown>;
  return typeof room.id === "string" &&
    typeof room.number === "string" &&
    typeof room.floor === "string" &&
    typeof room.segment === "string" &&
    segments.includes(room.segment as Segment) &&
    Array.isArray(room.morningClasses) &&
    room.morningClasses.every((name) => typeof name === "string") &&
    Array.isArray(room.afternoonClasses) &&
    room.afternoonClasses.every((name) => typeof name === "string");
};

export type SharedRoomDirectory = {
  rooms: Room[];
  configured: boolean;
  updatedAt: string | null;
};

export class SharedRoomDirectoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharedRoomDirectoryConflictError";
  }
}

export const mergeRoomDirectoryChanges = (
  original: Room[],
  local: Room[],
  remote: Room[],
) => {
  const originalById = new Map(original.map((room) => [room.id, room]));
  const localById = new Map(local.map((room) => [room.id, room]));
  const merged = [...remote];
  const changedIds = new Set([...originalById.keys(), ...localById.keys()]);

  changedIds.forEach((id) => {
    const originalRoom = originalById.get(id);
    const localRoom = localById.get(id);
    if (JSON.stringify(originalRoom) === JSON.stringify(localRoom)) return;

    const remoteIndex = merged.findIndex((room) => room.id === id);
    if (!localRoom) {
      if (remoteIndex >= 0) merged.splice(remoteIndex, 1);
      return;
    }

    if (remoteIndex >= 0) merged[remoteIndex] = localRoom;
    else merged.push(localRoom);
  });

  return merged;
};

const parseDirectory = (value: unknown): SharedRoomDirectory => {
  if (
    !value ||
    typeof value !== "object" ||
    !("rooms" in value) ||
    !Array.isArray(value.rooms) ||
    !value.rooms.every(isRoom) ||
    !("configured" in value) ||
    typeof value.configured !== "boolean" ||
    ("updatedAt" in value &&
      value.updatedAt !== null &&
      typeof value.updatedAt !== "string")
  ) {
    throw new Error("O servidor retornou um cadastro de salas inválido.");
  }
  return {
    rooms: value.rooms,
    configured: value.configured,
    updatedAt: "updatedAt" in value && typeof value.updatedAt === "string"
      ? value.updatedAt
      : null,
  };
};

const request = async (
  method: "GET" | "PUT",
  rooms?: Room[],
  updatedAt?: string | null,
) => {
  const response = await fetch("/api/rooms", {
    method,
    credentials: "same-origin",
    ...(rooms
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rooms, updatedAt }),
        }
      : { cache: "no-store" as RequestCache }),
  });
  const result = await response.json().catch(() => null) as
    | ({ error?: string } & Record<string, unknown>)
    | null;
  if (!response.ok) {
    const message = result?.error ?? `Falha ao sincronizar as salas (${response.status}).`;
    if (response.status === 409) throw new SharedRoomDirectoryConflictError(message);
    throw new Error(message);
  }
  return parseDirectory(result);
};

export const loadSharedRooms = () => request("GET");
export const saveSharedRooms = (rooms: Room[], updatedAt: string | null) =>
  request("PUT", rooms, updatedAt);
