export type SavedHistoryEvent = {
  id: string;
  type: string;
  title: string;
  detail: string;
  date: string;
  time: string;
  tone: "neutral" | "good" | "warm" | "bad";
  person?: string;
  profile?: "Professor" | "Funcionário/Autorizado" | "TI";
  entityKeys?: string[];
};

const requireResponse = async (response: Response) => {
  if (response.ok) return response;
  const body = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error ?? `Falha ao carregar o histórico (${response.status}).`);
};

export async function loadSharedHistory(): Promise<SavedHistoryEvent[]> {
  const response = await requireResponse(await fetch("/api/history", {
    cache: "no-store",
    credentials: "same-origin",
  }));
  const events: unknown = await response.json();
  if (!Array.isArray(events)) {
    throw new Error("A resposta do histórico compartilhado está inválida.");
  }
  return events.map((event: unknown) => {
    if (
      typeof event !== "object" ||
      event === null ||
      Array.isArray(event)
    ) {
      throw new Error("Há um registro inválido no histórico compartilhado.");
    }
    const record = event as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.type !== "string" ||
      typeof record.title !== "string" ||
      typeof record.detail !== "string" ||
      typeof record.date !== "string" ||
      typeof record.time !== "string" ||
      (record.tone !== "neutral" &&
        record.tone !== "good" &&
        record.tone !== "warm" &&
        record.tone !== "bad")
    ) {
      throw new Error("Há um registro incompleto no histórico compartilhado.");
    }
    if (
      record.entityKeys !== undefined &&
      (!Array.isArray(record.entityKeys) ||
        !record.entityKeys.every((key) => typeof key === "string"))
    ) {
      throw new Error("Há referências inválidas no histórico compartilhado.");
    }
    const profile = record.profile === "Professor" ||
      record.profile === "Funcionário/Autorizado" ||
      record.profile === "TI"
      ? record.profile
      : undefined;
    return {
      id: record.id,
      type: record.type,
      title: record.title,
      detail: record.detail,
      date: record.date,
      time: record.time,
      tone: record.tone,
      ...(typeof record.person === "string" ? { person: record.person } : {}),
      ...(profile ? { profile } : {}),
      ...(Array.isArray(record.entityKeys)
        ? { entityKeys: record.entityKeys as string[] }
        : {}),
    };
  });
}

export async function clearSharedHistory(): Promise<void> {
  await requireResponse(await fetch("/api/history", {
    method: "DELETE",
    credentials: "same-origin",
  }));
}
