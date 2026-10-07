import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response, RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { campusSettingsTable, usersTable } from "@workspace/db/schema";

export type AuthRole = "admin" | "operator" | "user";

export type AuthSession = {
  role: AuthRole;
  name: string;
  accountId?: number;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  expiresAt: number;
};

const cookieName = "cc_session";
const adminBootstrapUsedKey = "admin-bootstrap-password-used-v1";
const teacherSessionMs = 45 * 60 * 1000;
const staffSessionMs = 12 * 60 * 60 * 1000;

const sessionSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("SESSION_SECRET deve conter pelo menos 32 bytes aleatórios.");
  }
  return secret;
};

export const assertSessionConfiguration = () => {
  sessionSecret();
};

export const verifyPassword = (password: string, encodedHash: string) => {
  const [algorithm, salt, expectedHex] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !/^[\da-f]{32,}$/i.test(salt ?? "") ||
    !/^[\da-f]{128}$/i.test(expectedHex ?? "")
  ) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
};

export const hashPassword = (password: string) => {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
};

const encodeSession = (session: AuthSession) => {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
};

export const readAuthSession = (req: Request): AuthSession | null => {
  const token = req.cookies?.[cookieName];
  if (typeof token !== "string") return null;
  const [body, providedSignature, extra] = token.split(".");
  if (!body || !providedSignature || extra) return null;

  let expectedSignature: Buffer;
  let receivedSignature: Buffer;
  try {
    expectedSignature = createHmac("sha256", sessionSecret()).update(body).digest();
    receivedSignature = Buffer.from(providedSignature, "base64url");
  } catch {
    return null;
  }
  if (
    expectedSignature.length !== receivedSignature.length ||
    !timingSafeEqual(expectedSignature, receivedSignature)
  ) return null;

  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthSession;
    if (
      !["admin", "operator", "user"].includes(session.role) ||
      typeof session.name !== "string" ||
      !session.name ||
      typeof session.isSuperAdmin !== "boolean" ||
      typeof session.mustChangePassword !== "boolean" ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now()
    ) return null;
    return session;
  } catch {
    return null;
  }
};

export const requireSession: RequestHandler = (req, res, next) => {
  try {
    const session = readAuthSession(req);
    if (!session) return res.status(401).json({ error: "Autenticação necessária." });
    if (session.mustChangePassword) {
      return res.status(403).json({ error: "Altere sua senha inicial para continuar." });
    }
    return next();
  } catch {
    return res.status(503).json({ error: "Autenticação não configurada no servidor." });
  }
};

export const requirePasswordSetupSession: RequestHandler = (req, res, next) => {
  try {
    const session = readAuthSession(req);
    if (!session) return res.status(401).json({ error: "Autenticação necessária." });
    if (session.role !== "admin" || !session.mustChangePassword) {
      return res.status(403).json({ error: "A troca inicial de senha não está disponível." });
    }
    return next();
  } catch {
    return res.status(503).json({ error: "Autenticação não configurada no servidor." });
  }
};

export const requireStaff: RequestHandler = (req, res, next) => {
  let session: AuthSession | null;
  try {
    session = readAuthSession(req);
  } catch {
    return res.status(503).json({ error: "Autenticação não configurada no servidor." });
  }
  if (!session) return res.status(401).json({ error: "Autenticação necessária." });
  if (session.mustChangePassword) {
    return res.status(403).json({ error: "Altere sua senha inicial para continuar." });
  }
  if (session.role !== "admin" && session.role !== "operator") {
    return res.status(403).json({ error: "Ação restrita à equipe." });
  }
  return next();
};

export const requireSuperAdmin: RequestHandler = (req, res, next) => {
  let session: AuthSession | null;
  try {
    session = readAuthSession(req);
  } catch {
    return res.status(503).json({ error: "Autenticação não configurada no servidor." });
  }
  if (!session) return res.status(401).json({ error: "Autenticação necessária." });
  if (session.mustChangePassword) {
    return res.status(403).json({ error: "Altere sua senha inicial para continuar." });
  }
  if (session.role !== "admin" || !session.isSuperAdmin) {
    return res.status(403).json({ error: "Ação restrita ao superadministrador." });
  }
  return next();
};

