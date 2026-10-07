import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { campusSettingsTable, usersTable } from "@workspace/db/schema";
import {
  adminBootstrapPasswordSettingKey,
  assertSessionConfiguration,
  authenticate,
  clearSession,
  establishSession,
  getAuthSession,
  hashPassword,
  requirePasswordSetupSession,
  requireSameOrigin,
  requireSession,
  verifyPassword,
  type AuthRole,
} from "../lib/auth";

const router: IRouter = Router();
const allowedRoles: AuthRole[] = ["admin", "operator", "user"];

router.get("/auth/session", (req, res) => {
  try {
    const session = getAuthSession(req);
    if (!session) return res.status(401).json({ error: "Sessão expirada." });
    return res.json({
      role: session.role,
      name: session.name,
      isSuperAdmin: session.isSuperAdmin,
      mustChangePassword: session.mustChangePassword,
      expiresAt: session.expiresAt,
    });
  } catch {
    return res.status(503).json({ error: "Autenticação não configurada no servidor." });
  }
});

router.post("/auth/login", requireSameOrigin, async (req, res) => {
  const { role, username, password } = req.body ?? {};
  if (
    !allowedRoles.includes(role) ||
    typeof username !== "string" ||
    username.trim().length < 1 ||
    username.length > 200 ||
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 1024
  ) {
    return res.status(400).json({ error: "Credenciais inválidas." });
  }

  try {
    assertSessionConfiguration();
    const identity = await authenticate(role, username, password);
    if (!identity) return res.status(401).json({ error: "Nome ou senha inválidos." });
    const expiresAt = establishSession(res, identity);
    return res.json({ ...identity, expiresAt });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SESSION_SECRET")) {
      return res.status(503).json({ error: "Autenticação não configurada no servidor." });
    }
    throw error;
  }
});

router.post("/auth/logout", requireSameOrigin, (_req, res) => {
  clearSession(res);
  return res.status(204).end();
});

router.put(
  "/auth/initial-password",
  requireSameOrigin,
  requirePasswordSetupSession,
  async (req, res) => {
    const session = getAuthSession(req);
    const { newPassword } = req.body ?? {};
    if (
      session?.role !== "admin" ||
      !session.mustChangePassword ||
      typeof newPassword !== "string" ||
      newPassword.length < 6 ||
      newPassword.length > 1024
    ) {
      return res.status(400).json({ error: "A nova senha deve conter ao menos 6 caracteres." });
    }
    if (
      process.env.ADMIN_PASSWORD_HASH &&
      verifyPassword(newPassword, process.env.ADMIN_PASSWORD_HASH)
    ) {
      return res.status(400).json({ error: "A nova senha deve ser diferente da senha temporária." });
    }

    const passwordHash = hashPassword(newPassword);
    const passwordSaved = await db.transaction(async (tx) => {
      await tx.insert(campusSettingsTable)
        .values({ key: adminBootstrapPasswordSettingKey, value: "false" })
        .onConflictDoNothing({ target: campusSettingsTable.key });
      const [bootstrapState] = await tx
        .select({ value: campusSettingsTable.value })
        .from(campusSettingsTable)
        .where(eq(campusSettingsTable.key, adminBootstrapPasswordSettingKey))
        .for("update")
        .limit(1);
      if (bootstrapState?.value === "true") return false;

      if (session.accountId) {
        const [updatedAccount] = await tx
          .update(usersTable)
          .set({ passwordHash })
          .where(and(
            eq(usersTable.id, session.accountId),
            eq(usersTable.role, "admin"),
            eq(usersTable.active, true),
          ))
          .returning({ id: usersTable.id });
        if (!updatedAccount) return false;
      } else {
        const [createdAccount] = await tx
          .insert(usersTable)
          .values({
            name: session.name,
            email: "admin-bootstrap@local.invalid",
            role: "admin",
            passwordHash,
            active: true,
          })
          .onConflictDoNothing({ target: usersTable.email })
          .returning({ id: usersTable.id });
        if (!createdAccount) return false;
      }

      await tx.update(campusSettingsTable)
        .set({ value: "true", updatedAt: new Date() })
        .where(eq(campusSettingsTable.key, adminBootstrapPasswordSettingKey));
      return true;
    });
    if (!passwordSaved) {
      return res.status(409).json({ error: "A senha inicial já foi definida. Entre novamente." });
    }

    const identity = {
      role: session.role,
      name: session.name,
      ...(session.accountId ? { accountId: session.accountId } : {}),
      isSuperAdmin: session.isSuperAdmin,
      mustChangePassword: false,
    };
    const expiresAt = establishSession(res, identity);
    return res.json({ ...identity, expiresAt });
  },
);

router.put("/auth/password", requireSameOrigin, requireSession, async (req, res) => {
  const session = getAuthSession(req);
  const { currentPassword, newPassword } = req.body ?? {};
  if (
    session?.role !== "user" ||
    !session.accountId ||
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    newPassword.length < 6 ||
    newPassword.length > 1024
  ) {
    return res.status(400).json({ error: "A nova senha deve conter entre 6 e 1024 caracteres." });
  }

  const [account] = await db
    .select({ passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, session.accountId),
      eq(usersTable.role, "user"),
      eq(usersTable.active, true),
    ))
    .limit(1);
  if (!account?.passwordHash || !verifyPassword(currentPassword, account.passwordHash)) {
    return res.status(401).json({ error: "A senha atual está incorreta." });
  }
  await db.update(usersTable)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(usersTable.id, session.accountId));
  return res.status(204).end();
});

export default router;
