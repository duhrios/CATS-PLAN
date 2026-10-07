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

const parseDirectory = (value: unknown): { rooms: Room[]; configured: boolean } => {
  if (
    !value ||
    typeof value !== "object" ||
    !("rooms" in value) ||
    !Array.isArray(value.rooms) ||
    !value.rooms.every(isRoom) ||
    !("configured" in value) ||
    typeof value.configured !== "boolean"
  ) {
    throw new Error("O servidor retornou um cadastro de salas inválido.");
  }
  return { rooms: value.rooms, configured: value.configured };
};

const request = async (method: "GET" | "PUT", rooms?: Room[]) => {
  const response = await fetch("/api/rooms", {
    method,
    credentials: "same-origin",
    ...(rooms
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rooms }),
        }
      : { cache: "no-store" as RequestCache }),
  });
  const result = await response.json().catch(() => null) as
    | ({ error?: string } & Record<string, unknown>)
    | null;
  if (!response.ok) {
    throw new Error(result?.error ?? `Falha ao sincronizar as salas (${response.status}).`);
  }
  return parseDirectory(result);
};

export const loadSharedRooms = () => request("GET");
export const saveSharedRooms = (rooms: Room[]) => request("PUT", rooms);
