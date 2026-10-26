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
