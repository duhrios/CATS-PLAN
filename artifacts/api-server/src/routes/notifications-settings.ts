import { inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { campusSettingsTable } from "@workspace/db/schema";
import { requireAdmin, requireSameOrigin, requireSession } from "../lib/auth";

const router: IRouter = Router();

export const notificationDefinitions = {
  ti: [
    { id: "reservation-created", label: "Nova reserva criada" },
    { id: "reservation-scheduled", label: "Reserva no horário agendado" },
    { id: "movement-request", label: "Novo pedido de movimentação do professor" },
    { id: "movement-audio", label: "Alertas sonoros de movimentação" },
    { id: "push", label: "Inscrição para receber notificações push" },
  ],
  teachers: [
    { id: "push", label: "Inscrição para receber notificações push" },
  ],
} as const;

export type NotificationGroup = keyof typeof notificationDefinitions;
export type NotificationId<G extends NotificationGroup> =
  (typeof notificationDefinitions)[G][number]["id"];
export type NotificationSettings = {
  [G in NotificationGroup]: Record<NotificationId<G>, boolean>;
};

const legacySettingKeys: Record<NotificationGroup, string> = {
  ti: "notifications-ti-enabled-v1",
  teachers: "notifications-teachers-enabled-v1",
};
const notificationSettingKey = (group: NotificationGroup, notification: string) =>
  `notifications-${group}-${notification}-enabled-v1`;
const allSettingKeys = [
  ...Object.entries(notificationDefinitions).flatMap(([group, notifications]) =>
    notifications.map(({ id }) => notificationSettingKey(group as NotificationGroup, id)),
  ),
  ...Object.values(legacySettingKeys),
];

const readSettings = async (): Promise<NotificationSettings> => {
  const rows = await db.select({
    key: campusSettingsTable.key,
    value: campusSettingsTable.value,
  })
    .from(campusSettingsTable)
    .where(inArray(campusSettingsTable.key, allSettingKeys));
  const values = new Map(rows.map(({ key, value }) => [key, value]));
  const readBoolean = (key: string, fallback = true) => {
    const value = values.get(key);
    if (value === undefined) return fallback;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`A configuração de notificação ${key} está inválida.`);
  };
  return {
    ti: Object.fromEntries(
      notificationDefinitions.ti.map(({ id }) => [
        id,
        readBoolean(
          notificationSettingKey("ti", id),
          readBoolean(legacySettingKeys.ti),
        ),
      ]),
    ) as NotificationSettings["ti"],
    teachers: Object.fromEntries(
      notificationDefinitions.teachers.map(({ id }) => [
        id,
        readBoolean(
          notificationSettingKey("teachers", id),
          readBoolean(legacySettingKeys.teachers),
        ),
      ]),
    ) as NotificationSettings["teachers"],
  };
};

export const isNotificationEnabled = async (
  group: NotificationGroup,
  notification: string,
) => {
  const settings = await readSettings();
  return Boolean(
    (settings[group] as Record<string, boolean>)[notification],
  );
};

router.get("/notifications/settings", requireSession, async (_req, res) => {
  return res.json(await readSettings());
});

router.put(
  "/notifications/settings",
  requireSameOrigin,
  requireAdmin,
  async (req, res) => {
    const group: unknown = req.body?.group;
    const notification: unknown = req.body?.notification;
    const enabled = req.body?.enabled as unknown;
    if (
      (group !== "ti" && group !== "teachers") ||
      typeof notification !== "string" ||
      !notificationDefinitions[group].some(({ id }) => id === notification) ||
      typeof enabled !== "boolean"
    ) {
      return res.status(400).json({
        error: "Informe uma notificação válida e se ela ficará ativada.",
      });
    }
    await db.insert(campusSettingsTable)
      .values({
        key: notificationSettingKey(group, notification),
        value: String(enabled),
      })
      .onConflictDoUpdate({
        target: campusSettingsTable.key,
        set: { value: String(enabled), updatedAt: new Date() },
      });
    return res.json(await readSettings());
  },
);

export default router;
