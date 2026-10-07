import { CalendarDays, KeyRound, LockKeyhole, Router, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useCampusData } from "@/lib/campus-data";
import {
  changeInitialAdminPassword,
  endAuthSession,
  getAuthenticatedSession,
  loginWithCredentials,
} from "@/lib/auth-session";

const accessCards = [
  {
    href: "/login",
    title: "Professor",
    description: "Acesse sua agenda e acompanhe seus agendamentos.",
    icon: CalendarDays,
  },
  {
    href: "/operador/login",
    title: "TI",
    description: "Consulte a agenda e movimente os carrinhos.",
    icon: Router,
  },
];

export function AccessPage() {
  const { campusSettings } = useCampusData();
  return (
    <main className="min-h-[100dvh] bg-[hsl(var(--background))] px-5 py-10 text-[hsl(var(--foreground))] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-4xl flex-col justify-center">
        <div className="mx-auto mb-10 text-center">
          <img
            src="/brand-logo.png"
            alt="Logo do Controle de Carrinhos"
            className="mx-auto mb-5 h-24 w-24 rounded-3xl object-cover shadow-lg sm:h-28 sm:w-28"
          />
          {campusSettings.campusName && (
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">{campusSettings.campusName}</p>
          )}
          <h1 className="font-display text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Controle de Carrinhos</h1>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Escolha seu perfil para continuar.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {accessCards.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-[0_8px_28px_hsl(214_40%_20%/.06)] transition hover:-translate-y-1 hover:border-[hsl(var(--primary)/.45)] hover:shadow-lg">
              <span className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))] transition group-hover:bg-[hsl(var(--primary))] group-hover:text-[hsl(var(--primary-foreground))]">
                <Icon size={22} />
              </span>
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--primary))]">Entrar <KeyRound size={14} /></span>
            </Link>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Link href="/admin/login" aria-label="Acesso administrativo" title="Acesso administrativo" className="rounded-full p-2 text-[hsl(var(--muted-foreground)/.35)] transition hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--muted-foreground))]">
            <LockKeyhole size={14} />
          </Link>
        </div>
        <p className="mt-2 text-center text-[11px] text-[hsl(var(--muted-foreground)/.55)]"><ShieldCheck size={12} className="mr-1 inline-block" />Acesso protegido</p>
      </div>
    </main>
  );
}

export function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Administrador");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-5">
      <form className="w-full max-w-sm space-y-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-xl" autoComplete="on" onSubmit={(event) => {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        void loginWithCredentials("admin", name, password)
          .then((session) => {
            window.localStorage.setItem("controle-carrinhos-admin-name", session.name);
            setLocation(session.mustChangePassword ? "/admin/alterar-senha" : "/admin");
          })
          .catch((loginError: unknown) => {
            setError(loginError instanceof Error ? loginError.message : "Não foi possível autenticar.");
          })
          .finally(() => setSubmitting(false));
      }}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><LockKeyhole size={20} /></span>
          <div><h1 className="font-display text-xl font-semibold">Acesso administrativo</h1><p className="text-xs text-[hsl(var(--muted-foreground))]">Área restrita</p></div>
        </div>
        <label className="block text-sm font-semibold">Nome<input required name="username" autoComplete="username" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm" /></label>
        <label className="block text-sm font-semibold">Senha administrativa<input required name="password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.2)]" placeholder="Digite a senha" autoFocus /></label>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Para salvar a senha, aceite a opção oferecida pelo navegador após entrar.</p>
        {error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}
        <button type="submit" disabled={submitting} className="h-10 w-full rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60">{submitting ? "Verificando..." : "Entrar"}</button>
        <Link href="/" className="block text-center text-xs font-semibold text-[hsl(var(--muted-foreground))]">Voltar</Link>
      </form>
    </main>
  );
}

export function AdminInitialPasswordPage() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-5">
      <form
        className="w-full max-w-sm space-y-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-xl"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          if (password.length < 6) {
            setError("A nova senha deve conter ao menos 6 caracteres.");
            return;
          }
          if (password !== confirmation) {
            setError("As senhas não coincidem.");
            return;
          }
          setSubmitting(true);
          void changeInitialAdminPassword(password)
            .then(() => setLocation("/admin"))
            .catch((changeError: unknown) => {
              setError(changeError instanceof Error ? changeError.message : "Não foi possível definir a senha.");
            })
            .finally(() => setSubmitting(false));
        }}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><KeyRound size={20} /></span>
          <div><h1 className="font-display text-xl font-semibold">Crie uma nova senha</h1><p className="text-xs text-[hsl(var(--muted-foreground))]">Etapa obrigatória do primeiro acesso</p></div>
        </div>
        <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">Defina uma senha pessoal com pelo menos 6 caracteres para continuar. Se quiser, aceite a opção do navegador para salvar a senha.</p>
        <input type="hidden" name="username" autoComplete="username" value={getAuthenticatedSession()?.name ?? "Administrador"} readOnly />
        <label className="block text-sm font-semibold">Nova senha<input required name="new-password" minLength={6} maxLength={1024} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.2)]" autoFocus /></label>
        <label className="block text-sm font-semibold">Confirme a nova senha<input required name="confirm-password" minLength={6} maxLength={1024} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.2)]" /></label>
        {error && <p role="alert" className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}
        <button type="submit" disabled={submitting} className="h-10 w-full rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] disabled:opacity-60">{submitting ? "Salvando..." : "Salvar nova senha"}</button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            setSubmitting(true);
            void endAuthSession()
              .then(() => setLocation("/admin/login"))
              .catch((logoutError: unknown) => {
                setError(logoutError instanceof Error ? logoutError.message : "Não foi possível encerrar a sessão.");
              })
              .finally(() => setSubmitting(false));
          }}
          className="block w-full text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] disabled:opacity-60"
        >
          Encerrar sessão
        </button>
      </form>
    </main>
  );
}
