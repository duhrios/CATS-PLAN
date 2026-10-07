export type AuthenticatedRole = "admin" | "operator" | "user";

export type AuthSession = {
  role: AuthenticatedRole;
  name: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  expiresAt: number;
};

const rememberedOperatorNameKey = "controle-carrinhos-remembered-operator-name";
const sessionChangedEvent = "controle-carrinhos-session-changed";
let verifiedSession: AuthSession | null = null;

const setVerifiedSession = (session: AuthSession | null) => {
  verifiedSession = session;
  window.dispatchEvent(new Event(sessionChangedEvent));
};

export const getAuthenticatedRole = () => verifiedSession?.role ?? null;
export const getAuthenticatedSession = () => verifiedSession;

export const refreshAuthenticatedSession = async () => {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) {
    setVerifiedSession(null);
    return null;
  }
  if (!response.ok) {
    throw new Error(`Não foi possível validar a sessão (${response.status}).`);
  }
  const session = await response.json() as AuthSession;
  if (
    !["admin", "operator", "user"].includes(session.role) ||
    typeof session.name !== "string" ||
    typeof session.isSuperAdmin !== "boolean" ||
    typeof session.mustChangePassword !== "boolean" ||
    !Number.isFinite(session.expiresAt) ||
    session.expiresAt <= Date.now()
  ) {
    setVerifiedSession(null);
    throw new Error("O servidor retornou uma sessão inválida.");
  }
  setVerifiedSession(session);
  return session;
};

export const loginWithCredentials = async (
  role: AuthenticatedRole,
  username: string,
  password: string,
) => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, username, password }),
  });
  const result = await response.json().catch(() => null) as
    | (AuthSession & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(result?.error ?? `Falha no login (${response.status}).`);
  }
  if (
    !result ||
    result.role !== role ||
    typeof result.name !== "string" ||
    typeof result.isSuperAdmin !== "boolean" ||
    typeof result.mustChangePassword !== "boolean" ||
    !Number.isFinite(result.expiresAt)
  ) {
    throw new Error("O servidor retornou uma resposta de autenticação inválida.");
  }
  setVerifiedSession(result);
  return result;
};

export const changeTeacherPassword = async (
  currentPassword: string,
  newPassword: string,
) => {
  const response = await fetch("/api/auth/password", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (response.ok) return;
  const result = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(result?.error ?? `Falha ao alterar a senha (${response.status}).`);
};

export const changeInitialAdminPassword = async (newPassword: string) => {
  const response = await fetch("/api/auth/initial-password", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
  const result = await response.json().catch(() => null) as
    | (AuthSession & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(result?.error ?? `Falha ao definir a senha (${response.status}).`);
  }
  if (
    !result ||
    result.role !== "admin" ||
    result.mustChangePassword ||
    typeof result.name !== "string" ||
    typeof result.isSuperAdmin !== "boolean" ||
    !Number.isFinite(result.expiresAt) ||
    result.expiresAt <= Date.now()
  ) {
    throw new Error("O servidor não confirmou a troca da senha administrativa.");
  }
  setVerifiedSession(result);
  return result;
};

export const endAuthSession = async () => {
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!response.ok && response.status !== 401) {
      throw new Error(`Não foi possível encerrar a sessão (${response.status}).`);
    }
  } finally {
    setVerifiedSession(null);
    window.localStorage.removeItem("controle-carrinhos-role");
    window.localStorage.removeItem("controle-carrinhos-auth-session");
    window.localStorage.removeItem("controle-carrinhos-super-admin");
    window.localStorage.removeItem("controle-carrinhos-admin-name");
    window.localStorage.removeItem("controle-carrinhos-operator-name");
  }
};

export const rememberOperatorName = (name: string, remember: boolean) => {
  if (remember) window.localStorage.setItem(rememberedOperatorNameKey, name);
  else window.localStorage.removeItem(rememberedOperatorNameKey);
};

export const getRememberedOperatorName = () =>
  window.localStorage.getItem(rememberedOperatorNameKey) ?? "";

export const onAuthenticatedSessionChange = (listener: () => void) => {
  window.addEventListener(sessionChangedEvent, listener);
  return () => window.removeEventListener(sessionChangedEvent, listener);
};
