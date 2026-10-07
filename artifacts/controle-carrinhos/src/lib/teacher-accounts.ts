import { segments, type Segment } from "@/lib/campus-data";

const isSegment = (value: unknown): value is Segment =>
  typeof value === "string" && segments.some((segment) => segment === value);

export type TeacherAccessAccount = {
  id: string;
  name: string;
  email: string;
  segment: Segment;
  subject: string;
  mustSetPassword: boolean;
};

export type NewTeacherAccount = {
  name: string;
  email: string;
  segment: Segment;
  subject: string;
};

export const sortTeacherAccounts = (accounts: TeacherAccessAccount[]) =>
  [...accounts].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }) ||
    a.email.localeCompare(b.email, "pt-BR", { sensitivity: "base" }),
  );

const parseTeacherAccount = (value: unknown): TeacherAccessAccount => {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !("email" in value) ||
    typeof value.email !== "string" ||
    !("segment" in value) ||
    !isSegment(value.segment) ||
    !("subject" in value) ||
    typeof value.subject !== "string" ||
    !("mustSetPassword" in value) ||
    typeof value.mustSetPassword !== "boolean"
  ) {
    throw new Error("O servidor retornou um cadastro de professor inválido.");
  }
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    segment: value.segment,
    subject: value.subject,
    mustSetPassword: value.mustSetPassword,
  };
};

const request = async (url: string, init?: RequestInit) => {
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
    throw new Error(result?.error ?? `Falha na operação (${response.status}).`);
  }
  return response;
};

export async function loadTeacherAccounts(): Promise<TeacherAccessAccount[]> {
  const response = await request("/api/auth/teacher-accounts", { cache: "no-store" });
  const accounts: unknown = await response.json();
  if (!Array.isArray(accounts)) {
    throw new Error("O servidor retornou uma lista de professores inválida.");
  }
  return accounts.map(parseTeacherAccount);
}

export async function createTeacherAccounts(
  accounts: NewTeacherAccount[],
): Promise<TeacherAccessAccount[]> {
  const response = await request("/api/auth/teacher-accounts", {
    method: "POST",
    body: JSON.stringify({ accounts }),
  });
  const createdAccounts: unknown = await response.json();
  if (!Array.isArray(createdAccounts)) {
    throw new Error("O servidor não confirmou os acessos criados.");
  }
  return createdAccounts.map(parseTeacherAccount);
}

export async function completeTeacherRegistration(
  email: string,
  password: string,
): Promise<{ id: string; name: string }> {
  const response = await request("/api/auth/teacher-accounts/complete-registration", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const value: unknown = await response.json();
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("name" in value) ||
    typeof value.name !== "string"
  ) {
    throw new Error("O servidor não confirmou a definição da senha.");
  }
  return { id: value.id, name: value.name };
}

export async function checkTeacherFirstAccess(email: string): Promise<void> {
  const response = await request("/api/auth/teacher-accounts/check-first-access", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("eligible" in value) || value.eligible !== true) {
    throw new Error("O servidor não confirmou a elegibilidade do primeiro acesso.");
  }
}

export async function deleteTeacherAccount(id: string): Promise<void> {
  await request(`/api/auth/teacher-accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
