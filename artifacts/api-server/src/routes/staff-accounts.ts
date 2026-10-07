import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { campusSettingsTable, usersTable } from "@workspace/db/schema";
import {
  adminBootstrapPasswordSettingKey,
  establishSession,
  getAuthSession,
  hashPassword,
  requireSameOrigin,
  requireSuperAdmin,
} from "../lib/auth";

const router: IRouter = Router();
const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

const hasRoleName = async (role: "admin" | "operator", name: string, excludeId?: number) => {
  const matches = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.role, role),
      eq(usersTable.active, true),
      sql`lower(trim(${usersTable.name})) = lower(${name})`,
      ...(excludeId ? [sql`${usersTable.id} <> ${excludeId}`] : []),
    ))
    .limit(1);
  return matches.length > 0;
};

router.get("/auth/staff-accounts", requireSuperAdmin, async (_req, res) => {
  const accounts = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
      active: usersTable.active,
    })
    .from(usersTable)
    .where(and(
      sql`${usersTable.role} in ('admin', 'operator')`,
      eq(usersTable.active, true),
    ));
  const configuredAdmin = process.env.ADMIN_USERNAME?.trim().toLocaleLowerCase("pt-BR");
  return res.json(accounts.map((account) => ({
    id: String(account.id),
    name: account.name,
    role: account.role,
    isSuperAdmin:
      account.role === "admin" &&
      process.env.ADMIN_SUPER_ADMIN !== "false" &&
      account.name.trim().toLocaleLowerCase("pt-BR") === configuredAdmin,
  })));
});

router.post("/auth/staff-accounts", requireSameOrigin, requireSuperAdmin, async (req, res) => {
  const { name: rawName, password, role } = req.body ?? {};
  if (
    typeof rawName !== "string" ||
    typeof password !== "string" ||
    !["admin", "operator"].includes(role)
  ) {
    return res.status(400).json({ error: "Nome, senha e perfil são obrigatórios." });
  }
  const name = normalizeName(rawName);
  if (name.length < 3 || name.length > 120) {
    return res.status(400).json({ error: "O nome deve ter entre 3 e 120 caracteres." });
  }
  if (password.length < 6 || password.length > 1024) {
    return res.status(400).json({ error: "A senha deve conter ao menos 6 caracteres." });
  }
  const accountRole = role as "admin" | "operator";
  if (await hasRoleName(accountRole, name)) {
    return res.status(409).json({ error: "Já existe uma conta com esse nome nesse perfil." });
  }

  try {
    const [account] = await db
      .insert(usersTable)
      .values({
        name,
        email: `staff-${randomUUID()}@local.invalid`,
        role: accountRole,
        passwordHash: hashPassword(password),
        active: true,
      })
      .returning({ id: usersTable.id, name: usersTable.name, role: usersTable.role });
    if (!account) {
      return res.status(500).json({ error: "O servidor não confirmou a criação da conta." });
    }
    return res.status(201).json({
      id: String(account.id),
      name: account.name,
      role: account.role,
      isSuperAdmin: false,
    });
  } catch (error) {
    console.error("Falha ao criar conta administrativa.", error);
    return res.status(500).json({ error: "Não foi possível criar a conta no servidor." });
  }
});

router.put("/auth/staff-accounts/:id", requireSameOrigin, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name: rawName, password } = req.body ?? {};
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Identificador da conta inválido." });
  }
  if (typeof rawName !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Nome e nova senha são obrigatórios." });
  }
  const name = normalizeName(rawName);
  if (name.length < 3 || name.length > 120 || password.length < 6 || password.length > 1024) {
    return res.status(400).json({ error: "Informe um nome válido e uma senha com ao menos 6 caracteres." });
  }
  const [current] = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, active: usersTable.active })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!current || !current.active || !["admin", "operator"].includes(current.role)) {
    return res.status(404).json({ error: "Conta administrativa não encontrada." });
  }
  const accountRole = current.role as "admin" | "operator";
  const configuredAdmin = process.env.ADMIN_USERNAME?.trim().toLocaleLowerCase("pt-BR");
  if (
    accountRole === "admin" &&
    process.env.ADMIN_SUPER_ADMIN !== "false" &&
    current.name.trim().toLocaleLowerCase("pt-BR") === configuredAdmin &&
    name.toLocaleLowerCase("pt-BR") !== configuredAdmin
  ) {
    return res.status(409).json({ error: "O nome da conta superadministradora não pode ser alterado por aqui." });
  }
  if (await hasRoleName(accountRole, name, id)) {
    return res.status(409).json({ error: "Já existe uma conta com esse nome nesse perfil." });
  }
  const updated = await db.transaction(async (tx) => {
    const [account] = await tx
      .update(usersTable)
      .set({ name, passwordHash: hashPassword(password) })
      .where(and(eq(usersTable.id, id), eq(usersTable.active, true)))
      .returning({ id: usersTable.id, name: usersTable.name, role: usersTable.role });
    if (accountRole === "admin" && account) {
      await tx.insert(campusSettingsTable)
        .values({ key: adminBootstrapPasswordSettingKey, value: "false" })
        .onConflictDoNothing({ target: campusSettingsTable.key });
      await tx.update(campusSettingsTable)
        .set({ value: "true", updatedAt: new Date() })
        .where(eq(campusSettingsTable.key, adminBootstrapPasswordSettingKey));
    }
    return account;
  });
  if (!updated) return res.status(404).json({ error: "Conta administrativa não encontrada." });

  const session = getAuthSession(req);
  if (session?.accountId === id) {
    establishSession(res, {
      role: session.role,
      name,
      accountId: id,
      isSuperAdmin: session.isSuperAdmin,
      mustChangePassword: false,
    });
  }
  return res.json({
    id: String(updated.id),
    name: updated.name,
    role: updated.role,
    isSuperAdmin: session?.accountId === id && session.isSuperAdmin,
  });
});

router.delete("/auth/staff-accounts/:id", requireSameOrigin, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Identificador da conta inválido." });
  }
  const session = getAuthSession(req);
  if (session?.accountId === id) {
    return res.status(409).json({ error: "Não é possível remover a conta que está em uso." });
  }
  const [target] = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, active: usersTable.active })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!target || !target.active || !["admin", "operator"].includes(target.role)) {
    return res.status(404).json({ error: "Conta administrativa não encontrada." });
  }
  const configuredAdmin = process.env.ADMIN_USERNAME?.trim().toLocaleLowerCase("pt-BR");
  if (
    target.role === "admin" &&
    process.env.ADMIN_SUPER_ADMIN !== "false" &&
    target.name.trim().toLocaleLowerCase("pt-BR") === configuredAdmin
  ) {
    return res.status(409).json({ error: "A conta superadministradora não pode ser removida." });
  }
  if (target.role === "admin") {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "admin"), eq(usersTable.active, true)));
    if (admins.length <= 1) {
      return res.status(409).json({ error: "Mantenha pelo menos uma conta administradora ativa." });
    }
  }
  const [disabled] = await db
    .update(usersTable)
    .set({ active: false })
    .where(and(eq(usersTable.id, id), eq(usersTable.active, true)))
    .returning({ id: usersTable.id });
  if (!disabled) return res.status(404).json({ error: "Conta administrativa não encontrada." });
  return res.status(204).end();
});

export default router;
