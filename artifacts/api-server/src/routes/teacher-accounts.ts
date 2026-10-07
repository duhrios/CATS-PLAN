import { and, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { campusSettingsTable, usersTable } from "@workspace/db/schema";
import { getRoomDirectory } from "../lib/room-directory";
import {
  establishSession,
  getAuthSession,
  hashPassword,
  requireSameOrigin,
  requireSession,
  requireSuperAdmin,
} from "../lib/auth";

const router: IRouter = Router();
const profileSettingKey = "teacher-profiles-v1";
const segments = ["Educação Infantil", "Fundamental 1", "Fundamental 2", "Ensino Médio"] as const;
type TeacherSegment = (typeof segments)[number];
type TeacherProfileMetadata = { segment: TeacherSegment; subject: string; className: string };
type TeacherProfileMetadataMap = Record<string, TeacherProfileMetadata>;

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");
const isTeacherSegment = (value: unknown): value is TeacherSegment =>
  typeof value === "string" && segments.includes(value as TeacherSegment);
const requiresSubject = (segment: TeacherSegment) =>
  segment === "Fundamental 2" || segment === "Ensino Médio";

const getTeacherProfiles = async (): Promise<TeacherProfileMetadataMap> => {
  const [setting] = await db
    .select({ value: campusSettingsTable.value })
    .from(campusSettingsTable)
    .where(eq(campusSettingsTable.key, profileSettingKey))
    .limit(1);
  if (!setting) return {};
  let value: unknown;
  try {
    value = JSON.parse(setting.value);
  } catch (error) {
    throw new Error("Os dados de perfil docente persistidos não são um JSON válido.", { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Os dados de perfil docente persistidos têm um formato inválido.");
  }
  const profiles: TeacherProfileMetadataMap = {};
  for (const [id, profile] of Object.entries(value)) {
    if (
      !/^\d+$/.test(id) ||
      !profile ||
      typeof profile !== "object" ||
      !isTeacherSegment(profile.segment) ||
      typeof profile.subject !== "string" ||
      (profile.className !== undefined && typeof profile.className !== "string")
    ) {
      throw new Error("Um dos perfis docentes persistidos tem um formato inválido.");
    }
    profiles[id] = {
      segment: profile.segment,
      subject: profile.subject,
      className: typeof profile.className === "string" ? profile.className : "",
    };
  }
  return profiles;
};

const saveTeacherProfiles = async (profiles: TeacherProfileMetadataMap) => {
  await db.insert(campusSettingsTable)
    .values({ key: profileSettingKey, value: JSON.stringify(profiles) })
    .onConflictDoUpdate({
      target: campusSettingsTable.key,
      set: { value: JSON.stringify(profiles), updatedAt: new Date() },
    });
};

const validateProfile = (value: unknown) => {
  const profile = value as Record<string, unknown> | null;
  if (!profile || !isTeacherSegment(profile.segment)) {
    return { error: "Selecione um segmento válido." } as const;
  }
  const subject = typeof profile.subject === "string" ? profile.subject.trim() : "";
  if (subject.length > 120 || (requiresSubject(profile.segment) && !subject)) {
    return { error: requiresSubject(profile.segment)
      ? "Informe a matéria para Fundamental 2 ou Ensino Médio."
      : "A matéria não pode exceder 120 caracteres." } as const;
  }
  const className = typeof profile.className === "string" ? profile.className.trim() : "";
  if (className.length > 120) {
    return { error: "A turma não pode exceder 120 caracteres." } as const;
  }
  return { profile: { segment: profile.segment, subject, className } } as const;
};

const getAuthenticatedTeacher = async (req: Parameters<typeof requireSession>[0]) => {
  const session = getAuthSession(req);
  if (session?.role !== "user" || !session.accountId) return null;
  const [account] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
  })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, session.accountId),
      eq(usersTable.role, "user"),
      eq(usersTable.active, true),
    ))
    .limit(1);
  return account ?? null;
};

router.get("/auth/teacher-profile", requireSession, async (req, res) => {
  const session = getAuthSession(req);
  if (session?.role !== "user" || !session.accountId) {
    return res.status(403).json({ error: "Apenas professores podem consultar este perfil." });
  }
  const account = await getAuthenticatedTeacher(req);
  if (!account) return res.status(404).json({ error: "Conta de professor não encontrada." });
  const profile = (await getTeacherProfiles())[String(account.id)] ?? {
    segment: "Fundamental 2" as const,
    subject: "",
    className: "",
  };
  return res.json({ ...profile, name: account.name, email: account.email });
});

