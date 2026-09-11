import { Activity, CalendarDays, ChevronRight, DoorOpen, LayoutDashboard, LogOut, Menu, Network, PanelLeftClose, PanelLeftOpen, Router, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cx } from "@/components/app-ui";
import { useCampusData } from "@/lib/campus-data";

const adminNavItems = [
  { href: "/admin", label: "Visão do dia", icon: LayoutDashboard },
  { href: "/reservas", label: "Reservas", icon: CalendarDays },
  { href: "/carrinhos", label: "Carrinhos", icon: Router },
  { href: "/salas", label: "Salas", icon: DoorOpen },
  { href: "/professores", label: "Usuários", icon: UserRound },
  { href: "/wifi", label: "Pontos Wi-Fi", icon: Network },
  { href: "/historico", label: "Histórico", icon: Activity },
];

const userNavItems = [
  { href: "/usuario", label: "Visão do dia", icon: LayoutDashboard },
  { href: "/usuario/reservas", label: "Minhas reservas", icon: CalendarDays },
  { href: "/usuario/perfil", label: "Meu perfil", icon: UserRound },
];
const operatorNavItems = [
  { href: "/operador", label: "Visão do Dia", icon: LayoutDashboard },
  { href: "/reservas", label: "Reserva", icon: CalendarDays },
  { href: "/carrinhos", label: "Carrinho", icon: Router },
  { href: "/wifi", label: "Pontos - Wifi", icon: Network },
];

export function AppShell({ children, role = "admin" }: { children: React.ReactNode; role?: "admin" | "user" | "operator" }) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const { teacher, clearRememberedTeacher } = useCampusData();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const userMode = role === "user";
  const operatorMode = role === "operator";
  const navItems = operatorMode ? operatorNavItems : userMode ? userNavItems : adminNavItems;
  const signOut = () => {
    clearRememberedTeacher();
    window.localStorage.removeItem("controle-carrinhos-role");
    setLocation("/login");
  };
  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <aside className={cx(
        "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 md:translate-x-0",
        collapsed ? "md:w-[76px]" : "md:w-[248px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex h-[76px] items-center justify-between border-b border-[hsl(var(--sidebar-border))] px-5">
          <Link href={operatorMode ? "/operador" : userMode ? "/usuario" : "/admin"} onClick={() => setMobileOpen(false)} className={cx("flex items-center gap-3", collapsed && "md:mx-auto")} data-testid="link-brand">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"><Router size={19} strokeWidth={2.4} /></span>
            <span className={cx("leading-tight", collapsed && "md:hidden")}><strong className="block font-display text-[15px] tracking-tight">Controle</strong><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[hsl(var(--sidebar-foreground)/.58)]">de carrinhos</span></span>
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} className="text-[hsl(var(--sidebar-foreground)/.6)] md:hidden" aria-label="Fechar menu" data-testid="button-close-menu"><X size={19} /></button>
        </div>
        <div className="px-3 py-6">
           <p className={cx("mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.42)]", collapsed && "md:hidden")}>{operatorMode ? "Área do TI" : userMode ? "Área do professor" : "Administração"}</p>
          <nav className="space-y-1">
             {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase().replaceAll(" ", "-")}`} className={cx(
                  "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]" : "text-[hsl(var(--sidebar-foreground)/.67)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]",
                  collapsed && "md:justify-center",
                )}>
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-[hsl(var(--sidebar-primary))]" : ""} />
                  <span className={cx(collapsed && "md:hidden")}>{label}</span>
                  {active && <ChevronRight size={14} className={cx("ml-auto text-[hsl(var(--sidebar-primary))]", collapsed && "md:hidden")} />}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className={cx("mt-auto p-4", collapsed && "md:p-3")}>
          <div className={cx("rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.65)] p-4", collapsed && "md:hidden")}>
            <div className="mb-2 flex items-center gap-2 text-[hsl(var(--sidebar-primary))]"><span className="h-2 w-2 rounded-full bg-[hsl(var(--sidebar-primary))]" /><span className="text-[10px] font-bold uppercase tracking-[.14em]">Central de operação</span></div>
             <p className="text-xs leading-5 text-[hsl(var(--sidebar-foreground)/.65)]">{operatorMode ? "Mova os carrinhos e confirme cada entrega." : userMode ? "Consulte sua agenda e reserve um carrinho para outra data." : "Acompanhe a disponibilidade e o sinal antes do primeiro período."}</p>
          </div>
           <Link href={operatorMode || userMode ? "/admin" : "/usuario"} onClick={() => setMobileOpen(false)} className={cx("mt-4 flex items-center justify-center text-xs font-semibold text-[hsl(var(--sidebar-foreground)/.58)] hover:text-[hsl(var(--sidebar-foreground))]", collapsed && "md:hidden")} data-testid="link-switch-role">
             {operatorMode || userMode ? "Ir para administração" : "Visão do professor"}
           </Link>
          <button type="button" onClick={() => setCollapsed((value) => !value)} className="mt-4 hidden w-full items-center justify-center gap-2 text-xs text-[hsl(var(--sidebar-foreground)/.46)] hover:text-[hsl(var(--sidebar-foreground))] md:flex" data-testid="button-collapse-sidebar">
            {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /> Recolher menu</>}
          </button>
        </div>
      </aside>
      <div className={cx("min-h-[100dvh] transition-[padding] duration-300 md:pl-[248px]", collapsed && "md:pl-[76px]")}>
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.9)] px-5 backdrop-blur-md sm:px-8">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] md:hidden" aria-label="Abrir menu" data-testid="button-open-menu"><Menu size={21} /></button>
          <div className="hidden items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] md:flex"><span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" /> Sistema operacional <span className="mx-1 text-[hsl(var(--border))]">/</span> Campus Vila Nova</div>
          <div className="ml-auto flex items-center gap-3">
             <div className="hidden text-right sm:block"><p className="text-xs font-semibold">{operatorMode ? "TI" : userMode ? teacher.name : "Coordenação"}</p><p className="text-[11px] text-[hsl(var(--muted-foreground))]">{operatorMode ? "Área do TI" : userMode ? "Área do usuário" : "Administrador"}</p></div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid="text-user-avatar">CM</div>
            {(userMode || operatorMode) && <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" data-testid="button-logout"><LogOut size={15} /> Sair</button>}
          </div>
        </header>
        <main className="app-grid min-h-[calc(100dvh-76px)] px-5 py-7 sm:px-8 lg:px-10">{children}</main>
      </div>
      {mobileOpen && <button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[hsl(187_54%_17%/.32)] md:hidden" data-testid="button-menu-backdrop" />}
    </div>
  );
}