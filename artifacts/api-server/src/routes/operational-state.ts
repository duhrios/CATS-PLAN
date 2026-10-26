import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { campusSettingsTable } from "@workspace/db/schema";
import {
  getAuthSession,
  requireSameOrigin,
  requireSession,
  type AuthRole,
} from "../lib/auth";

const router: IRouter = Router();
export const operationalStateSettingKey = "operational-state-v1";
const allowedKeys = new Set([
  "controle-carrinhos-carts",
  "controle-carrinhos-cart-schedules",
  "controle-carrinhos-wifi-points",
  "controle-carrinhos-wifi-rooms",
  "controle-carrinhos-movements",
  "controle-carrinhos-movement-settings",
  "controle-carrinhos-campus-settings",
]);
const maxStateBytes = 512_000;

export const validateOperationalState = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  const entries = Object.entries(state);
  if (entries.length > allowedKeys.size) return null;
  for (const [key, item] of entries) {
    if (!allowedKeys.has(key) || !item || typeof item !== "object") return null;
    if (Array.isArray(item) && item.length > 10_000) return null;
  }
  if (Buffer.byteLength(JSON.stringify(state), "utf8") > maxStateBytes) return null;
  return state;
};

export const operationalStateForRole = (
  state: Record<string, unknown>,
  role: AuthRole,
) => {
  if (role !== "user") return state;
  return Object.fromEntries(
    Object.entries(state).filter(([key]) => [
      "controle-carrinhos-carts",
      "controle-carrinhos-cart-schedules",
      "controle-carrinhos-movement-settings",
      "controle-carrinhos-campus-settings",
    ].includes(key)),
  );
};

const readState = async () => {
  const [row] = await db.select({
    value: campusSettingsTable.value,
    updatedAt: campusSettingsTable.updatedAt,
  })
    .from(campusSettingsTable)
    .where(eq(campusSettingsTable.key, operationalStateSettingKey))
    .limit(1);
  if (!row) return { state: null, updatedAt: null };
  let state: unknown;
  try {
    state = JSON.parse(row.value);
  } catch {
    throw new Error("O estado operacional persistido está inválido.");
  }
  const validatedState = validateOperationalState(state);
  if (!validatedState) throw new Error("O estado operacional persistido está inválido.");
  return { state: validatedState, updatedAt: row.updatedAt.toISOString() };
};

router.get("/operational-state", requireSession, async (req, res) => {
  const result = await readState();
  const session = getAuthSession(req);
  if (session?.role !== "user" || !result.state) return res.json(result);
  const state = operationalStateForRole(result.state, session.role);
  return res.json({ ...result, state });
});

router.put(
  "/operational-state",
  requireSameOrigin,
  requireSession,
  async (req, res) => {
    const session = getAuthSession(req);
    if (session?.role !== "admin" && session?.role !== "operator") {
      return res.status(403).json({ error: "Ação restrita à equipe." });
    }
    const state = validateOperationalState(req.body?.state);
    const expectedUpdatedAt = req.body?.updatedAt;
    if (!state || (expectedUpdatedAt !== null && typeof expectedUpdatedAt !== "string")) {
      return res.status(400).json({ error: "O estado operacional informado é inválido." });
    }
    const serialized = JSON.stringify(state);
    const [current] = await db.select({ updatedAt: campusSettingsTable.updatedAt })
      .from(campusSettingsTable)
      .where(eq(campusSettingsTable.key, operationalStateSettingKey))
      .limit(1);
    const currentUpdatedAt = current?.updatedAt.toISOString() ?? null;
    if (currentUpdatedAt !== expectedUpdatedAt) {
      return res.status(409).json({
        error: "Os dados operacionais foram alterados em outro dispositivo. Atualize a página antes de salvar novamente.",
      });
    }

    const updatedAt = new Date();
    if (current) {
      const [saved] = await db.update(campusSettingsTable)
        .set({ value: serialized, updatedAt })
        .where(and(
          eq(campusSettingsTable.key, operationalStateSettingKey),
          eq(campusSettingsTable.updatedAt, current.updatedAt),
        ))
        .returning({ updatedAt: campusSettingsTable.updatedAt });
      if (!saved) {
        return res.status(409).json({
          error: "Os dados operacionais foram alterados em outro dispositivo. Atualize a página antes de salvar novamente.",
        });
      }
      return res.json({ state, updatedAt: saved.updatedAt.toISOString() });
    }

    const [saved] = await db.insert(campusSettingsTable)
      .values({ key: operationalStateSettingKey, value: serialized, updatedAt })
      .onConflictDoNothing()
      .returning({ updatedAt: campusSettingsTable.updatedAt });
    if (!saved) {
      return res.status(409).json({
        error: "Os dados operacionais foram alterados em outro dispositivo. Atualize a página antes de salvar novamente.",
      });
    }
    return res.json({ state, updatedAt: saved.updatedAt.toISOString() });
  },
);

export default router;