export const getAuthSession = (req: Request) => readAuthSession(req);

export const establishSession = (res: Response, identity: Omit<AuthSession, "expiresAt">) => {
  const expiresAt = Date.now() + (identity.role === "user" ? teacherSessionMs : staffSessionMs);
  res.cookie(cookieName, encodeSession({ ...identity, expiresAt }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    maxAge: expiresAt - Date.now(),
  });
  return expiresAt;
};

export const clearSession = (res: Response) => {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
  });
};

export const authenticate = async (
  role: AuthRole,
  username: string,
  password: string,
): Promise<Omit<AuthSession, "expiresAt"> | null> => {
  const normalizedName = username.trim().toLocaleLowerCase("pt-BR");
  const envPrefix = role === "admin" ? "ADMIN" : role === "operator" ? "OPERATOR" : "";
  const configuredName = envPrefix ? process.env[`${envPrefix}_USERNAME`] : undefined;
  const configuredHash = envPrefix ? process.env[`${envPrefix}_PASSWORD_HASH`] : undefined;
  const accounts = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      passwordHash: usersTable.passwordHash,
      active: usersTable.active,
    })
    .from(usersTable)
    .where(and(eq(usersTable.role, role), eq(usersTable.active, true)));
  const matchingAccounts = accounts.filter((candidate) =>
    candidate.name.trim().toLocaleLowerCase("pt-BR") === normalizedName ||
    (role === "user" && candidate.email.trim().toLocaleLowerCase("pt-BR") === normalizedName),
  );
  if (matchingAccounts.length > 1) return null;
  const account = matchingAccounts[0];
  const isConfiguredAdmin = role === "admin" &&
    Boolean(configuredName) &&
    configuredName!.trim().toLocaleLowerCase("pt-BR") === normalizedName;
  const isAdminBootstrapPassword = isConfiguredAdmin &&
    Boolean(configuredHash) &&
    verifyPassword(password, configuredHash!);
  if (isAdminBootstrapPassword) {
    const [bootstrapState] = await db
      .select({ value: campusSettingsTable.value })
      .from(campusSettingsTable)
      .where(eq(campusSettingsTable.key, adminBootstrapUsedKey))
      .limit(1);
    if (bootstrapState?.value === "true") return null;
    return {
      role,
      name: account?.name ?? configuredName!.trim(),
      ...(account ? { accountId: account.id } : {}),
      isSuperAdmin: process.env.ADMIN_SUPER_ADMIN !== "false",
      mustChangePassword: true,
    };
  }
  if (account?.passwordHash) {
    if (!verifyPassword(password, account.passwordHash)) return null;
    return {
      role,
      name: account.name,
      accountId: account.id,
      isSuperAdmin:
        role === "admin" &&
        process.env.ADMIN_SUPER_ADMIN !== "false" &&
        Boolean(configuredName) &&
        configuredName!.trim().toLocaleLowerCase("pt-BR") === normalizedName,
      mustChangePassword: false,
    };
  }

  if (
    !configuredName ||
    !configuredHash ||
    configuredName.trim().toLocaleLowerCase("pt-BR") !== normalizedName ||
    !verifyPassword(password, configuredHash)
  ) return null;

  return {
    role,
    name: account?.name ?? configuredName.trim(),
    ...(account ? { accountId: account.id } : {}),
    isSuperAdmin: role === "admin" && process.env.ADMIN_SUPER_ADMIN !== "false",
    mustChangePassword: role === "admin",
  };
};

export const adminBootstrapPasswordSettingKey = adminBootstrapUsedKey;

export const isAllowedOrigin = (origin: string | undefined) => {
  if (!origin) return false;
  const allowedOrigins = [
    process.env.APP_BASE_URL,
    ...(process.env.CORS_ORIGINS ?? "").split(","),
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:4173", "http://localhost:5173"]
      : []),
  ].filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value.trim()).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  try {
    return allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
};

export const requireSameOrigin: RequestHandler = (req, res, next) => {
  if (!isAllowedOrigin(req.get("origin"))) {
    return res.status(403).json({ error: "Origem da solicitação não autorizada." });
  }
  return next();
};
