export type SupportTicket = {
  id: string;
  senderRole: "admin" | "operator" | "user";
  senderName: string;
  category: "Bug" | "Sugestão" | "Dúvida";
  title: string;
  message: string;
  status: "Pendente" | "Respondido" | "Resolvido";
  adminResponse: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  createdAt: string;
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
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(result?.error ?? `Falha na operação (${response.status}).`);
  return result;
};

export async function loadSupportTickets(): Promise<SupportTicket[]> {
  const response = await fetch("/api/support/tickets", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const error = result as { error?: string } | null;
    throw new Error(error?.error ?? "Não foi possível carregar os chamados.");
  }
  if (!Array.isArray(result)) throw new Error("O servidor retornou chamados inválidos.");
  return result as SupportTicket[];
}

export async function createSupportTicket(data: {
  category: SupportTicket["category"];
  title: string;
  message: string;
}) {
  await request("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSupportTicket(
  id: string,
  data: { status: SupportTicket["status"]; adminResponse: string },
) {
  await request(`/api/support/tickets/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
