import { Check, FileSpreadsheet, FileText, KeyRound, Loader2, Mail, Plus, Upload, UserRound, ShieldCheck, Pencil, X, AlertCircle } from "lucide-react";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button, Field, Modal, PageHeader, SectionCard, StatusPill, cx, inputClass } from "@/components/app-ui";
import { parseTeacherEmailsFile } from "@/lib/teacher-import";
import {
  changeTeacherPassword,
  getAuthenticatedSession,
  loginWithCredentials,
} from "@/lib/auth-session";
import {
  createStaffAccount,
  deleteStaffAccount,
  loadStaffAccounts,
  updateStaffAccount,
  type StaffAccount,
} from "@/lib/staff-accounts";
import {
  checkTeacherFirstAccess,
  createTeacherAccounts,
  completeTeacherRegistration,
  deleteTeacherAccount,
  loadTeacherAccounts,
  sortTeacherAccounts,
  type NewTeacherAccount,
  type TeacherAccessAccount,
} from "@/lib/teacher-accounts";
import { loadTeacherProfile, saveTeacherProfile } from "@/lib/teacher-profile";
import { useRoomDirectory } from "@/lib/room-directory";
import {
  segments,
  useCampusData,
  type Segment,
} from "@/lib/campus-data";

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const displayNameFromEmail = (email: string) => email
  .split("@")[0]
  .split(/[._-]/)
  .filter(Boolean)
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join(" ");
const emailsFromText = (value: string) => [...new Set(value.match(emailPattern)?.map((email) => email.toLowerCase()) ?? [])];

