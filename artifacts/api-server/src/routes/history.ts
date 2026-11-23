import { desc } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { activityTable } from "@workspace/db/schema";
import { getAuthSession, requireAdmin, requireSameOrigin, requireStaff } from "../lib/auth";
import { activityMetadata } from "../lib/activity-history";

const router: IRouter = Router();
const historyLimit = 5_000;

const dateAndTimeInBrazil = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
};

const toneForActivity = (title: string): "neutral" | "good" | "warm" | "bad" => {
  const normalized = title.toLocaleLowerCase("pt-BR");
  if (/devolvido|removido|encerrada|indisponível|não recebeu|não atendida/.test(normalized)) {
    return "bad";
  }
  if (/concluída|disponível|cadastrado|confirmado|atribuído/.test(normalized)) {
    return "good";
  }
  if (/movimentação|alterado|atualizado/.test(normalized)) return "warm";
  return "neutral";
};

router.get("/history", requireStaff, async (_req, res) => {
  const rows = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
    .limit(historyLimit);

  return res.json(rows.map((row) => {
    const metadata = activityMetadata(row.description);
    const { date, time } = dateAndTimeInBrazil(row.createdAt);
    return {
      id: `activity-${row.id}`,
      type: row.type,
      title: row.title,
      detail: metadata.detail,
      actor: row.actor,
      date,
      time,
      tone: toneForActivity(row.title),
      ...(metadata.person ? { person: metadata.person } : {}),
      ...(metadata.profile ? { profile: metadata.profile } : {}),
      ...(metadata.entityKeys ? { entityKeys: metadata.entityKeys } : {}),
    };
  }));
});

router.delete("/history", requireSameOrigin, requireAdmin, async (req, res) => {
  const session = getAuthSession(req);
  if (!session?.isSuperAdmin) {
    return res.status(403).json({
      error: "Somente o superadministrador pode limpar o histórico.",
    });
  }
  await db.delete(activityTable);
  return res.status(204).end();
});

export default router;
