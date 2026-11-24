import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { activityTable, campusSettingsTable } from "@workspace/db/schema";
import {
  getAuthSession,
  requireSameOrigin,
  requireSession,
  type AuthRole,
} from "../lib/auth";
import {
  activityRecord,
  buildOperationalActivityEvents,
} from "../lib/activity-history";

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
const deletedWifiPointIdsKey = "__deletedWifiPointIds";
const deletedCartIdsKey = "__deletedCartIds";
const internalKeys = new Set([deletedWifiPointIdsKey, deletedCartIdsKey]);
const maxStateBytes = 512_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const preserveDeletedCartUnits = (
  previousState: Record<string, unknown>,
  nextState: Record<string, unknown>,
) => {
  const previousCarts = previousState["controle-carrinhos-carts"];
  const nextCarts = nextState["controle-carrinhos-carts"];
  if (!Array.isArray(previousCarts) || !Array.isArray(nextCarts)) return nextState;

  const previousById = new Map(
    previousCarts
      .filter(isRecord)
      .filter((cart) => typeof cart.id === "string")
      .map((cart) => [cart.id as string, cart]),
  );
  let changed = false;
  const carts = nextCarts.map((cart) => {
    if (!isRecord(cart) || typeof cart.id !== "string") return cart;
    const previous = previousById.get(cart.id);
    if (
      !previous ||
      previous.name !== cart.name ||
      previous.code !== cart.code ||
      previous.prefix !== cart.prefix
    ) return cart;

    const deletedUnits = Array.from(new Set([
      ...(Array.isArray(previous.deletedUnits)
        ? previous.deletedUnits.filter((unit): unit is string => typeof unit === "string")
        : []),
      ...(Array.isArray(cart.deletedUnits)
        ? cart.deletedUnits.filter((unit): unit is string => typeof unit === "string")
        : []),
    ]));
    const deleted = new Set(deletedUnits);
    const hasStaleAssignment = isRecord(cart.reserveAssignments) &&
      Object.keys(cart.reserveAssignments).some((unit) => deleted.has(unit));
    const hasStaleReason = isRecord(cart.unavailableUnitReasons) &&
      Object.keys(cart.unavailableUnitReasons).some((unit) => deleted.has(unit));
    const hasStaleUnavailableUnit = Array.isArray(cart.unavailableUnits) &&
      cart.unavailableUnits.some((unit) => typeof unit === "string" && deleted.has(unit));
    const hasStaleReservedUnit = Array.isArray(cart.reservedUnits) &&
      cart.reservedUnits.some((unit) => typeof unit === "string" && deleted.has(unit));
    if (
      deletedUnits.length === (Array.isArray(cart.deletedUnits) ? cart.deletedUnits.length : 0) &&
      !hasStaleAssignment &&
      !hasStaleReason &&
      !hasStaleUnavailableUnit &&
      !hasStaleReservedUnit
    ) {
      return cart;
    }

    changed = true;
    const reserveAssignments = isRecord(cart.reserveAssignments)
      ? Object.fromEntries(
          Object.entries(cart.reserveAssignments).filter(([unit]) => !deleted.has(unit)),
        )
      : cart.reserveAssignments;
    const unavailableUnitReasons = isRecord(cart.unavailableUnitReasons)
      ? Object.fromEntries(
          Object.entries(cart.unavailableUnitReasons).filter(([unit]) => !deleted.has(unit)),
        )
      : cart.unavailableUnitReasons;
    const unavailableUnits = Array.isArray(cart.unavailableUnits)
      ? cart.unavailableUnits.filter(
          (unit): unit is string => typeof unit === "string" && !deleted.has(unit),
        )
      : cart.unavailableUnits;
    const reservedUnits = Array.isArray(cart.reservedUnits)
      ? cart.reservedUnits.filter(
          (unit): unit is string => typeof unit === "string" && !deleted.has(unit),
        )
      : cart.reservedUnits;
    const available = typeof cart.total === "number"
      ? Math.max(
          0,
          cart.total -
            deletedUnits.length -
            (Array.isArray(unavailableUnits) ? unavailableUnits.length : 0),
        )
      : cart.available;
    return {
      ...cart,
      deletedUnits,
      reserveAssignments,
      unavailableUnitReasons,
      unavailableUnits,
      reservedUnits,
      available,
    };
  });
  return changed
    ? { ...nextState, "controle-carrinhos-carts": carts }
    : nextState;
};

