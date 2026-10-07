import { and, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { campusSettingsTable, cartsTable, reservationsTable, usersTable } from "@workspace/db/schema";
import { getAuthSession, requireSameOrigin, requireSession, requireSuperAdmin } from "../lib/auth";

const router: IRouter = Router();
export const teacherSpreadsheetSettingKey = "teacher-spreadsheet-enabled-v1";
const enabledByDefault = true;

const getTeacherSpreadsheetEnabled = async () => {
  const [setting] = await db.select({ value: campusSettingsTable.value })
    .from(campusSettingsTable)
    .where(eq(campusSettingsTable.key, teacherSpreadsheetSettingKey))
    .limit(1);
  if (!setting) return enabledByDefault;
  if (setting.value === "true") return true;
  if (setting.value === "false") return false;
  throw new Error("A configuração de acesso docente à visão rápida está inválida.");
};

const isDateKey = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

router.get("/teacher-spreadsheet/settings", requireSession, async (_req, res) => {
  return res.json({ enabled: await getTeacherSpreadsheetEnabled() });
});

router.put(
  "/teacher-spreadsheet/settings",
  requireSameOrigin,
  requireSuperAdmin,
  async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({ error: "Informe se a visão rápida ficará habilitada para professores." });
    }
    await db.insert(campusSettingsTable)
      .values({ key: teacherSpreadsheetSettingKey, value: String(req.body.enabled) })
      .onConflictDoUpdate({
        target: campusSettingsTable.key,
        set: { value: String(req.body.enabled), updatedAt: new Date() },
      });
    return res.json({ enabled: req.body.enabled });
  },
);

router.get("/teacher-spreadsheet/reservations", requireSession, async (req, res) => {
  const session = getAuthSession(req);
  if (session?.role !== "user" || !session.accountId) {
    return res.status(403).json({ error: "Esta consulta é exclusiva para professores." });
  }
  const [teacher] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, session.accountId),
      eq(usersTable.role, "user"),
      eq(usersTable.active, true),
    ))
    .limit(1);
  if (!teacher) {
    return res.status(403).json({ error: "A conta de professor não está ativa." });
  }
  if (!(await getTeacherSpreadsheetEnabled())) {
    return res.status(403).json({ error: "A visualização da planilha está desativada pelo administrador." });
  }
  const from = req.query.from;
  const to = req.query.to;
  if (!isDateKey(from) || !isDateKey(to) || from > to) {
    return res.status(400).json({ error: "Informe o início e o fim válidos da semana." });
  }
  const firstDate = new Date(`${from}T12:00:00Z`);
  const lastDate = new Date(`${to}T12:00:00Z`);
  const spanDays = Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000);
  if (spanDays > 6) {
    return res.status(400).json({ error: "A consulta pode abranger no máximo sete dias." });
  }

  const rows = await db.select({
    id: reservationsTable.id,
    teacherName: reservationsTable.teacherName,
    className: reservationsTable.className,
    period: reservationsTable.period,
    scheduledDate: reservationsTable.scheduledDate,
    startTime: reservationsTable.startTime,
    endTime: reservationsTable.endTime,
    cartName: cartsTable.name,
    kind: reservationsTable.kind,
  })
    .from(reservationsTable)
    .innerJoin(cartsTable, eq(cartsTable.id, reservationsTable.cartId))
    .where(and(
      gte(reservationsTable.scheduledDate, from),
      lte(reservationsTable.scheduledDate, to),
    ));
  return res.json(rows);
});

export default router;