router.put("/auth/teacher-profile", requireSameOrigin, requireSession, async (req, res) => {
  const session = getAuthSession(req);
  if (session?.role !== "user" || !session.accountId) {
    return res.status(403).json({ error: "Apenas professores podem atualizar este perfil." });
  }
  const account = await getAuthenticatedTeacher(req);
  if (!account) return res.status(404).json({ error: "Conta de professor não encontrada." });

  const name = typeof req.body?.name === "string" ? normalizeName(req.body.name) : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (name.length < 3 || name.length > 120) {
    return res.status(400).json({ error: "O nome deve ter entre 3 e 120 caracteres." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Informe um e-mail válido." });
  }
  const profileResult = validateProfile(req.body);
  if ("error" in profileResult) return res.status(400).json({ error: profileResult.error });
  const submittedProfile = profileResult.profile;
  if (
    (submittedProfile.segment === "Educação Infantil" || submittedProfile.segment === "Fundamental 1") &&
    !submittedProfile.className
  ) {
    return res.status(400).json({ error: "Selecione uma turma cadastrada pelo TI na sala." });
  }
  if (submittedProfile.segment === "Educação Infantil" || submittedProfile.segment === "Fundamental 1") {
    const { rooms } = await getRoomDirectory();
    const classRegisteredByTi = rooms.some((room) =>
      room.segment === submittedProfile.segment &&
      [...room.morningClasses, ...room.afternoonClasses].includes(submittedProfile.className),
    );
    if (!classRegisteredByTi) {
      return res.status(400).json({ error: "Selecione uma turma cadastrada pelo TI em uma sala do seu segmento." });
    }
  }
  const profile: TeacherProfileMetadata = {
    ...submittedProfile,
    className:
      submittedProfile.segment === "Educação Infantil" || submittedProfile.segment === "Fundamental 1"
        ? submittedProfile.className
        : "",
  };

  try {
    const otherTeachers = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
    })
      .from(usersTable)
      .where(and(eq(usersTable.role, "user"), eq(usersTable.active, true)));
    if (otherTeachers.some((teacher) =>
      teacher.id !== account.id && teacher.email.trim().toLowerCase() === email,
    )) {
      return res.status(409).json({ error: "Este e-mail já está associado a outra conta." });
    }

    const profiles = await getTeacherProfiles();
    profiles[String(account.id)] = profile;
    await db.transaction(async (tx) => {
      const [updatedAccount] = await tx.update(usersTable)
        .set({ name, email })
        .where(and(
          eq(usersTable.id, account.id),
          eq(usersTable.role, "user"),
          eq(usersTable.active, true),
        ))
        .returning({ id: usersTable.id });
      if (!updatedAccount) throw new Error("Conta de professor não encontrada.");

      await tx.insert(campusSettingsTable)
        .values({ key: profileSettingKey, value: JSON.stringify(profiles) })
        .onConflictDoUpdate({
          target: campusSettingsTable.key,
          set: { value: JSON.stringify(profiles), updatedAt: new Date() },
        });
    });

    const expiresAt = establishSession(res, {
      role: session.role,
      name,
      accountId: account.id,
      isSuperAdmin: session.isSuperAdmin,
      mustChangePassword: false,
    });
    return res.json({ ...profile, name, email, expiresAt });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return res.status(409).json({ error: "Este e-mail já está associado a outra conta." });
    }
    throw error;
  }
});

router.get("/auth/teacher-accounts", requireSuperAdmin, async (_req, res) => {
  try {
    const [accounts, profiles] = await Promise.all([
      db.select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        passwordHash: usersTable.passwordHash,
      })
        .from(usersTable)
        .where(and(eq(usersTable.role, "user"), eq(usersTable.active, true))),
      getTeacherProfiles(),
    ]);
    return res.json(accounts.map((account) => ({
      id: String(account.id),
      name: account.name,
      email: account.email,
      segment: profiles[String(account.id)]?.segment ?? "Fundamental 2",
      subject: profiles[String(account.id)]?.subject ?? "",
      mustSetPassword: !account.passwordHash,
    })));
  } catch (error) {
    console.error("Falha ao carregar contas de professores.", error);
    return res.status(500).json({ error: "Não foi possível carregar os professores no servidor." });
  }
});

router.post("/auth/teacher-accounts/check-first-access", requireSameOrigin, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const emailValid = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailValid) return res.status(400).json({ error: "Informe um e-mail válido." });

  const [teacher] = await db.select({ passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(and(
      eq(usersTable.role, "user"),
      eq(usersTable.active, true),
      sql`lower(${usersTable.email}) = ${email}`,
    ))
    .limit(1);
  if (!teacher) {
    return res.status(404).json({
      error: "Este e-mail não está cadastrado para acesso. Entre em contato com o TI para solicitar seu cadastro.",
    });
  }
  if (teacher.passwordHash) {
    return res.status(409).json({
      error: "Este e-mail já possui acesso. Entre com sua senha ou procure o TI/administrador para obter ajuda.",
    });
  }
  return res.json({ eligible: true });
});

