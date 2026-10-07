import type { Reservation } from "@/lib/campus-data";

type TeacherSpreadsheetRecord = {
  id: number;
  teacherName: string;
  className: string;
  period: "Manhã" | "Tarde";
  scheduledDate: string;
  startTime: string;
  endTime: string;
  cartName: string;
  kind: "Aula" | "Reserva";
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

const parseSetting = async (response: Response) => {
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("enabled" in result) ||
    typeof result.enabled !== "boolean"
  ) {
    throw new Error("O servidor retornou uma configuração de planilha inválida.");
  }
  return result.enabled;
};

export async function loadTeacherSpreadsheetEnabled(): Promise<boolean> {
  return parseSetting(await request("/api/teacher-spreadsheet/settings", { cache: "no-store" }));
}

export async function saveTeacherSpreadsheetEnabled(enabled: boolean): Promise<boolean> {
  return parseSetting(await request("/api/teacher-spreadsheet/settings", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  }));
}

export async function loadTeacherSpreadsheetReservations(
  from: string,
  to: string,
): Promise<Reservation[]> {
  const query = new URLSearchParams({ from, to });
  const response = await request(`/api/teacher-spreadsheet/reservations?${query}`, {
    cache: "no-store",
  });
  const records: unknown = await response.json();
  if (!Array.isArray(records)) {
    throw new Error("O servidor retornou uma lista de agendamentos inválida.");
  }
  return records.map((value): Reservation => {
    if (
      !value ||
      typeof value !== "object" ||
      !("id" in value) || typeof value.id !== "number" || !Number.isInteger(value.id) ||
      !("teacherName" in value) || typeof value.teacherName !== "string" ||
      !("className" in value) || typeof value.className !== "string" ||
      !("period" in value) || (value.period !== "Manhã" && value.period !== "Tarde") ||
      !("scheduledDate" in value) || typeof value.scheduledDate !== "string" ||
      !("startTime" in value) || typeof value.startTime !== "string" ||
      !("endTime" in value) || typeof value.endTime !== "string" ||
      !("cartName" in value) || typeof value.cartName !== "string" ||
      !("kind" in value) || (value.kind !== "Aula" && value.kind !== "Reserva")
    ) {
      throw new Error("O servidor retornou um agendamento inválido para a visão rápida.");
    }
    const record = value as TeacherSpreadsheetRecord;
    return {
      id: record.id,
      teacher: record.teacherName,
      segment: "Fundamental 2",
      subject: "",
      className: record.className,
      room: "",
      period: record.period,
      date: record.scheduledDate,
      start: record.startTime.slice(0, 5),
      end: record.endTime.slice(0, 5),
      cart: record.cartName,
      status: "Aguardando",
      kind: record.kind,
      quantity: 1,
    };
  });
}
