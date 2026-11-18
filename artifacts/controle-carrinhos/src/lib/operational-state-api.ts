export const operationalStateStorageKeys = [
  "controle-carrinhos-carts",
  "controle-carrinhos-cart-schedules",
  "controle-carrinhos-wifi-points",
  "controle-carrinhos-wifi-rooms",
  "controle-carrinhos-movements",
  "controle-carrinhos-movement-settings",
  "controle-carrinhos-campus-settings",
] as const;

export type OperationalState = Record<string, unknown>;
export type SharedOperationalState = {
  state: OperationalState | null;
  updatedAt: string | null;
};

const wifiPointsStorageKey = "controle-carrinhos-wifi-points";

const isIdentifiedRecord = (value: unknown): value is { id: string } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Record<string, unknown>).id === "string";

const mergeWifiPointChanges = (
  original: unknown,
  local: unknown,
  remote: unknown,
): unknown => {
  if (
    !Array.isArray(original) ||
    !Array.isArray(local) ||
    !Array.isArray(remote) ||
    ![...original, ...local, ...remote].every(isIdentifiedRecord)
  ) {
    return local;
  }

  const originalById = new Map(original.map((point) => [point.id, point]));
  const localById = new Map(local.map((point) => [point.id, point]));
  const merged = [...remote];
  const changedIds = new Set([...originalById.keys(), ...localById.keys()]);

  changedIds.forEach((id) => {
    const originalPoint = originalById.get(id);
    const localPoint = localById.get(id);
    if (JSON.stringify(originalPoint) === JSON.stringify(localPoint)) return;

    const remoteIndex = merged.findIndex((point) => point.id === id);
    if (!localPoint) {
      if (remoteIndex >= 0) merged.splice(remoteIndex, 1);
      return;
    }

    if (remoteIndex >= 0) merged[remoteIndex] = localPoint;
    else merged.push(localPoint);
  });

  return merged;
};

export const mergeOperationalStateWithLocalChanges = (
  localAtRequestStart: OperationalState,
  localAfterRequest: OperationalState,
  remote: OperationalState,
): { state: OperationalState; syncedState: OperationalState; hasLocalChanges: boolean } => {
  const syncedState = { ...localAtRequestStart, ...remote };
  const state = { ...syncedState };
  let hasLocalChanges = false;

  operationalStateStorageKeys.forEach((key) => {
    if (
      JSON.stringify(localAtRequestStart[key]) ===
      JSON.stringify(localAfterRequest[key])
    ) {
      return;
    }

    hasLocalChanges = true;
    state[key] = key === wifiPointsStorageKey
      ? mergeWifiPointChanges(
          localAtRequestStart[key],
          localAfterRequest[key],
          syncedState[key],
        )
      : localAfterRequest[key];
  });

  return { state, syncedState, hasLocalChanges };
};

const requireResponse = async (response: Response) => {
  if (response.ok) return response;
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  throw new Error(
    typeof body.error === "string"
      ? body.error
      : `Falha ao sincronizar os dados operacionais (${response.status}).`,
  );
};

export const loadSharedOperationalState = async (): Promise<SharedOperationalState> => {
  const response = await requireResponse(await fetch("/api/operational-state", {
    cache: "no-store",
    credentials: "same-origin",
  }));
  return response.json() as Promise<SharedOperationalState>;
};

export const saveSharedOperationalState = async (
  state: OperationalState,
  updatedAt: string | null,
): Promise<SharedOperationalState> => {
  const response = await requireResponse(await fetch("/api/operational-state", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, updatedAt }),
  }));
  return response.json() as Promise<SharedOperationalState>;
};
