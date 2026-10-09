import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { campusSettingsTable } from "@workspace/db/schema";
import { getAuthSession, requireSameOrigin, requireSession } from "../lib/auth";
import { getRoomDirectory, roomDirectorySettingKey, type CampusRoom } from "../lib/room-directory";

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

router.put("/rooms", requireSameOrigin, requireSession, async (req, res) => {
  const session = getAuthSession(req);
  if (session?.role !== "admin" && session?.role !== "operator") {
    return res.status(403).json({ error: "Somente o TI ou a administração podem cadastrar salas e turmas." });
  }
  const rooms = validateRooms(req.body?.rooms);
  if (!rooms) {
    return res.status(400).json({ error: "O cadastro de salas contém dados inválidos ou repetidos." });
  }
  await db.insert(campusSettingsTable)
    .values({ key: roomDirectorySettingKey, value: JSON.stringify(rooms) })
    .onConflictDoUpdate({
      target: campusSettingsTable.key,
      set: { value: JSON.stringify(rooms), updatedAt: new Date() },
    });
  return res.json({ rooms, configured: true });
});

export default router;
