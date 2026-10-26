import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAuthenticatedRole,
  onAuthenticatedSessionChange,
  type AuthenticatedRole,
} from "@/lib/auth-session";

export type NotificationGroup = "ti" | "teachers";
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
export type NotificationId<G extends NotificationGroup = NotificationGroup> =
  (typeof notificationDefinitions)[G][number]["id"];
export type NotificationSettings = Record<
  NotificationGroup,
  Record<string, boolean>
>;

const defaults = {
  ti: {
    "reservation-created": true,
    "reservation-scheduled": true,
    "movement-request": true,
    "movement-audio": true,
    push: true,
  },
  teachers: { push: true },
} satisfies NotificationSettings;

type NotificationSettingsContextValue = {
  settings: NotificationSettings;
  loading: boolean;
  error: string;
  savingNotification: string | null;
  refresh: () => Promise<void>;
  updateNotification: (
    group: NotificationGroup,
    notification: string,
    enabled: boolean,
  ) => Promise<void>;
};

const NotificationSettingsContext =
  createContext<NotificationSettingsContextValue | null>(null);

const parseSettings = (value: unknown): NotificationSettings => {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).ti !== "object" ||
    typeof (value as Record<string, unknown>).teachers !== "object"
  ) {
    throw new Error("O servidor retornou configurações de notificações inválidas.");
  }
  const result = value as Record<string, unknown>;
  const parsed: NotificationSettings = { ti: {}, teachers: {} };
  for (const group of ["ti", "teachers"] as const) {
    if (!result[group] || typeof result[group] !== "object") {
      throw new Error("O servidor retornou configurações de notificações inválidas.");
    }
    const groupSettings = result[group] as Record<string, unknown>;
    for (const { id } of notificationDefinitions[group]) {
      if (typeof groupSettings[id] !== "boolean") {
        throw new Error("O servidor retornou configurações de notificações inválidas.");
      }
      parsed[group][id] = groupSettings[id] as boolean;
    }
  }
  return parsed;
};

const readResponse = async (response: Response) => {
  const result = await response.json().catch(() => null) as
    | (Partial<NotificationSettings> & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(result?.error ?? `Falha ao carregar notificações (${response.status}).`);
  }
  return parseSettings(result);
};

export function NotificationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(defaults);
  const [loading, setLoading] = useState(getAuthenticatedRole() !== null);
  const [error, setError] = useState("");
  const [savingNotification, setSavingNotification] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getAuthenticatedRole()) {
      setSettings(defaults);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/notifications/settings", {
        cache: "no-store",
        credentials: "same-origin",
      });
      setSettings(await readResponse(response));
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar as configurações de notificações.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const updateNotification = useCallback(async (
    group: NotificationGroup,
    notification: string,
    enabled: boolean,
  ) => {
    const savingKey = `${group}:${notification}`;
    setSavingNotification(savingKey);
    setError("");
    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, notification, enabled }),
      });
      setSettings(await readResponse(response));
    } catch (saveError) {
      const message = saveError instanceof Error
        ? saveError.message
        : "Não foi possível salvar as configurações de notificações.";
      throw new Error(message);
    } finally {
      setSavingNotification(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = onAuthenticatedSessionChange(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ settings, loading, error, savingNotification, refresh, updateNotification }),
    [settings, loading, error, savingNotification, refresh, updateNotification],
  );
  return (
    <NotificationSettingsContext.Provider value={value}>
      {children}
    </NotificationSettingsContext.Provider>
  );
}

export const useNotificationSettings = () => {
  const value = useContext(NotificationSettingsContext);
  if (!value) {
    throw new Error("useNotificationSettings deve ser usado dentro do provedor de notificações.");
  }
  return value;
};

export const notificationGroupForRole = (
  role: AuthenticatedRole | null,
): NotificationGroup | null => {
  if (role === "admin" || role === "operator") return "ti";
  if (role === "user") return "teachers";
  return null;
};

export const isNotificationEnabled = <
  G extends NotificationGroup,
>(
  settings: NotificationSettings,
  group: G,
  notification: NotificationId<G>,
) => settings[group][notification];
