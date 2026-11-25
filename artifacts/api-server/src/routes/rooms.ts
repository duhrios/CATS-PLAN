import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { campusSettingsTable } from "@workspace/db/schema";
import { requireAdmin, requireSameOrigin, requireSession } from "../lib/auth";
import {
  getRoomDirectory,
  nextRoomDirectoryTimestamp,
  roomDirectorySettingKey,
  roomDirectoryVersionMatches,
  type CampusRoom,
} from "../lib/room-directory";

const router: IRouter = Router();
const segments = ["Educação Infantil", "Fundamental 1", "Fundamental 2", "Ensino Médio", "Contraturno"];

const validateRooms = (value: unknown): CampusRoom[] | null => {
  if (!Array.isArray(value) || value.length > 200) return null;
  const ids = new Set<string>();
  const numbers = new Set<string>();
  const rooms: CampusRoom[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const room = candidate as Record<string, unknown>;
    if (
      typeof room.id !== "string" || !room.id || room.id.length > 120 ||
      typeof room.number !== "string" || !room.number.trim() || room.number.length > 40 ||
      typeof room.floor !== "string" || !room.floor.trim() || room.floor.length > 80 ||
      typeof room.segment !== "string" || !segments.includes(room.segment) ||
      !Array.isArray(room.morningClasses) || !room.morningClasses.every((name) => typeof name === "string" && name.trim().length > 0 && name.length <= 120) ||
      !Array.isArray(room.afternoonClasses) || !room.afternoonClasses.every((name) => typeof name === "string" && name.trim().length > 0 && name.length <= 120)
    ) return null;
    const normalizedNumber = room.number.trim().toLocaleLowerCase("pt-BR").replace(/^sala\s*/i, "");
    if (ids.has(room.id) || numbers.has(normalizedNumber)) return null;
    ids.add(room.id);
    numbers.add(normalizedNumber);
    rooms.push({
      id: room.id,
      number: room.number.trim(),
      floor: room.floor.trim(),
      segment: room.segment,
      morningClasses: room.morningClasses.map((name) => name.trim()),
      afternoonClasses: room.afternoonClasses.map((name) => name.trim()),
    });
  }
  return rooms;
};

router.get("/rooms", requireSession, async (_req, res) => {
  const directory = await getRoomDirectory();
  return res.json(directory);
});

router.put("/rooms", requireSameOrigin, requireAdmin, async (req, res) => {
  const rooms = validateRooms(req.body?.rooms);
  if (!rooms) {
    return res.status(400).json({ error: "O cadastro de salas contém dados inválidos ou repetidos." });
  }
  const expectedUpdatedAt = req.body?.updatedAt;
  if (
    !Object.prototype.hasOwnProperty.call(req.body ?? {}, "updatedAt") ||
    (expectedUpdatedAt !== null && typeof expectedUpdatedAt !== "string")
  ) {
    return res.status(400).json({ error: "A versão do cadastro de salas está ausente ou inválida." });
  }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select({ updatedAt: campusSettingsTable.updatedAt })
      .from(campusSettingsTable)
      .where(eq(campusSettingsTable.key, roomDirectorySettingKey))
      .for("update")
      .limit(1);
    if (!roomDirectoryVersionMatches(current?.updatedAt ?? null, expectedUpdatedAt)) {
      return null;
    }

    const updatedAt = nextRoomDirectoryTimestamp(current?.updatedAt ?? null);
    const saved = current
      ? (await tx.update(campusSettingsTable)
          .set({ value: JSON.stringify(rooms), updatedAt })
          .where(and(
            eq(campusSettingsTable.key, roomDirectorySettingKey),
            eq(campusSettingsTable.updatedAt, current.updatedAt),
          ))
          .returning({ updatedAt: campusSettingsTable.updatedAt }))[0]
      : (await tx.insert(campusSettingsTable)
          .values({ key: roomDirectorySettingKey, value: JSON.stringify(rooms), updatedAt })
          .onConflictDoNothing()
          .returning({ updatedAt: campusSettingsTable.updatedAt }))[0];
    if (!saved) return null;
    return {
      rooms,
      configured: true,
      updatedAt: saved.updatedAt.toISOString(),
    };
  });
  if (!result) {
    return res.status(409).json({
      error: "O cadastro de salas foi alterado em outro dispositivo. Atualize a página antes de salvar novamente.",
    });
  }
  return res.json(result);
});

export default router;