export function TeacherProfilePage({ admin = false }: { admin?: boolean }) {
  const canManageStaff = admin && getAuthenticatedSession()?.isSuperAdmin === true;
  const {
    teacher,
    updateTeacher,
  } = useCampusData();
  const { classEntries, roomCatalogLoading } = useRoomDirectory();
  const [teacherAccounts, setTeacherAccounts] = useState<TeacherAccessAccount[]>([]);
  const [teacherAccountsLoading, setTeacherAccountsLoading] = useState(canManageStaff);
  const [teacherAccountsError, setTeacherAccountsError] = useState("");
  const [teacherActionError, setTeacherActionError] = useState("");
  const [teacherActionBusy, setTeacherActionBusy] = useState<string | null>(null);
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [staffAccountsLoading, setStaffAccountsLoading] = useState(canManageStaff);
  const [staffAccountsError, setStaffAccountsError] = useState("");
  const [staffActionError, setStaffActionError] = useState("");
  const operatorAccounts = staffAccounts
    .filter((account) => account.role === "operator" || !account.isSuperAdmin)
    .map((account) => ({ ...account, isAdmin: account.role === "admin" }));
  const adminAccounts = staffAccounts.filter((account) => account.role === "admin");
  const [form, setForm] = useState({ ...teacher });
  const [profileLoading, setProfileLoading] = useState(!admin);
  const [profileError, setProfileError] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saved, setSaved] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [error, setError] = useState("");
  const [singleForm, setSingleForm] = useState({ name: "", email: "", segment: "Fundamental 2" as Segment, subject: "" });
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [importingFile, setImportingFile] = useState(false);
  const [savingAccounts, setSavingAccounts] = useState(false);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [operatorForm, setOperatorForm] = useState({ name: "", password: "", isAdmin: false });
  const [operatorModalOpen, setOperatorModalOpen] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState("");
  const [operatorError, setOperatorError] = useState("");
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [editingOperatorId, setEditingOperatorId] = useState<string | null>(null);
  const [editingOperatorForm, setEditingOperatorForm] = useState({ name: "", password: "" });
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editingAdminForm, setEditingAdminForm] = useState({ name: "", password: "" });
  const showSubject = form.segment === "Fundamental 2" || form.segment === "Ensino Médio";
  const showClass = form.segment === "Educação Infantil" || form.segment === "Fundamental 1";
  const classOptions = [...new Set(classEntries
    .filter((entry) => entry.segment === form.segment && entry.className.trim().toLocaleLowerCase("pt-BR") !== "contraturno")
    .map((entry) => entry.className))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const refreshStaffAccounts = useCallback(async () => {
    const accounts = await loadStaffAccounts();
    setStaffAccounts(accounts);
  }, []);
  const refreshTeacherAccounts = useCallback(async () => {
    const accounts = await loadTeacherAccounts();
    setTeacherAccounts(sortTeacherAccounts(accounts));
  }, []);
  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError("");
    try {
      const profile = await loadTeacherProfile();
      setForm(profile);
      updateTeacher(profile);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Não foi possível carregar seu cadastro.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin) void refreshProfile();
  }, [admin, refreshProfile]);

  useEffect(() => {
    if (!canManageStaff) return;
    let active = true;
    setTeacherAccountsLoading(true);
    setTeacherAccountsError("");
    void loadTeacherAccounts()
      .then((accounts) => {
        if (active) setTeacherAccounts(sortTeacherAccounts(accounts));
      })
      .catch((cause: unknown) => {
        if (active) setTeacherAccountsError(cause instanceof Error ? cause.message : "Não foi possível carregar os professores.");
      })
      .finally(() => {
        if (active) setTeacherAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManageStaff]);

  useEffect(() => {
    if (!canManageStaff) return;
    let active = true;
    setStaffAccountsLoading(true);
    setStaffAccountsError("");
    void loadStaffAccounts()
      .then((accounts) => {
        if (active) setStaffAccounts(accounts);
      })
      .catch((cause: unknown) => {
        if (active) setStaffAccountsError(cause instanceof Error ? cause.message : "Não foi possível carregar as contas.");
      })
      .finally(() => {
        if (active) setStaffAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManageStaff]);

  const toggleTeacherSelection = (id: string) => {
    setSelectedTeacherIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const toggleOperatorSelection = (id: string) => {
    setSelectedOperatorIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const deleteSelectedTeachers = async () => {
    setTeacherActionError("");
    setTeacherActionBusy("bulk-delete");
    const results = await Promise.allSettled(selectedTeacherIds.map((id) => deleteTeacherAccount(id)));
    const failed = results.filter((result) => result.status === "rejected");
    setSelectedTeacherIds([]);
    if (failed.length > 0) {
      const firstError = failed[0].status === "rejected" ? failed[0].reason : null;
      setTeacherActionError(firstError instanceof Error ? firstError.message : "Alguns professores não puderam ser excluídos.");
    }
    try {
      await refreshTeacherAccounts();
    } catch (cause) {
      setTeacherAccountsError(cause instanceof Error ? cause.message : "Não foi possível atualizar a lista de professores.");
    } finally {
      setTeacherActionBusy(null);
    }
  };

  const deleteSelectedOperators = async () => {
    setStaffActionError("");
    try {
      await Promise.all(selectedOperatorIds.map((id) => deleteStaffAccount(id)));
      setSelectedOperatorIds([]);
      await refreshStaffAccounts();
    } catch (cause) {
      setStaffActionError(cause instanceof Error ? cause.message : "Não foi possível excluir as contas selecionadas.");
      await refreshStaffAccounts().catch(() => undefined);
    }
  };

  const openAccountModal = (nextMode: "single" | "bulk") => {
    setMode(nextMode);
    setError("");
    setBulkFileName("");
    setModalOpen(true);
  };

  const handleBulkFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setImportingFile(true);
    try {
      const importedEmails = await parseTeacherEmailsFile(file);
      const mergedEmails = [...new Set([...emailsFromText(bulkEmails), ...importedEmails])];
      setBulkEmails(mergedEmails.join("\n"));
      setBulkFileName(`${file.name} · ${importedEmails.length} e-mail${importedEmails.length === 1 ? "" : "s"} encontrado${importedEmails.length === 1 ? "" : "s"}`);
    } catch (cause) {
      setBulkFileName("");
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o arquivo.");
    } finally {
      setImportingFile(false);
    }
  };

  const saveAccounts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSavingAccounts(true);
    try {
      const entries: NewTeacherAccount[] = mode === "single"
        ? [{
            name: singleForm.name.trim() || displayNameFromEmail(singleForm.email),
            email: singleForm.email.trim(),
            segment: singleForm.segment,
            subject: singleForm.subject.trim(),
          }]
        : emailsFromText(bulkEmails).map((email) => ({
            name: displayNameFromEmail(email),
            email,
            segment: "Fundamental 1",
            subject: "",
          }));
      if (entries.length === 0) {
        setError("Informe pelo menos um e-mail válido.");
        return;
      }
      await createTeacherAccounts(entries);
      setSelectedTeacherIds([]);
      setSingleForm({ name: "", email: "", segment: "Fundamental 2", subject: "" });
      setBulkEmails("");
      setBulkFileName("");
      setModalOpen(false);
      setTeacherActionError("");
      try {
        await refreshTeacherAccounts();
        setTeacherAccountsError("");
      } catch (cause) {
        setTeacherAccountsError(cause instanceof Error ? cause.message : "Os acessos foram criados, mas a lista não pôde ser atualizada.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar os professores.");
    } finally {
      setSavingAccounts(false);
    }
  };

  const removeTeacherAccount = async (id: string) => {
    setTeacherActionError("");
    setTeacherActionBusy(id);
    try {
      await deleteTeacherAccount(id);
      setSelectedTeacherIds((current) => current.filter((item) => item !== id));
    } catch (cause) {
      setTeacherActionError(cause instanceof Error ? cause.message : "Não foi possível excluir o professor.");
      setTeacherActionBusy(null);
      return;
    }
    try {
      await refreshTeacherAccounts();
      setTeacherAccountsError("");
    } catch (cause) {
      setTeacherAccountsError(cause instanceof Error ? cause.message : "A conta foi excluída, mas a lista não pôde ser atualizada.");
    } finally {
      setTeacherActionBusy(null);
    }
  };

  const saveOperator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOperatorMessage("");
    setOperatorError("");
    try {
      await createStaffAccount(operatorForm.name.trim(), operatorForm.password, operatorForm.isAdmin ? "admin" : "operator");
      await refreshStaffAccounts();
      setOperatorForm({ name: "", password: "", isAdmin: false });
      setOperatorModalOpen(false);
      setOperatorMessage(operatorForm.isAdmin ? "Administrador criado com sucesso." : "Usuário TI criado com sucesso.");
    } catch (cause) {
      setOperatorError(cause instanceof Error ? cause.message : "Não foi possível criar a conta.");
    }
  };
  const openAdminEditor = (account: StaffAccount) => {
    setEditingAdminId(account.id);
    setEditingAdminForm({ name: account.name, password: "" });
  };
  const saveAdminEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAdminId || !editingAdminForm.name.trim() || editingAdminForm.password.length < 6) return;
    try {
      await updateStaffAccount(editingAdminId, editingAdminForm.name.trim(), editingAdminForm.password);
      await refreshStaffAccounts();
      setEditingAdminId(null);
      setEditingAdminForm({ name: "", password: "" });
      setStaffActionError("");
    } catch (cause) {
      setStaffActionError(cause instanceof Error ? cause.message : "Não foi possível atualizar a conta.");
    }
  };
  const openOperatorEditor = (account: (typeof operatorAccounts)[number]) => {
    setEditingOperatorId(account.id);
    setEditingOperatorForm({ name: account.name, password: "" });
  };
  const saveOperatorEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = operatorAccounts.find((item) => item.id === editingOperatorId);
    if (!account || editingOperatorForm.name.trim().length < 3 || editingOperatorForm.password.length < 6) return;
    try {
      await updateStaffAccount(account.id, editingOperatorForm.name.trim(), editingOperatorForm.password);
      await refreshStaffAccounts();
      setEditingOperatorId(null);
      setEditingOperatorForm({ name: "", password: "" });
      setStaffActionError("");
    } catch (cause) {
      setStaffActionError(cause instanceof Error ? cause.message : "Não foi possível atualizar a conta.");
    }
  };

  const deleteStaffAccountFromPage = async (id: string) => {
    setStaffActionError("");
    try {
      await deleteStaffAccount(id);
      await refreshStaffAccounts();
    } catch (cause) {
      setStaffActionError(cause instanceof Error ? cause.message : "Não foi possível excluir a conta.");
    }
  };

  if (admin && !canManageStaff) {
    return (
      <div className="animate-rise space-y-7">
        <PageHeader eyebrow="Administração · Usuários" title="Professores" description="O gerenciamento de contas de professores está disponível apenas para o superadministrador." />
        <SectionCard title="Acesso restrito" eyebrow="Permissão necessária">
          <p className="p-5 text-sm text-[hsl(var(--muted-foreground))]">Entre com a conta superadministradora para cadastrar, redefinir ou remover acessos.</p>
        </SectionCard>
      </div>
    );
  }

  if (!admin) {
    const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const hasPasswordChange = Object.values(passwordForm).some((value) => value.trim().length > 0);
      if (hasPasswordChange) {
        if (!passwordForm.currentPassword.trim()) {
          setPasswordMessage("Informe a senha atual para alterar a senha.");
          return;
        }
        if (passwordForm.newPassword.length < 6) {
          setPasswordMessage("A nova senha deve ter pelo menos 6 caracteres.");
          return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          setPasswordMessage("A confirmação da nova senha não confere.");
          return;
        }
        try {
          await changeTeacherPassword(passwordForm.currentPassword, passwordForm.newPassword);
        } catch (error) {
          setPasswordMessage(error instanceof Error ? error.message : "Não foi possível alterar a senha.");
          return;
        }
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setPasswordMessage("Senha atualizada com sucesso.");
      }
      setProfileError("");
      try {
        const savedProfile = await saveTeacherProfile(form);
        setForm(savedProfile);
        updateTeacher(savedProfile);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2200);
      } catch (cause) {
        setProfileError(cause instanceof Error ? cause.message : "Não foi possível salvar seu cadastro.");
      }
    };

    return (
      <div className="animate-rise space-y-7">
        <PageHeader eyebrow="Área do professor · Perfil" title="Meu perfil" description="Mantenha seu e-mail e segmento atualizados. Eles são usados para liberar o acesso e filtrar as salas disponíveis nas reservas." />
        <SectionCard title="Dados do professor" eyebrow="Cadastro pessoal">
          {profileLoading ? <p className="p-5 text-sm text-[hsl(var(--muted-foreground))]" role="status">Carregando seus dados...</p> : profileError && !form.name ? <div className="space-y-3 p-5"><p className="text-sm text-[hsl(var(--destructive))]" role="alert">{profileError}</p><Button type="button" variant="secondary" onClick={() => void refreshProfile()}>Tentar novamente</Button></div> : <>
          <form className="max-w-xl space-y-5 p-5 sm:p-6" autoComplete="on" onSubmit={handleProfileSubmit} data-testid="form-teacher-profile">
            <div className="flex items-center gap-3 rounded-xl bg-[hsl(var(--muted)/.45)] p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><UserRound size={19} /></span><div><p className="text-sm font-semibold">Perfil usado nas reservas</p><p className="text-xs text-[hsl(var(--muted-foreground))]">O nome abaixo será preenchido automaticamente.</p></div></div>
            <Field label="Nome do professor"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Ex.: Marina Lopes" data-testid="input-teacher-name" /></Field>
            <Field label="E-mail de acesso" hint="Use o mesmo e-mail cadastrado pela coordenação."><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} placeholder="professor@escola.com.br" data-testid="input-teacher-email" /></Field>
            <Field label="Segmento"><select value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value as Segment, subject: "", className: "" })} className={inputClass} data-testid="select-teacher-segment">{segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select></Field>
            {showSubject ? <Field label="Matéria" hint="Obrigatória para Fundamental 2 e Ensino Médio."><input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} className={inputClass} placeholder="Ex.: Ciências" data-testid="input-teacher-subject" /></Field> : <p className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Para Educação Infantil e Fundamental 1, selecione uma turma cadastrada pelo TI na sala correspondente.</p>}
            {showClass && <Field label="Turma" hint={classOptions.length ? "Selecione uma turma já vinculada a uma sala pelo TI." : "O TI precisa cadastrar uma sala e vincular as turmas antes de você continuar."}><select required value={form.className ?? ""} onChange={(event) => setForm({ ...form, className: event.target.value })} className={inputClass} data-testid="select-teacher-class" disabled={roomCatalogLoading || classOptions.length === 0}><option value="">{roomCatalogLoading ? "Carregando turmas..." : classOptions.length ? "Selecione sua turma" : "Nenhuma turma cadastrada"}</option>{classOptions.map((className) => <option key={className} value={className}>{className}</option>)}</select></Field>}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.2)] p-4">
              <p className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">Alterar senha</p>
              <div className="space-y-3">
                <input type="hidden" name="username" autoComplete="username" value={getAuthenticatedSession()?.name ?? ""} readOnly />
                <Field label="Senha atual"><input name="current-password" autoComplete="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} className={inputClass} placeholder="Digite sua senha atual" /></Field>
                <Field label="Nova senha"><input name="new-password" autoComplete="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} className={inputClass} minLength={6} placeholder="Pelo menos 6 caracteres" /></Field>
                <Field label="Confirmar nova senha"><input name="confirm-password" autoComplete="new-password" type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} className={inputClass} placeholder="Repita a nova senha" /></Field>
              </div>
            </div>
            {passwordMessage && <p className="rounded-lg bg-[hsl(var(--muted)/.5)] p-3 text-xs font-semibold text-[hsl(var(--muted-foreground))]">{passwordMessage}</p>}
            {profileError && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{profileError}</p>}
            <div className="flex justify-end border-t border-[hsl(var(--border))] pt-4"><Button type="submit" data-testid="button-save-teacher-profile"><Check size={15} /> {saved ? "Cadastro salvo" : "Salvar cadastro"}</Button></div>
          </form>
          </>}
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Administração · Usuários"
        title="Professores"
        description="Cadastre os e-mails dos professores. No primeiro acesso, cada pessoa informa o e-mail cadastrado e define a própria senha."
        action={<div className="flex flex-wrap gap-2"><Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold"><KeyRound size={15} /> Tela de acesso</Link><Button onClick={() => openAccountModal("single")} data-testid="button-new-teacher"><Plus size={16} /> Cadastrar professor</Button></div>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Professores cadastrados</p><p className="mt-4 font-display text-3xl font-semibold tracking-[-.04em]">{teacherAccounts.length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">E-mails autorizados</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Primeiro acesso</p><p className="mt-4 font-display text-3xl font-semibold tracking-[-.04em]">{teacherAccounts.filter((account) => account.mustSetPassword).length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Professores ainda precisam definir a senha</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Cadastro em massa</p><p className="mt-4 font-display text-2xl font-semibold tracking-[-.04em] text-[hsl(var(--foreground))]">Planilha ou PDF</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">E-mails importados automaticamente</p></div>
      </div>
      <SectionCard title="Contas de acesso" eyebrow="Professores autorizados" action={<Button size="sm" variant="secondary" onClick={() => openAccountModal("bulk")} data-testid="button-bulk-teachers"><Mail size={14} /> Importar e-mails em lote</Button>}>
        <div className="space-y-3 p-5 sm:p-6">
          {teacherAccountsLoading && <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">Carregando professores...</p>}
          {(teacherAccountsError || teacherActionError) && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-sm text-[hsl(var(--destructive))]" role="alert">{teacherAccountsError || teacherActionError}</p>}
          {selectedTeacherIds.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" disabled={teacherActionBusy !== null} onClick={deleteSelectedTeachers} className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]">
                Excluir selecionados ({selectedTeacherIds.length})
              </Button>
            </div>
          )}
          <div className="overflow-x-auto"><table className="data-table w-full min-w-[720px] text-left"><thead><tr className="border-b border-[hsl(var(--border))]"><th className="px-3 py-3"><input type="checkbox" checked={teacherAccounts.length > 0 && teacherAccounts.every((account) => selectedTeacherIds.includes(account.id))} onChange={(event) => setSelectedTeacherIds(event.target.checked ? teacherAccounts.map((account) => account.id) : [])} className="h-4 w-4 accent-[hsl(var(--primary))]" aria-label="Selecionar todos os professores" /></th><th className="px-6 py-3">Nome</th><th className="px-3 py-3">E-mail de acesso</th><th className="px-3 py-3">Segmento</th><th className="px-3 py-3">Situação</th><th className="px-6 py-3 text-right">Ação</th></tr></thead><tbody>{teacherAccounts.map((account) => <tr key={account.id} data-testid={`row-teacher-${account.id}`}><td className="px-3 py-4"><input type="checkbox" checked={selectedTeacherIds.includes(account.id)} onChange={() => toggleTeacherSelection(account.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" aria-label={`Selecionar professor ${account.name}`} /></td><td className="px-6 py-4 text-sm font-semibold">{account.name}</td><td className="px-3 py-4 text-sm">{account.email}</td><td className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">{account.segment}</td><td className="px-3 py-4"><StatusPill status={account.mustSetPassword ? "Definir senha" : "Acesso ativo"} /></td><td className="px-6 py-4 text-right"><Button size="sm" variant="ghost" disabled={teacherActionBusy !== null} onClick={() => void removeTeacherAccount(account.id)} className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]">Excluir</Button></td></tr>)}</tbody></table></div>
          {!teacherAccountsLoading && !teacherAccountsError && teacherAccounts.length === 0 && <p className="py-5 text-center text-sm text-[hsl(var(--muted-foreground))]">Nenhum professor cadastrado.</p>}
        </div>
      </SectionCard>
      {canManageStaff && <SectionCard title="Usuários TI" eyebrow="Criar acessos para movimentação" action={<Button size="sm" onClick={() => { setOperatorError(""); setOperatorModalOpen(true); }}><Plus size={15} /> Criar usuário TI</Button>}>
        <div className="p-5 sm:p-6">
          {staffAccountsLoading && <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]" role="status">Carregando contas da equipe...</p>}
          {(staffAccountsError || staffActionError) && <p className="mb-3 rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-sm text-[hsl(var(--destructive))]" role="alert">{staffAccountsError || staffActionError}</p>}
          {operatorMessage && <p className="mb-3 rounded-lg bg-[hsl(var(--primary)/.1)] px-3 py-2 text-sm text-[hsl(var(--primary))]" role="status">{operatorMessage}</p>}
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.25)]">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
              <div><p className="text-sm font-semibold">TI cadastrado</p><p className="text-xs text-[hsl(var(--muted-foreground))]">Acesso pela tela do TI.</p></div>
              <span className="rounded-full bg-[hsl(var(--primary)/.1)] px-2.5 py-1 text-xs font-bold text-[hsl(var(--primary))]">{operatorAccounts.length}</span>
            </div>
            {selectedOperatorIds.length > 0 && (
              <div className="border-b border-[hsl(var(--border))] px-4 py-3">
                <Button size="sm" variant="ghost" onClick={deleteSelectedOperators} className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]">
                  Excluir selecionados ({selectedOperatorIds.length})
                </Button>
              </div>
            )}
            <div className="divide-y divide-[hsl(var(--border))]">
              {operatorAccounts.map((account) => <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={selectedOperatorIds.includes(account.id)} onChange={() => toggleOperatorSelection(account.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" aria-label={`Selecionar TI ${account.name}`} /><div className="min-w-0"><p className="break-words text-sm font-semibold">{account.name}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{account.isAdmin ? "Administrador · TI" : "Usuário TI"}</p></div></div><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={() => openOperatorEditor(account)}><Pencil size={14} /> Editar</Button><Link href="/operador/login" className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">Tela de acesso</Link><Button size="sm" variant="ghost" onClick={() => deleteStaffAccountFromPage(account.id)} className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]">Excluir</Button></div></div>)}
              {!staffAccountsLoading && !staffAccountsError && operatorAccounts.length === 0 && <p className="px-4 py-5 text-sm text-[hsl(var(--muted-foreground))]">Nenhum usuário TI cadastrado.</p>}
            </div>
          </div>
        </div>
      </SectionCard>}
      {editingOperatorId && <Modal title="Editar usuário TI" onClose={() => setEditingOperatorId(null)}><form className="space-y-4 p-5 sm:p-6" onSubmit={saveOperatorEdit}><Field label="Nome do usuário TI"><input required minLength={3} value={editingOperatorForm.name} onChange={(event) => setEditingOperatorForm({ ...editingOperatorForm, name: event.target.value })} className={inputClass} /></Field><Field label="Nova senha" hint="Use pelo menos 6 caracteres."><input required minLength={6} type="password" value={editingOperatorForm.password} onChange={(event) => setEditingOperatorForm({ ...editingOperatorForm, password: event.target.value })} className={inputClass} placeholder="Nova senha" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditingOperatorId(null)}>Cancelar</Button><Button type="submit"><Check size={15} /> Salvar alterações</Button></div></form></Modal>}
      {canManageStaff && <SectionCard eyebrow="Perfil administrador">
        <div className="space-y-4 p-5 sm:p-6">
          {staffAccountsLoading && <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">Carregando perfil administrador...</p>}
          {adminAccounts.length === 0 && !staffAccountsLoading && <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhum perfil administrador ativo foi encontrado.</p>}
          {adminAccounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.18)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold">{account.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {account.isSuperAdmin ? "Acesso total · não pode ser removido" : "Administrador"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openAdminEditor(account)}><Pencil size={14} /> Editar</Button>
                  <Button size="sm" variant="ghost" disabled={adminAccounts.length <= 1 || account.isSuperAdmin} onClick={() => deleteStaffAccountFromPage(account.id)} className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]">Excluir</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>}
      {operatorModalOpen && <Modal title="Criar usuário TI" onClose={() => setOperatorModalOpen(false)}><form className="space-y-4 p-5 sm:p-6" onSubmit={saveOperator} data-testid="form-operator-account"><Field label="Nome do usuário TI"><input required minLength={3} value={operatorForm.name} onChange={(event) => setOperatorForm({ ...operatorForm, name: event.target.value })} className={inputClass} placeholder="Ex.: Carlos Souza" data-testid="input-new-operator-name" /></Field><Field label="Senha" hint="Use pelo menos 6 caracteres."><input required minLength={6} type="password" value={operatorForm.password} onChange={(event) => setOperatorForm({ ...operatorForm, password: event.target.value })} className={inputClass} placeholder="Senha de acesso" data-testid="input-new-operator-password" /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={operatorForm.isAdmin} onChange={(event) => setOperatorForm({ ...operatorForm, isAdmin: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Associar como administrador</label>{operatorError && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]">{operatorError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOperatorModalOpen(false)}>Cancelar</Button><Button type="submit"><Plus size={15} /> Criar usuário TI</Button></div></form></Modal>}
      {editingAdminId && <Modal title="Editar administrador" onClose={() => setEditingAdminId(null)}><form className="space-y-4 p-5 sm:p-6" onSubmit={saveAdminEdit}><Field label="Nome do administrador"><input required minLength={3} disabled={adminAccounts.find((account) => account.id === editingAdminId)?.isSuperAdmin} value={editingAdminForm.name} onChange={(event) => setEditingAdminForm({ ...editingAdminForm, name: event.target.value })} className={inputClass} /></Field><Field label="Nova senha" hint="Use pelo menos 6 caracteres."><input required minLength={6} type="password" value={editingAdminForm.password} onChange={(event) => setEditingAdminForm({ ...editingAdminForm, password: event.target.value })} className={inputClass} placeholder="Nova senha" /></Field>{staffActionError && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{staffActionError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditingAdminId(null)}>Cancelar</Button><Button type="submit"><Check size={15} /> Salvar alterações</Button></div></form></Modal>}
      {modalOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(187_54%_17%/.35)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true"><div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl sm:max-w-xl sm:rounded-2xl"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><h2 className="font-display text-xl font-semibold">{mode === "single" ? "Cadastrar professor" : "Importar e-mails em lote"}</h2><button type="button" onClick={() => setModalOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label="Cancelar cadastro" title="Cancelar cadastro"><X size={18} /></button></div><form className="space-y-5 p-5 sm:p-6" onSubmit={saveAccounts} data-testid="form-teacher-account"><div className="flex gap-1 rounded-lg bg-[hsl(var(--muted))] p-1"><button type="button" onClick={() => setMode("single")} className={cx("flex-1 rounded-md px-3 py-2 text-xs font-semibold", mode === "single" && "bg-[hsl(var(--card))] shadow-sm")}>Um professor</button><button type="button" onClick={() => setMode("bulk")} className={cx("flex-1 rounded-md px-3 py-2 text-xs font-semibold", mode === "bulk" && "bg-[hsl(var(--card))] shadow-sm")}>Planilha ou PDF</button></div>      {mode === "single" ? <div className="space-y-4"><Field label="Nome para entrar (opcional)" hint="Se não informar, o nome será gerado a partir do e-mail."><input value={singleForm.name} onChange={(event) => setSingleForm({ ...singleForm, name: event.target.value })} className={inputClass} placeholder="Ex.: Marina Lopes" data-testid="input-new-teacher-name" /></Field><Field label="E-mail associado"><input required type="email" value={singleForm.email} onChange={(event) => setSingleForm({ ...singleForm, email: event.target.value })} className={inputClass} placeholder="professor@escola.com.br" data-testid="input-new-teacher-email" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Segmento"><select value={singleForm.segment} onChange={(event) => setSingleForm({ ...singleForm, segment: event.target.value as Segment })} className={inputClass}>{segments.map((segment) => <option key={segment}>{segment}</option>)}</select></Field><Field label="Matéria" hint={singleForm.segment === "Fundamental 2" || singleForm.segment === "Ensino Médio" ? "Obrigatória para este segmento." : undefined}><input required={singleForm.segment === "Fundamental 2" || singleForm.segment === "Ensino Médio"} value={singleForm.subject} onChange={(event) => setSingleForm({ ...singleForm, subject: event.target.value })} className={inputClass} placeholder="Ex.: Ciências" /></Field></div></div> : <div className="space-y-4"><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 text-[hsl(var(--primary))]" size={19} /><div><p className="text-sm font-semibold">Importe vários e-mails de uma vez</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Aceitamos CSV, Excel (.xls/.xlsx) e PDF. O sistema encontra os e-mails em qualquer coluna ou página.</p></div></div><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[hsl(var(--primary)/.45)] bg-[hsl(var(--card))] px-4 py-3 text-sm font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/.06)]"><Upload size={16} /> {importingFile ? <><Loader2 className="animate-spin" size={15} /> Lendo arquivo...</> : "Escolher planilha ou PDF"}<input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleBulkFile} className="sr-only" disabled={importingFile} data-testid="input-bulk-teacher-file" /></label>{bulkFileName && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--primary))]"><FileText size={14} /> {bulkFileName}</p>}</div><Field label="E-mails encontrados" hint="Você também pode colar ou editar os endereços. Um por linha, separados por vírgula ou ponto e vírgula."><textarea required value={bulkEmails} onChange={(event) => setBulkEmails(event.target.value)} className={`${inputClass} min-h-32 py-3`} placeholder={"ana.silva@escola.com.br\nbruno.souza@escola.com.br"} data-testid="textarea-bulk-teacher-emails" /></Field><p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">Depois de criar a senha, cada professor preencherá seu segmento, matéria e turma no próprio perfil.</p></div>}{error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}<div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4"><Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={importingFile || savingAccounts}><Check size={15} /> {savingAccounts ? "Salvando..." : "Criar acessos"}</Button></div></form></div></div>}
    </div>
  );
}

export function TeacherLoginPage() {
  const { updateTeacher } = useCampusData();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [firstAccess, setFirstAccess] = useState(false);
  const [firstAccessEmailVerified, setFirstAccessEmailVerified] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [registrationPassword, setRegistrationPassword] = useState('');
  const [registrationConfirmation, setRegistrationConfirmation] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const rememberedName = window.localStorage.getItem("controle-carrinhos-remembered-teacher-name");
    if (rememberedName) {
      setName(rememberedName);
      setRemember(true);
    }
  }, []);

  const signIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    void loginWithCredentials('user', name, password)
      .then((session) => {
        updateTeacher({ name: session.name, email: '', segment: 'Fundamental 2', subject: '', className: '' });
        if (remember) {
          window.localStorage.setItem("controle-carrinhos-remembered-teacher-name", session.name);
        } else {
          window.localStorage.removeItem("controle-carrinhos-remembered-teacher-name");
        }
        void loadTeacherProfile()
          .then((profile) => {
            updateTeacher(profile);
            setLocation('/usuario');
          })
          .catch(() => setLocation('/usuario/perfil'));
      })
      .catch((loginError: unknown) => {
        setError(loginError instanceof Error ? loginError.message : 'N?o foi poss?vel autenticar.');
      })
      .finally(() => setSubmitting(false));
  };

  const createFirstAccess = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const email = registrationEmail.trim().toLowerCase();
    if (registrationPassword.length < 6) {
      setError('A senha deve conter pelo menos 6 caracteres.');
      return;
    }
    if (registrationPassword !== registrationConfirmation) {
      setError('A confirmação da senha não confere.');
      return;
    }
    setSubmitting(true);
    void completeTeacherRegistration(email, registrationPassword)
      .then(() => loginWithCredentials('user', email, registrationPassword))
      .then((session) => {
        updateTeacher({ name: session.name, email, segment: 'Fundamental 2', subject: '', className: '' });
        window.localStorage.setItem("controle-carrinhos-remembered-teacher-name", email);
        setLocation('/usuario/perfil');
      })
      .catch((registrationError: unknown) => {
        setError(registrationError instanceof Error
          ? registrationError.message
          : 'Não foi possível criar o acesso. Confira o e-mail ou procure o TI/administrador.');
      })
      .finally(() => setSubmitting(false));
  };

  const verifyFirstAccessEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const email = registrationEmail.trim().toLowerCase();
    if (!email) {
      setError('Informe o e-mail cadastrado pelo TI/administrador.');
      return;
    }
    setSubmitting(true);
    void checkTeacherFirstAccess(email)
      .then(() => {
        setRegistrationEmail(email);
        setFirstAccessEmailVerified(true);
      })
      .catch((verificationError: unknown) => {
        setError(verificationError instanceof Error
          ? verificationError.message
          : 'Não foi possível verificar o e-mail. Procure o TI/administrador.');
      })
      .finally(() => setSubmitting(false));
  };

  const resetFirstAccessEmail = () => {
    setFirstAccessEmailVerified(false);
    setRegistrationPassword('');
    setRegistrationConfirmation('');
    setError('');
  };

  return (
    <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center py-8">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-xl sm:p-8">
        <div>
          <h1 className="font-display text-xl font-semibold">{firstAccess ? 'Primeiro acesso' : 'Acesso do professor'}</h1>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{firstAccess ? firstAccessEmailVerified ? 'E-mail autorizado. Agora crie sua senha.' : 'Informe o e-mail cadastrado pelo TI/administrador.' : 'Entre com seu e-mail cadastrado ou nome de usuário.'}</p>
        </div>
        {firstAccess ? (
          <>
            {firstAccessEmailVerified ? (
              <form className="space-y-5" autoComplete="on" onSubmit={createFirstAccess}>
                <Field label="E-mail cadastrado"><input type="email" value={registrationEmail} className={inputClass} autoComplete="email" readOnly /></Field>
                <Field label="Crie uma senha" hint="Use pelo menos 6 caracteres."><input required minLength={6} maxLength={1024} name="new-password" type="password" value={registrationPassword} onChange={(event) => setRegistrationPassword(event.target.value)} className={inputClass} autoComplete="new-password" data-testid="input-first-access-password" /></Field>
                <Field label="Confirme a senha"><input required minLength={6} maxLength={1024} name="confirm-password" type="password" value={registrationConfirmation} onChange={(event) => setRegistrationConfirmation(event.target.value)} className={inputClass} autoComplete="new-password" data-testid="input-first-access-confirmation" /></Field>
                {error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Criando acesso...' : 'Criar acesso'}</Button>
                <Button type="button" variant="ghost" className="w-full" disabled={submitting} onClick={resetFirstAccessEmail}>Usar outro e-mail</Button>
              </form>
            ) : (
              <form className="space-y-5" autoComplete="on" onSubmit={verifyFirstAccessEmail}>
                <Field label="E-mail cadastrado"><input required type="email" name="email" value={registrationEmail} onChange={(event) => { setRegistrationEmail(event.target.value); setError(''); }} className={inputClass} autoComplete="email" placeholder="professor@escola.com.br" data-testid="input-first-access-email" /></Field>
                <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">Se o e-mail não estiver cadastrado, entre em contato com o TI para solicitar seu cadastro.</p>
                {error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Verificando e-mail...' : 'Continuar'}</Button>
              </form>
            )}
            <Button type="button" variant="ghost" className="w-full" disabled={submitting} onClick={() => { setFirstAccess(false); resetFirstAccessEmail(); }}>Voltar para entrar</Button>
          </>
        ) : (
          <>
            <form className="space-y-5" autoComplete="on" onSubmit={signIn}>
              <Field label="E-mail ou nome do professor"><input required name="username" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} autoComplete="username" data-testid="input-login-name" /></Field>
              <Field label="Senha"><input required name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} autoComplete="current-password" data-testid="input-login-password" /></Field>
              <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />Lembrar meu usuário neste dispositivo</label>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Se quiser salvar a senha, aceite a opção oferecida pelo navegador após entrar.</p>
              {error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Verificando...' : 'Entrar'}</Button>
            </form>
            <button type="button" className="block w-full text-center text-xs font-semibold text-[hsl(var(--primary))] hover:underline" onClick={() => { setRegistrationEmail(name.includes('@') ? name : ''); setFirstAccess(true); setError(''); }}>
              Primeiro acesso?
            </button>
          </>
        )}
        <Link href="/" className="block text-center text-xs font-semibold text-[hsl(var(--muted-foreground))]">Voltar para acessos</Link>
      </div>
    </div>
  );
}
