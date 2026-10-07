export type StaffAccountRole = "admin" | "operator";

export type StaffAccount = {
  id: string;
  name: string;
  role: StaffAccountRole;
  isSuperAdmin: boolean;
};

const parseStaffAccount = (value: unknown): StaffAccount => {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !("role" in value) ||
    (value.role !== "admin" && value.role !== "operator") ||
    !("isSuperAdmin" in value) ||
    typeof value.isSuperAdmin !== "boolean"
  ) {
    throw new Error("O servidor retornou uma conta inválida.");
  }
  return {
    id: value.id,
    name: value.name,
    role: value.role,
    isSuperAdmin: value.isSuperAdmin,
  };
};

const apiRequest = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error ?? `Falha ao salvar conta (${response.status}).`);
  }
  return response;
};

export async function loadStaffAccounts(): Promise<StaffAccount[]> {
  const response = await apiRequest("/api/auth/staff-accounts", { cache: "no-store" });
  const accounts: unknown = await response.json();
  if (!Array.isArray(accounts)) {
    throw new Error("O servidor retornou uma lista de contas inválida.");
  }
  return accounts.map(parseStaffAccount);
}

export async function createStaffAccount(
  name: string,
  password: string,
  role: StaffAccountRole,
): Promise<StaffAccount> {
  const response = await apiRequest("/api/auth/staff-accounts", {
    method: "POST",
    body: JSON.stringify({ name, password, role }),
  });
  return parseStaffAccount(await response.json());
}

export async function updateStaffAccount(
  id: string,
  name: string,
  password: string,
): Promise<StaffAccount> {
  const response = await apiRequest(`/api/auth/staff-accounts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ name, password }),
  });
  return parseStaffAccount(await response.json());
}

export async function deleteStaffAccount(id: string): Promise<void> {
  await apiRequest(`/api/auth/staff-accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
