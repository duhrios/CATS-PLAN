import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { campusSettingsTable } from "@workspace/db/schema";

export const roomDirectorySettingKey = "campus-rooms-v1";
export type CampusRoom = {
  id: string;
  number: string;
  floor: string;
  segment: string;
  morningClasses: string[];
  afternoonClasses: string[];
};

const isCampusRoom = (value: unknown): value is CampusRoom => {
  if (!value || typeof value !== "object") return false;
  const room = value as Record<string, unknown>;
  return typeof room.id === "string" &&
    typeof room.number === "string" &&
    typeof room.floor === "string" &&
    typeof room.segment === "string" &&
    ["Educação Infantil", "Fundamental 1", "Fundamental 2", "Ensino Médio"].includes(room.segment) &&
    Array.isArray(room.morningClasses) &&
    room.morningClasses.every((name) => typeof name === "string") &&
    Array.isArray(room.afternoonClasses) &&
    room.afternoonClasses.every((name) => typeof name === "string");
};

export const getRoomDirectory = async () => {
  const [setting] = await db.select({ value: campusSettingsTable.value })
    .from(campusSettingsTable)
    .where(eq(campusSettingsTable.key, roomDirectorySettingKey))
    .limit(1);
  if (!setting) return { rooms: [] as CampusRoom[], configured: false };

  let value: unknown;
  try {
    value = JSON.parse(setting.value);
  } catch (error) {
    throw new Error("O cadastro de salas persistido não é um JSON válido.", { cause: error });
  }
  if (!Array.isArray(value) || !value.every(isCampusRoom)) {
    throw new Error("O cadastro de salas persistido tem um formato inválido.");
  }
  return { rooms: value, configured: true };
};