export const preserveDeletedOperationalEntities = (
  previousState: Record<string, unknown>,
  nextState: Record<string, unknown>,
  restoreDeletedUnits = false,
): Record<string, unknown> => {
  const state = restoreDeletedUnits
    ? nextState
    : preserveDeletedCartUnits(previousState, nextState);
  const previousWifiPoints = previousState["controle-carrinhos-wifi-points"];
  const nextWifiPoints = state["controle-carrinhos-wifi-points"];
  const previousCarts = previousState["controle-carrinhos-carts"];
  const nextCarts = state["controle-carrinhos-carts"];
  const cartIds = new Set(
    Array.isArray(nextCarts)
      ? nextCarts.filter(isRecord).flatMap((cart) =>
          typeof cart.id === "string" ? [cart.id] : [],
        )
      : [],
  );
  const deletedWifiPointIds = new Set(
    Array.isArray(previousState[deletedWifiPointIdsKey])
      ? previousState[deletedWifiPointIdsKey].filter(
          (id): id is string => typeof id === "string",
        )
      : [],
  );
  const deletedCartIds = new Set(
    Array.isArray(previousState[deletedCartIdsKey])
      ? previousState[deletedCartIdsKey].filter(
          (id): id is string => typeof id === "string",
        )
      : [],
  );

  if (Array.isArray(previousWifiPoints) && Array.isArray(nextWifiPoints)) {
    const nextPointIds = new Set(
      nextWifiPoints.filter(isRecord).flatMap((point) =>
        typeof point.id === "string" ? [point.id] : [],
      ),
    );
    previousWifiPoints.filter(isRecord).forEach((point) => {
      if (typeof point.id === "string" && !nextPointIds.has(point.id)) {
        deletedWifiPointIds.add(point.id);
      }
    });
    state["controle-carrinhos-wifi-points"] = nextWifiPoints.filter(
      (point) => !isRecord(point) ||
        typeof point.id !== "string" ||
        !deletedWifiPointIds.has(point.id),
    );
  }

  if (Array.isArray(previousCarts) && Array.isArray(nextCarts)) {
    const nextCartIds = new Set(
      nextCarts.filter(isRecord).flatMap((cart) =>
        typeof cart.id === "string" ? [cart.id] : [],
      ),
    );
    previousCarts.filter(isRecord).forEach((cart) => {
      if (typeof cart.id === "string" && !nextCartIds.has(cart.id)) {
        deletedCartIds.add(cart.id);
      }
    });
    if (restoreDeletedUnits) {
      cartIds.forEach((id) => deletedCartIds.delete(id));
    }
    state["controle-carrinhos-carts"] = nextCarts.filter(
      (cart) => !isRecord(cart) ||
        typeof cart.id !== "string" ||
        !deletedCartIds.has(cart.id),
    );
  }

  return {
    ...state,
    [deletedWifiPointIdsKey]: [...deletedWifiPointIds],
    [deletedCartIdsKey]: [...deletedCartIds],
  };
};

export const validateOperationalState = (
  value: unknown,
  allowInternalKeys = false,
): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  const entries = Object.entries(state);
  const validKeys = allowInternalKeys
    ? new Set([...allowedKeys, ...internalKeys])
    : allowedKeys;
  if (entries.length > validKeys.size) return null;
  for (const [key, item] of entries) {
    if (!validKeys.has(key) || !item || typeof item !== "object") return null;
    if (Array.isArray(item) && item.length > 10_000) return null;
    if (
      internalKeys.has(key) &&
      (!Array.isArray(item) || !item.every((id) => typeof id === "string"))
    ) return null;
  }
  if (Buffer.byteLength(JSON.stringify(state), "utf8") > maxStateBytes) return null;
  return state;
};

export const publicOperationalState = (state: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(state).filter(([key]) => !internalKeys.has(key)),
  );

