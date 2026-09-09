import { Check, KeyRound, Mail, Plus, RotateCcw, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button, Field, PageHeader, SectionCard, StatusPill, cx, inputClass } from "@/components/app-ui";
import { segments, useCampusData, type Segment, type TeacherAccount } from "@/lib/campus-data";

const displayNameFromEmail = (email: string) => email.split("@")[0].split(/[._-]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");

export function TeacherProfilePage({ admin = false }: { admin?: boolean }) {
  const { teacher, updateTeacher, teacherAccounts, addTeacherAccounts, resetTeacherPassword } = useCampusData();
  const [form, setForm] = useState({ ...teacher });
  const [saved, setSaved] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [error, setError] = useState("");
  const [singleForm, setSingleForm] = useState({ name: "", email: "", segment: "Fundamental 2" as Segment, subject: "" });
  const [bulkEmails, setBulkEmails] = useState("");
  const showSubject = form.segment === "Fundamental 2" || form.segment === "Ensino Médio";

  const saveAccounts = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (mode === "single") {
      if (!singleForm.email.includes("@")) {
        setError("Informe um e-mail válido.");
        return;
      }
      addTeacherAccounts([singleForm]);
    } else {
      const emails = bulkEmails.split(/[\n,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
      const invalid = emails.find((email) => !email.includes("@"));
      if (invalid || emails.length === 0) {
        setError("Informe um ou mais e-mails válidos, um por linha ou separados por vírgula.");
        return;
      }
      addTeacherAccounts(emails.map((email) => ({ name: displayNameFromEmail(email), email, segment: "Fundamental 2" as Segment, subject: "" })));
    }
    setSingleForm({ name: "", email: "", segment: "Fundamental 2", subject: "" });
    setBulkEmails("");
    setModalOpen(false);
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
      <PageHeader eyebrow="Administração · Usuários" title="Professores" description="Cadastre os e-mails que terão acesso. No primeiro acesso, cada professor cria uma senha de 4 dígitos; se esquecer, a coordenação pode resetar." action={<div className="flex flex-wrap gap-2"><Link href="/login" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold"><KeyRound size={15} /> Tela de acesso</Link><Button onClick={() => { setMode("single"); setError(""); setModalOpen(true); }} data-testid="button-new-teacher"><Plus size={16} /> Cadastrar professor</Button></div>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Professores cadastrados</p><p className="mt-4 font-display text-3xl font-semibold">{teacherAccounts.length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Acessos por e-mail</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Primeiro acesso pendente</p><p className="mt-4 font-display text-3xl font-semibold">{teacherAccounts.filter((account) => account.mustSetPassword).length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Ainda precisam criar senha</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Cadastro em massa</p><p className="mt-4 font-display text-3xl font-semibold">E-mail</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Vários endereços de uma vez</p></div>
      </div>
      <SectionCard title="Contas de acesso" eyebrow="Professores autorizados" action={<Button size="sm" variant="secondary" onClick={() => { setMode("bulk"); setError(""); setModalOpen(true); }} data-testid="button-bulk-teachers"><Mail size={14} /> Cadastrar e-mails em massa</Button>}>
        <div className="overflow-x-auto"><table className="data-table w-full min-w-[720px] text-left"><thead><tr className="border-b border-[hsl(var(--border))]"><th className="px-6 py-3">Professor</th><th className="px-3 py-3">E-mail de acesso</th><th className="px-3 py-3">Segmento</th><th className="px-3 py-3">Situação</th><th className="px-6 py-3 text-right">Ação</th></tr></thead><tbody>{teacherAccounts.map((account) => <tr key={account.id} data-testid={`row-teacher-${account.id}`}><td className="px-6 py-4 text-sm font-semibold">{account.name}</td><td className="px-3 py-4 text-sm">{account.email}</td><td className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">{account.segment}</td><td className="px-3 py-4"><StatusPill status={account.mustSetPassword ? "Primeiro acesso" : "Acesso ativo"} /></td><td className="px-6 py-4 text-right"><Button size="sm" variant="ghost" onClick={() => resetTeacherPassword(account.id)} data-testid={`button-reset-teacher-${account.id}`}><RotateCcw size={14} /> Resetar senha</Button></td></tr>)}</tbody></table></div>
      </SectionCard>
      {modalOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(187_54%_17%/.35)] p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true"><div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl sm:max-w-xl sm:rounded-2xl"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><h2 className="font-display text-xl font-semibold">{mode === "single" ? "Cadastrar professor" : "Cadastrar e-mails em massa"}</h2><button type="button" onClick={() => setModalOpen(false)} className="text-sm text-[hsl(var(--muted-foreground))]">Fechar</button></div><form className="space-y-5 p-5 sm:p-6" onSubmit={saveAccounts} data-testid="form-teacher-account"><div className="flex gap-1 rounded-lg bg-[hsl(var(--muted))] p-1"><button type="button" onClick={() => setMode("single")} className={cx("flex-1 rounded-md px-3 py-2 text-xs font-semibold", mode === "single" && "bg-[hsl(var(--card))] shadow-sm")}>Um professor</button><button type="button" onClick={() => setMode("bulk")} className={cx("flex-1 rounded-md px-3 py-2 text-xs font-semibold", mode === "bulk" && "bg-[hsl(var(--card))] shadow-sm")}>Vários e-mails</button></div>{mode === "single" ? <div className="space-y-4"><Field label="Nome completo"><input required value={singleForm.name} onChange={(event) => setSingleForm({ ...singleForm, name: event.target.value })} className={inputClass} placeholder="Ex.: Marina Lopes" data-testid="input-new-teacher-name" /></Field><Field label="E-mail de acesso"><input required type="email" value={singleForm.email} onChange={(event) => setSingleForm({ ...singleForm, email: event.target.value })} className={inputClass} placeholder="professor@escola.com.br" data-testid="input-new-teacher-email" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Seguimento"><select value={singleForm.segment} onChange={(event) => setSingleForm({ ...singleForm, segment: event.target.value as Segment })} className={inputClass}>{segments.map((segment) => <option key={segment}>{segment}</option>)}</select></Field><Field label="Matéria"><input value={singleForm.subject} onChange={(event) => setSingleForm({ ...singleForm, subject: event.target.value })} className={inputClass} placeholder="Ex.: Ciências" /></Field></div></div> : <Field label="E-mails dos professores" hint="Um por linha, ou separados por vírgula. O nome inicial será criado a partir do e-mail e pode ser ajustado depois."><textarea required value={bulkEmails} onChange={(event) => setBulkEmails(event.target.value)} className={`${inputClass} min-h-36 py-3`} placeholder={"ana.silva@escola.com.br\nbruno.souza@escola.com.br"} data-testid="textarea-bulk-teacher-emails" /></Field>}{error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}<div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4"><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit"><Check size={15} /> Criar acesso</Button></div></form></div></div>}
    </div>
  );
}

export function TeacherLoginPage() {
  const { teacherAccounts, authenticateTeacher, setTeacherPassword, updateTeacher } = useCampusData();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"email" | "password" | "first-access">("email");
  const [error, setError] = useState("");
  const account = teacherAccounts.find((item) => item.email === email.trim().toLowerCase());

  const continueWithEmail = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!account) {
      setError("Este e-mail ainda não foi cadastrado pela coordenação.");
      return;
    }
    setStep(account.mustSetPassword ? "first-access" : "password");
  };
  const signIn = (event: React.FormEvent) => {
    event.preventDefault();
    const result = authenticateTeacher(email, password);
    if (!result || result === "first-access") {
      setError("Senha incorreta. Se a senha foi resetada, volte e informe o e-mail novamente.");
      return;
    }
    updateTeacher(result);
    setLocation("/usuario");
  };
  const createPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || !/^\d{4}$/.test(newPassword)) {
      setError("A senha precisa ter exatamente 4 números.");
      return;
    }
    setTeacherPassword(account.id, newPassword);
    updateTeacher(account);
    setLocation("/usuario");
  };

  return <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center py-8"><div className="w-full max-w-md rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_16px_48px_hsl(187_30%_20%/.08)] sm:p-8"><div className="mb-7 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><KeyRound size={20} /></span><div><p className="font-display text-xl font-semibold">Acesso do professor</p><p className="text-xs text-[hsl(var(--muted-foreground))]">Controle de Carrinhos</p></div></div>{step === "email" && <form className="space-y-5" onSubmit={continueWithEmail}><Field label="E-mail cadastrado"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="professor@escola.com.br" autoFocus data-testid="input-login-email" /></Field><p className="text-xs leading-5 text-[hsl(var(--muted-foreground))]">Use o e-mail informado pela coordenação. No primeiro acesso, você criará uma senha de 4 números.</p><Button type="submit" className="w-full">Continuar</Button></form>}{step === "password" && <form className="space-y-5" onSubmit={signIn}><Field label="Senha de 4 números"><input required inputMode="numeric" maxLength={4} pattern="\d{4}" type="password" value={password} onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 4))} className={inputClass} autoFocus data-testid="input-login-password" /></Field><div className="flex items-center justify-between"><button type="button" className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline" onClick={() => setStep("email")}>Usar outro e-mail</button><Button type="submit">Entrar</Button></div></form>}{step === "first-access" && <form className="space-y-5" onSubmit={createPassword}><div className="rounded-xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.12)] p-4 text-xs leading-5 text-[hsl(34_60%_32%)]">Este é seu primeiro acesso — ou sua senha foi resetada pela coordenação. Crie agora uma senha simples de 4 números.</div><Field label="Criar senha"><input required inputMode="numeric" maxLength={4} pattern="\d{4}" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value.replace(/\D/g, "").slice(0, 4))} className={inputClass} autoFocus data-testid="input-first-access-password" /></Field><Button type="submit" className="w-full">Criar senha e entrar</Button></form>}{error && <p className="mt-4 rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" data-testid="text-login-error">{error}</p>}<Link href="/" className="mt-6 block text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">Voltar para administração</Link></div></div>;
}