router.post("/auth/teacher-accounts/complete-registration", requireSameOrigin, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const emailValid = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailValid) return res.status(400).json({ error: "Informe um e-mail válido." });
  if (password.length < 6 || password.length > 1024) {
    return res.status(400).json({ error: "A senha deve conter ao menos 6 caracteres." });
  }

  const [teacher] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    passwordHash: usersTable.passwordHash,
  })
    .from(usersTable)
    .where(and(
      eq(usersTable.role, "user"),
      eq(usersTable.active, true),
      sql`lower(${usersTable.email}) = ${email}`,
    ))
    .limit(1);
  if (!teacher) {
    return res.status(404).json({
      error: "Este e-mail não está cadastrado para acesso. Entre em contato com o TI para solicitar seu cadastro.",
    });
  }
  if (teacher.passwordHash) {
    return res.status(409).json({
      error: "Este e-mail já possui acesso. Entre com sua senha ou procure o TI/administrador para obter ajuda.",
    });
  }

  const [account] = await db.update(usersTable)
    .set({ passwordHash: hashPassword(password) })
    .where(and(
      eq(usersTable.id, teacher.id),
      eq(usersTable.active, true),
      sql`${usersTable.passwordHash} is null`,
    ))
    .returning({ id: usersTable.id, name: usersTable.name });
  if (!account) {
    return res.status(409).json({ error: "Este acesso já foi criado. Entre com sua senha." });
  }

  return res.status(201).json({ id: String(account.id), name: account.name });
});

router.post("/auth/teacher-accounts", requireSameOrigin, requireSuperAdmin, async (req, res) => {
  const entries: unknown[] = Array.isArray(req.body?.accounts) ? req.body.accounts : [req.body];
  if (entries.length === 0) {
    return res.status(400).json({ error: "Cadastre pelo menos um professor por vez." });
  }

  const validated: Array<{
    name: string;
    email: string;
    profile: TeacherProfileMetadata;
  }> = [];
  const seenEmails = new Set<string>();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      return res.status(400).json({ error: "Os dados de um dos professores são inválidos." });
    }
    const data = entry as Record<string, unknown>;
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const name = typeof data.name === "string" ? normalizeName(data.name) : "";
    const emailValid = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const profileResult = validateProfile(data);
    if (!emailValid) return res.status(400).json({ error: "Informe um e-mail válido para cada professor." });
    if (name.length < 3 || name.length > 120) {
      return res.status(400).json({ error: "O nome deve ter entre 3 e 120 caracteres." });
    }
    if ("error" in profileResult) return res.status(400).json({ error: profileResult.error });
    if (seenEmails.has(email)) return res.status(409).json({ error: `O e-mail ${email} aparece mais de uma vez.` });
    seenEmails.add(email);
    validated.push({ name, email, profile: profileResult.profile });
  }

  const existing = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    role: usersTable.role,
    active: usersTable.active,
  })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) in (${sql.join(
        validated.map(({ email }) => sql`${email}`),
        sql`, `,
      )})`);
  const duplicateEmails = existing.filter((account) =>
    account.active || account.role !== "user",
  );
  if (duplicateEmails.length > 0) {
    return res.status(409).json({
      error: `Já existe cadastro para: ${duplicateEmails.map(({ email }) => email).join(", ")}.`,
    });
  }

  try {
    const profiles = await getTeacherProfiles();
    const credentials = await db.transaction(async (tx) => {
      const created: Array<{ id: number; name: string; email: string }> = [];
      for (const item of validated) {
        const [inactiveAccount] = await tx.select({ id: usersTable.id })
          .from(usersTable)
          .where(and(
            eq(usersTable.role, "user"),
            eq(usersTable.active, false),
            sql`lower(${usersTable.email}) = ${item.email}`,
          ))
          .for("update")
          .limit(1);
        const [account] = inactiveAccount
          ? await tx.update(usersTable)
            .set({
              name: item.name,
              email: item.email,
              passwordHash: null,
              active: true,
            })
            .where(and(
              eq(usersTable.id, inactiveAccount.id),
              eq(usersTable.active, false),
            ))
            .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          : await tx.insert(usersTable)
            .values({
              name: item.name,
              email: item.email,
              role: "user",
              passwordHash: null,
              active: true,
            })
            .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });
        if (!account) throw new Error("O banco não confirmou o cadastro do professor.");
        profiles[String(account.id)] = item.profile;
        created.push(account);
      }
      await tx.insert(campusSettingsTable)
        .values({ key: profileSettingKey, value: JSON.stringify(profiles) })
        .onConflictDoUpdate({
          target: campusSettingsTable.key,
          set: { value: JSON.stringify(profiles), updatedAt: new Date() },
        });
      return created;
    });
    return res.status(201).json(credentials.map((account, index) => ({
      id: String(account.id),
      name: account.name,
      email: account.email,
      ...validated[index].profile,
      mustSetPassword: true,
    })));
  } catch (error) {
    console.error("Falha ao cadastrar professores.", error);
    return res.status(500).json({ error: "Não foi possível salvar os professores no servidor." });
  }
});

router.delete("/auth/teacher-accounts/:id", requireSameOrigin, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Identificador do professor inválido." });
  }
  const [disabled] = await db.update(usersTable)
    .set({ active: false })
    .where(and(
      eq(usersTable.id, id),
      eq(usersTable.role, "user"),
      eq(usersTable.active, true),
    ))
    .returning({ id: usersTable.id });
  if (!disabled) return res.status(404).json({ error: "Professor não encontrado." });
  const profiles = await getTeacherProfiles();
  delete profiles[String(id)];
  await saveTeacherProfiles(profiles);
  return res.status(204).end();
});

export default router;