export const nextOperationalStateTimestamp = (
  currentUpdatedAt: Date | null,
  now = Date.now(),
) => new Date(Math.max(
  now,
  currentUpdatedAt ? currentUpdatedAt.getTime() + 1 : now,
));

export const operationalStateForRole = (
  state: Record<string, unknown>,
  role: AuthRole,
) => {
  const visibleState = publicOperationalState(state);
  if (role !== "user") return visibleState;
  return Object.fromEntries(
    Object.entries(visibleState).filter(([key]) => [
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
  const validatedState = validateOperationalState(state, true);
  if (!validatedState) throw new Error("O estado operacional persistido está inválido.");
  return { state: validatedState, updatedAt: row.updatedAt.toISOString() };
};

router.get("/operational-state", requireSession, async (req, res) => {
  const result = await readState();
  const session = getAuthSession(req);
  if (!result.state) return res.json(result);
  const state = operationalStateForRole(result.state, session?.role ?? "user");
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
    const requestedState = validateOperationalState(req.body?.state);
    const expectedUpdatedAt = req.body?.updatedAt;
    const restoreDeletedUnits = req.body?.restoreDeletedUnits;
    if (
      !requestedState ||
      (expectedUpdatedAt !== null && typeof expectedUpdatedAt !== "string") ||
      (restoreDeletedUnits !== undefined && typeof restoreDeletedUnits !== "boolean")
    ) {
      return res.status(400).json({ error: "O estado operacional informado é inválido." });
    }
    if (restoreDeletedUnits === true && !session.isSuperAdmin) {
      return res.status(403).json({
        error: "Somente o superadministrador pode restaurar unidades excluídas.",
      });
    }
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select({
        value: campusSettingsTable.value,
        updatedAt: campusSettingsTable.updatedAt,
      })
        .from(campusSettingsTable)
        .where(eq(campusSettingsTable.key, operationalStateSettingKey))
        .for("update")
        .limit(1);
      const currentUpdatedAt = current?.updatedAt.toISOString() ?? null;
      if (currentUpdatedAt !== expectedUpdatedAt) return null;

      let previousState: Record<string, unknown> | null = null;
      if (current) {
        let parsedState: unknown;
        try {
          parsedState = JSON.parse(current.value);
        } catch {
          throw new Error("O estado operacional persistido está inválido.");
        }
        previousState = validateOperationalState(parsedState, true);
        if (!previousState) {
          throw new Error("O estado operacional persistido está inválido.");
        }
      }
      const state = previousState
        ? preserveDeletedOperationalEntities(
            previousState,
            requestedState,
            restoreDeletedUnits === true,
          )
        : requestedState;
      if (!validateOperationalState(state, true)) {
        throw new Error("Os dados operacionais excedem o limite permitido.");
      }
      const serialized = JSON.stringify(state);

      const updatedAt = nextOperationalStateTimestamp(current?.updatedAt ?? null);
      const saved = current
        ? (await tx.update(campusSettingsTable)
            .set({ value: serialized, updatedAt })
            .where(and(
              eq(campusSettingsTable.key, operationalStateSettingKey),
              eq(campusSettingsTable.updatedAt, current.updatedAt),
            ))
            .returning({ updatedAt: campusSettingsTable.updatedAt }))[0]
        : (await tx.insert(campusSettingsTable)
            .values({ key: operationalStateSettingKey, value: serialized, updatedAt })
            .onConflictDoNothing()
            .returning({ updatedAt: campusSettingsTable.updatedAt }))[0];
      if (!saved) return null;

      if (previousState && session?.name) {
        const events = buildOperationalActivityEvents(
          publicOperationalState(previousState),
          publicOperationalState(state),
          session.name,
          session.role as AuthRole,
        );
        if (events.length) {
          await tx.insert(activityTable).values(events.map(activityRecord));
        }
      }
      return {
        state: publicOperationalState(state),
        updatedAt: saved.updatedAt.toISOString(),
      };
    });
    if (!result) {
      return res.status(409).json({
        error: "Os dados operacionais foram alterados em outro dispositivo. Atualize a página antes de salvar novamente.",
      });
    }
    return res.json(result);
  },
);

export default router;
