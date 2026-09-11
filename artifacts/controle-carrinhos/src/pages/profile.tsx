import { Check, FileSpreadsheet, FileText, KeyRound, Loader2, Mail, Plus, RotateCcw, Upload, UserRound } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Button, Field, PageHeader, SectionCard, StatusPill, cx, inputClass } from "@/components/app-ui";
import { parseTeacherEmailsFile } from "@/lib/teacher-import";
import {
  profileFromTeacherAccount,
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
  const { teacher, updateTeacher, teacherAccounts, addTeacherAccounts, resetTeacherPassword, operatorAccounts, addOperatorAccount, movementSettings, updateMovementSettings } = useCampusData();
  const [form, setForm] = useState({ ...teacher });
  const [saved, setSaved] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [error, setError] = useState("");
  const [singleForm, setSingleForm] = useState({ name: "", email: "", segment: "Fundamental 2" as Segment, subject: "" });
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [importingFile, setImportingFile] = useState(false);
  const [operatorForm, setOperatorForm] = useState({ name: "", password: "" });
  const [operatorMessage, setOperatorMessage] = useState("");
  const [operatorError, setOperatorError] = useState("");
  const showSubject = form.segment === "Fundamental 2" || form.segment === "Ensino Médio";

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

  const saveAccounts = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (mode === "single") {
      if (!singleForm.email.includes("@")) {
        setError("Informe um e-mail válido.");
        return;
      }
      addTeacherAccounts([{ ...singleForm, name: singleForm.name.trim() || displayNameFromEmail(singleForm.email) }]);
    } else {
      const emails = emailsFromText(bulkEmails);
      if (emails.length === 0) {
        setError("Informe e-mails ou importe uma planilha/PDF com os endereços.");
        return;
      }
      addTeacherAccounts(emails.map((email) => ({
        name: displayNameFromEmail(email),
        email,
        segment: "Fundamental 2" as Segment,
        subject: "",
      })));
    }

    setSingleForm({ name: "", email: "", segment: "Fundamental 2", subject: "" });
    setBulkEmails("");
    setBulkFileName("");
    setModalOpen(false);
  };

  const saveOperator = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOperatorMessage("");
    setOperatorError("");
    const result = addOperatorAccount(operatorForm.name, operatorForm.password);
    if (result === "name-taken") {
      setOperatorError("Já existe um operador com este nome.");
      return;
    }
    if (result === "invalid-name") {
      setOperatorError("Informe um nome de operador com pelo menos 3 caracteres.");
      return;
    }
    if (result === "invalid-password") {
      setOperatorError("A senha do operador precisa ter pelo menos 6 caracteres.");
      return;
    }
    setOperatorForm({ name: "", password: "" });
    setOperatorMessage(`Usuário ${result.name} criado com sucesso.`);
  };

  if (!admin) {
    return (
      <div className="animate-rise space-y-7">
        <PageHeader eyebrow="Área do professor · Perfil" title="Meu perfil" description="Mantenha seu e-mail e segmento atualizados. Eles são usados para liberar o acesso e filtrar as salas disponíveis nas reservas." />
        <SectionCard title="Dados do professor" eyebrow="Cadastro pessoal">
          <form className="max-w-xl space-y-5 p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); updateTeacher(form); setSaved(true); window.setTimeout(() => setSaved(false), 2200); }} data-testid="form-teacher-profile">
            <div className="flex items-center gap-3 rounded-xl bg-[hsl(var(--muted)/.45)] p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><UserRound size={19} /></span><div><p className="text-sm font-semibold">Perfil usado nas reservas</p><p className="text-xs text-[hsl(var(--muted-foreground))]">O nome abaixo será preenchido automaticamente.</p></div></div>
            <Field label="Nome do professor"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Ex.: Marina Lopes" data-testid="input-teacher-name" /></Field>
            <Field label="E-mail de acesso" hint="Use o mesmo e-mail cadastrado pela coordenação."><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} placeholder="professor@escola.com.br" data-testid="input-teacher-email" /></Field>
            <Field label="Seguimento"><select value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value as Segment, subject: "" })} className={inputClass} data-testid="select-teacher-segment">{segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select></Field>
            {showSubject ? <Field label="Matéria" hint="Obrigatória para Fundamental 2 e Ensino Médio."><input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} className={inputClass} placeholder="Ex.: Ciências" data-testid="input-teacher-subject" /></Field> : <p className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Para Educação Infantil e Fundamental 1, a sala cadastrada pela administração será exibida diretamente na reserva.</p>}
            <div className="flex justify-end border-t border-[hsl(var(--border))] pt-4"><Button type="submit" data-testid="button-save-teacher-profile"><Check size={15} /> {saved ? "Cadastro salvo" : "Salvar cadastro"}</Button></div>
          </form>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Administração · Usuários"
        title="Professores"
        description="Autorize os e-mails individualmente ou em lote. No primeiro acesso, o professor confirma o e-mail e cria o próprio nome de usuário e senha."
        action={<div className="flex flex-wrap gap-2"><Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold"><KeyRound size={15} /> Tela de acesso</Link><Button onClick={() => openAccountModal("single")} data-testid="button-new-teacher"><Plus size={16} /> Cadastrar professor</Button></div>}
      />
      <SectionCard title="Movimentação dos carrinhos" eyebrow="Configurações operacionais">
        <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6">
          <Field label="Intervalo do alerta (minutos)"><input type="number" min="1" max="60" value={movementSettings.alertIntervalMinutes} onChange={(event) => updateMovementSettings({ ...movementSettings, alertIntervalMinutes: Math.max(1, Number(event.target.value)) })} className={inputClass} /></Field>
          <Field label="Repetições do alerta"><input type="number" min="1" max="10" value={movementSettings.alertRepeat} onChange={(event) => updateMovementSettings({ ...movementSettings, alertRepeat: Math.max(1, Number(event.target.value)) })} className={inputClass} /></Field>
          <label className="flex items-center gap-3 self-end rounded-xl border border-[hsl(var(--border))] p-3 text-sm font-semibold"><input type="checkbox" checked={movementSettings.autoComplete} onChange={(event) => updateMovementSettings({ ...movementSettings, autoComplete: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Concluir automaticamente após o intervalo</label>
        </div>
      </SectionCard>
      <SectionCard title="Usuários operadores" eyebrow="Criar acessos para movimentação">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <form className="space-y-4" onSubmit={saveOperator} data-testid="form-operator-account">
            <Field label="Nome do operador">
              <input required minLength={3} value={operatorForm.name} onChange={(event) => setOperatorForm({ ...operatorForm, name: event.target.value })} className={inputClass} placeholder="Ex.: Carlos Souza" data-testid="input-new-operator-name" />
            </Field>
            <Field label="Senha" hint="Use pelo menos 6 caracteres.">
              <input required minLength={6} type="password" value={operatorForm.password} onChange={(event) => setOperatorForm({ ...operatorForm, password: event.target.value })} className={inputClass} placeholder="Senha de acesso" data-testid="input-new-operator-password" />
            </Field>
            {operatorError && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" data-testid="text-operator-error">{operatorError}</p>}
            {operatorMessage && <p className="rounded-lg bg-[hsl(158_43%_43%/.12)] px-3 py-2 text-xs font-semibold text-[hsl(158_43%_32%)]" data-testid="text-operator-success">{operatorMessage}</p>}
            <Button type="submit"><Plus size={15} /> Criar usuário operador</Button>
          </form>
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.25)]">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3">
              <div><p className="text-sm font-semibold">Operadores cadastrados</p><p className="text-xs text-[hsl(var(--muted-foreground))]">Acesso pela tela do operador.</p></div>
              <span className="rounded-full bg-[hsl(var(--primary)/.1)] px-2.5 py-1 text-xs font-bold text-[hsl(var(--primary))]">{operatorAccounts.length}</span>
            </div>
            <div className="divide-y divide-[hsl(var(--border))]">
              {operatorAccounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-semibold">{account.name}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">Usuário operador</p></div><Link href="/operador/login" className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">Tela de acesso</Link></div>)}
            </div>
          </div>
        </div>
      </SectionCard>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Professores cadastrados</p><p className="mt-4 font-display text-3xl font-semibold">{teacherAccounts.length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">E-mails autorizados</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Primeiro acesso pendente</p><p className="mt-4 font-display text-3xl font-semibold">{teacherAccounts.filter((account) => account.mustSetPassword).length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Ainda precisam criar login</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Cadastro em massa</p><p className="mt-4 font-display text-3xl font-semibold">Planilha ou PDF</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">E-mails importados automaticamente</p></div>
      </div>
      <SectionCard title="Contas de acesso" eyebrow="Professores autorizados" action={<Button size="sm" variant="secondary" onClick={() => openAccountModal("bulk")} data-testid="button-bulk-teachers"><Mail size={14} /> Importar e-mails em lote</Button>}>
        <div className="overflow-x-auto"><table className="data-table w-full min-w-[720px] text-left"><thead><tr className="border-b border-[hsl(var(--border))]"><th className="px-6 py-3">Nome de login</th><th className="px-3 py-3">E-mail de ativação</th><th className="px-3 py-3">Segmento</th><th className="px-3 py-3">Situação</th><th className="px-6 py-3 text-right">Ação</th></tr></thead><tbody>{teacherAccounts.map((account) => <tr key={account.id} data-testid={`row-teacher-${account.id}`}><td className="px-6 py-4 text-sm font-semibold">{account.mustSetPassword ? <span className="text-[hsl(var(--muted-foreground))]">Será definido no primeiro acesso</span> : account.name}</td><td className="px-3 py-4 text-sm">{account.email}</td><td className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">{account.segment}</td><td className="px-3 py-4"><StatusPill status={account.mustSetPassword ? "Primeiro acesso" : "Acesso ativo"} /></td><td className="px-6 py-4 text-right"><Button size="sm" variant="ghost" onClick={() => resetTeacherPassword(account.id)} data-testid={`button-reset-teacher-${account.id}`}><RotateCcw size={14} /> Resetar acesso</Button></td></tr>)}</tbody></table></div>
      </SectionCard>
      {modalOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(187_54%_17%/.35)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true"><div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl sm:max-w-xl sm:rounded-2xl"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><h2 className="font-display text-xl font-semibold">{mode === "single" ? "Cadastrar professor" : "Importar e-mails em lote"}</h2><button type="button" onClick={() => setModalOpen(false)} className="text-sm text-[hsl(var(--muted-foreground))]">Fechar</button></div><form className="space-y-5 p-5 sm:p-6" onSubmit={saveAccounts} data-testid="form-teacher-account"><div className="flex gap-1 rounded-lg bg-[hsl(var(--muted))] p-1"><button type="button" onClick={() => setMode("single")} className={cx("flex-1 rounded-md px-3 py-2 text-xs font-semibold", mode === "single" && "bg-[hsl(var(--card))] shadow-sm")}>Um professor</button><button type="button" onClick={() => setMode("bulk")} className={cx("flex-1 rounded-md px-3 py-2 text-xs font-semibold", mode === "bulk" && "bg-[hsl(var(--card))] shadow-sm")}>Planilha ou PDF</button></div>{mode === "single" ? <div className="space-y-4"><Field label="Nome inicial (opcional)" hint="O professor poderá definir o nome do login no primeiro acesso."><input value={singleForm.name} onChange={(event) => setSingleForm({ ...singleForm, name: event.target.value })} className={inputClass} placeholder="Ex.: Marina Lopes" data-testid="input-new-teacher-name" /></Field><Field label="E-mail de ativação"><input required type="email" value={singleForm.email} onChange={(event) => setSingleForm({ ...singleForm, email: event.target.value })} className={inputClass} placeholder="professor@escola.com.br" data-testid="input-new-teacher-email" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Seguimento"><select value={singleForm.segment} onChange={(event) => setSingleForm({ ...singleForm, segment: event.target.value as Segment })} className={inputClass}>{segments.map((segment) => <option key={segment}>{segment}</option>)}</select></Field><Field label="Matéria"><input value={singleForm.subject} onChange={(event) => setSingleForm({ ...singleForm, subject: event.target.value })} className={inputClass} placeholder="Ex.: Ciências" /></Field></div></div> : <div className="space-y-4"><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-4"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 text-[hsl(var(--primary))]" size={19} /><div><p className="text-sm font-semibold">Importe vários e-mails de uma vez</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Aceitamos CSV, Excel (.xls/.xlsx) e PDF. O sistema encontra os e-mails em qualquer coluna ou página.</p></div></div><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[hsl(var(--primary)/.45)] bg-[hsl(var(--card))] px-4 py-3 text-sm font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/.06)]"><Upload size={16} /> {importingFile ? <><Loader2 className="animate-spin" size={15} /> Lendo arquivo...</> : "Escolher planilha ou PDF"}<input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleBulkFile} className="sr-only" disabled={importingFile} data-testid="input-bulk-teacher-file" /></label>{bulkFileName && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[hsl(158_43%_35%)]"><FileText size={14} /> {bulkFileName}</p>}</div><Field label="E-mails encontrados" hint="Você também pode colar ou editar os endereços. Um por linha, separados por vírgula ou ponto e vírgula."><textarea required value={bulkEmails} onChange={(event) => setBulkEmails(event.target.value)} className={`${inputClass} min-h-32 py-3`} placeholder={"ana.silva@escola.com.br\nbruno.souza@escola.com.br"} data-testid="textarea-bulk-teacher-emails" /></Field></div>}{error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}<div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4"><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={importingFile}><Check size={15} /> Criar acessos</Button></div></form></div></div>}
    </div>
  );
}

type LoginStep = "login" | "activation" | "first-access";

export function TeacherLoginPage() {
  const {
    teacherAccounts,
    authenticateTeacher,
    completeTeacherRegistration,
    updateTeacher,
    rememberTeacherLogin,
    getRememberedTeacher,
  } = useCampusData();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<LoginStep>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [activationEmail, setActivationEmail] = useState("");
  const [registrationName, setRegistrationName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activationAccountId, setActivationAccountId] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const remembered = getRememberedTeacher();
    if (remembered) {
      updateTeacher(profileFromTeacherAccount(remembered));
      setLocation("/usuario");
    }
  }, []);

  const activationAccount = teacherAccounts.find((account) => account.id === activationAccountId);

  const continueWithEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const account = teacherAccounts.find((item) => item.email === activationEmail.trim().toLowerCase());
    if (!account) {
      setError("Este e-mail ainda não foi autorizado pela coordenação.");
      return;
    }
    if (!account.mustSetPassword) {
      setName(account.name);
      setStep("login");
      setError("Este acesso já foi ativado. Entre usando o nome e a senha cadastrados.");
      return;
    }
    setActivationAccountId(account.id);
    setRegistrationName("");
    setNewPassword("");
    setConfirmPassword("");
    setStep("first-access");
  };

  const signIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const result = authenticateTeacher(name, password);
    if (!result || result === "first-access") {
      setError(result === "first-access" ? "Este acesso ainda não foi ativado. Use seu e-mail para criar o login." : "Nome ou senha incorretos.");
      return;
    }
    updateTeacher(profileFromTeacherAccount(result));
    rememberTeacherLogin(result.id, remember);
    setLocation("/usuario");
  };

  const createAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!activationAccount) {
      setError("Não foi possível localizar este convite. Informe o e-mail novamente.");
      setStep("activation");
      return;
    }
    if (registrationName.trim().length < 3) {
      setError("Informe seu nome completo.");
      return;
    }
    if (newPassword.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    const result = completeTeacherRegistration(activationAccount.id, registrationName, newPassword);
    if (result === "name-taken") {
      setError("Este nome já está sendo usado. Escolha outro nome para o login.");
      return;
    }
    if (!result) {
      setError("Não foi possível criar seu acesso.");
      return;
    }
    updateTeacher(profileFromTeacherAccount(result));
    rememberTeacherLogin(result.id, remember);
    setLocation("/usuario");
  };

  return <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center py-8"><div className="w-full max-w-md rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_16px_48px_hsl(187_30%_20%/.08)] sm:p-8"><div className="mb-7 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><KeyRound size={20} /></span><div><p className="font-display text-xl font-semibold">Acesso do professor</p><p className="text-xs text-[hsl(var(--muted-foreground))]">Controle de Carrinhos</p></div></div>{step === "login" && <form className="space-y-5" onSubmit={signIn}><Field label="Nome do professor"><input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Ex.: Marina Lopes" autoFocus data-testid="input-login-name" /></Field><Field label="Senha"><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder="Digite sua senha" data-testid="input-login-password" /></Field><label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-remember-login" /> Lembrar meu acesso neste dispositivo</label><Button type="submit" className="w-full">Entrar</Button><button type="button" className="w-full text-xs font-semibold text-[hsl(var(--primary))] hover:underline" onClick={() => { setError(""); setStep("activation"); }}>Primeiro acesso? Ative com seu e-mail</button></form>}{step === "activation" && <form className="space-y-5" onSubmit={continueWithEmail}><div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] p-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><Mail className="mb-2 text-[hsl(var(--primary))]" size={18} /><p>Digite o e-mail autorizado pela coordenação. Ele serve apenas para confirmar seu primeiro acesso.</p></div><Field label="E-mail autorizado"><input required type="email" value={activationEmail} onChange={(event) => setActivationEmail(event.target.value)} className={inputClass} placeholder="professor@escola.com.br" autoFocus data-testid="input-login-email" /></Field><Button type="submit" className="w-full">Continuar</Button><button type="button" className="w-full text-xs font-semibold text-[hsl(var(--primary))] hover:underline" onClick={() => { setError(""); setStep("login"); }}>Já tenho um login</button></form>}{step === "first-access" && <form className="space-y-5" onSubmit={createAccount}><div className="rounded-xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.12)] p-4 text-xs leading-5 text-[hsl(34_60%_32%)]">E-mail confirmado. Agora crie seu nome de login e uma senha com pelo menos 6 caracteres. Depois disso, o e-mail não será mais usado para entrar.</div><Field label="Seu nome completo"><input required value={registrationName} onChange={(event) => setRegistrationName(event.target.value)} className={inputClass} placeholder="Ex.: Marina Lopes" autoFocus data-testid="input-first-access-name" /></Field><Field label="Criar senha"><input required minLength={6} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} placeholder="Pelo menos 6 caracteres" data-testid="input-first-access-password" /></Field><Field label="Confirmar senha"><input required minLength={6} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} placeholder="Repita a senha" data-testid="input-first-access-password-confirmation" /></Field><label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Lembrar meu acesso neste dispositivo</label><Button type="submit" className="w-full">Criar login e entrar</Button><button type="button" className="w-full text-xs font-semibold text-[hsl(var(--primary))] hover:underline" onClick={() => { setError(""); setStep("activation"); }}>Usar outro e-mail</button></form>}{error && <p className="mt-4 rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" data-testid="text-login-error">{error}</p>}  <Link href="/" className="mt-6 block text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">Voltar para administração</Link><Link href="/operador/login" className="mt-3 block text-center text-xs font-semibold text-[hsl(var(--primary))] hover:underline">Acesso do operador</Link></div></div>;
}
