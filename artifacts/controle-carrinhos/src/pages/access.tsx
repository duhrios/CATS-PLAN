import { CalendarDays, KeyRound, LockKeyhole, Router, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";

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
  return (
    <main className="min-h-[100dvh] bg-[hsl(var(--background))] px-5 py-10 text-[hsl(var(--foreground))] sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-4xl flex-col justify-center">
        <div className="mx-auto mb-10 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-lg">
            <Router size={30} />
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">Campus Vila Nova</p>
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
  const [error, setError] = useState("");
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-5">
      <form className="w-full max-w-sm space-y-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-xl" onSubmit={(event) => {
        event.preventDefault();
        if (password !== "admin123") {
          setError("Senha administrativa incorreta.");
          return;
        }
        window.localStorage.setItem("controle-carrinhos-role", "admin");
        setLocation("/admin");
      }}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><LockKeyhole size={20} /></span>
          <div><h1 className="font-display text-xl font-semibold">Acesso administrativo</h1><p className="text-xs text-[hsl(var(--muted-foreground))]">Área restrita</p></div>
        </div>
        <label className="block text-sm font-semibold">Senha administrativa<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/.2)]" placeholder="Digite a senha" autoFocus /></label>
        {error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}
        <button type="submit" className="h-10 w-full rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]">Entrar</button>
        <Link href="/" className="block text-center text-xs font-semibold text-[hsl(var(--muted-foreground))]">Voltar</Link>
      </form>
    </main>
  );
}
