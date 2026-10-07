import {
  Activity,
  CalendarDays,
  ChevronRight,
  Clock3,
  DoorOpen,
  GripVertical,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Router,
  Table2,
  UserRound,
  X,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { cx } from "@/components/app-ui";
import { useCampusData } from "@/lib/campus-data";
import { endAuthSession, getAuthenticatedSession } from "@/lib/auth-session";
import { requestSharedReservationsRefresh } from "@/lib/reservations-api";
import { loadTeacherSpreadsheetEnabled } from "@/lib/teacher-spreadsheet";

const adminNavItems = [
  { href: "/admin", label: "Visão do dia", icon: LayoutDashboard },
  { href: "/reservas", label: "Reservas", icon: CalendarDays },
  { href: "/carrinhos", label: "Carrinhos", icon: Router },
  { href: "/salas", label: "Salas", icon: DoorOpen },
  { href: "/professores", label: "Usuários", icon: UserRound },
  { href: "/wifi", label: "Pontos Wi-Fi", icon: Network },
  { href: "/historico", label: "Histórico", icon: Activity },
  { href: "/visao-planilha", label: "Visão - Planilha", icon: Table2 },
];
const superAdminNavItems = [
  { href: "/configuracao", label: "Configuração", icon: Settings },
  { href: "/configuracao/horarios", label: "Horários", icon: Clock3 },
];

const userNavItems = [
  { href: "/usuario", label: "Visão do dia", icon: LayoutDashboard },
  { href: "/usuario/reservas", label: "Minhas reservas", icon: CalendarDays },
  { href: "/usuario/perfil", label: "Meu perfil", icon: UserRound },
];
const teacherSpreadsheetNavItem = {
  href: "/visao-planilha",
  label: "Visão - Planilha",
  icon: Table2,
};
const operatorNavItems = [
  { href: "/operador", label: "Visão do Dia", icon: LayoutDashboard },
  { href: "/reservas", label: "Reserva", icon: CalendarDays },
  { href: "/salas", label: "Salas", icon: DoorOpen },
  { href: "/wifi", label: "Pontos - Wifi", icon: Network },
  { href: "/visao-planilha", label: "Visão - Planilha", icon: Table2 },
  { href: "/operador/configuracao", label: "Configuração", icon: Settings },
];

export function AppShell({
  children,
  role = "admin",
}: {
  children: React.ReactNode;
  role?: "admin" | "user" | "operator";
}) {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const { teacher, campusSettings, reservationsSyncError } = useCampusData();
  const [collapsed, setCollapsed] = useState(
    () =>
      window.localStorage.getItem("controle-carrinhos-sidebar-collapsed") ===
      "true",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [teacherSpreadsheetEnabled, setTeacherSpreadsheetEnabled] = useState(false);
  const [teacherSpreadsheetSettingsError, setTeacherSpreadsheetSettingsError] = useState("");
  const userMode = role === "user";
  const operatorMode = role === "operator";
  const isSuperAdmin =
    !operatorMode &&
    !userMode &&
    getAuthenticatedSession()?.isSuperAdmin === true;
  useEffect(() => {
    if (!userMode) {
      setTeacherSpreadsheetEnabled(false);
      setTeacherSpreadsheetSettingsError("");
      return;
    }
    let active = true;
    const refreshTeacherSpreadsheetSetting = () => {
      void loadTeacherSpreadsheetEnabled()
        .then((enabled) => {
          if (!active) return;
          setTeacherSpreadsheetEnabled(enabled);
          setTeacherSpreadsheetSettingsError("");
        })
        .catch((error: unknown) => {
          if (!active) return;
          setTeacherSpreadsheetEnabled(false);
          setTeacherSpreadsheetSettingsError(
            error instanceof Error
              ? error.message
              : "Não foi possível consultar a disponibilidade da visão rápida.",
          );
        });
    };
    refreshTeacherSpreadsheetSetting();
    const interval = window.setInterval(refreshTeacherSpreadsheetSetting, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [userMode]);
  const navItems = operatorMode
    ? operatorNavItems
    : userMode
      ? teacherSpreadsheetEnabled
        ? [...userNavItems, teacherSpreadsheetNavItem]
        : userNavItems
      : isSuperAdmin
        ? [...adminNavItems, ...superAdminNavItems]
        : adminNavItems;
  const navOrderKey = `controle-carrinhos-menu-order:${role}`;
  const [menuOrder, setMenuOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem(navOrderKey) ?? "[]",
      ) as string[];
    } catch {
      return [];
    }
  });
  const [draggedMenuItem, setDraggedMenuItem] = useState<string | null>(null);
  const orderedNavItems = [...navItems].sort((a, b) => {
    const aIndex = menuOrder.indexOf(a.href);
    const bIndex = menuOrder.indexOf(b.href);
    return (
      (aIndex < 0 ? navItems.length : aIndex) -
      (bIndex < 0 ? navItems.length : bIndex)
    );
  });
  const moveMenuItem = (targetHref: string) => {
    if (!draggedMenuItem || draggedMenuItem === targetHref) return;
    const current = orderedNavItems.map((item) => item.href);
    const sourceIndex = current.indexOf(draggedMenuItem);
    const targetIndex = current.indexOf(targetHref);
    if (sourceIndex < 0 || targetIndex < 0) return;
    current.splice(sourceIndex, 1);
    current.splice(targetIndex, 0, draggedMenuItem);
    setMenuOrder(current);
    window.localStorage.setItem(navOrderKey, JSON.stringify(current));
    setDraggedMenuItem(null);
  };
  const signOut = () => {
    void endAuthSession()
      .then(() => setLocation(
        userMode ? "/login" : operatorMode ? "/operador/login" : "/admin/login",
      ))
      .catch((error: unknown) => console.error("Não foi possível encerrar a sessão no servidor.", error));
  };
  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(
        "controle-carrinhos-sidebar-collapsed",
        String(next),
      );
      return next;
    });
  };
  const refreshPage = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await requestSharedReservationsRefresh();
    } catch (error) {
      console.error(
        "Não foi possível atualizar os agendamentos.",
        error,
      );
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-transform duration-300 md:translate-x-0",
          collapsed ? "md:w-[76px]" : "md:w-[248px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[76px] items-center justify-between border-b border-[hsl(var(--sidebar-border))] px-5">
          <Link
            href={operatorMode ? "/operador" : userMode ? "/usuario" : "/admin"}
            onClick={() => setMobileOpen(false)}
            className={cx("flex items-center gap-3", collapsed && "md:mx-auto")}
            data-testid="link-brand"
          >
            <img
              src="/brand-logo.png"
              alt=""
              className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-[0_10px_20px_rgba(0,0,0,0.18)]"
            />
            <span className={cx("leading-tight", collapsed && "md:hidden")}>
              <strong className="block font-display text-[15px] tracking-tight">
                Controle
              </strong>
              <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[hsl(var(--sidebar-foreground)/.58)]">
                de carrinhos
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-[hsl(var(--sidebar-foreground)/.6)] md:hidden"
            aria-label="Fechar menu"
            data-testid="button-close-menu"
          >
            <X size={19} />
          </button>
        </div>
        <div className="px-3 py-6">
          <p
            className={cx(
              "mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.42)]",
              collapsed && "md:hidden",
            )}
          >
            {operatorMode
              ? "Área do TI"
              : userMode
                ? "Área do professor"
                : "Administração"}
          </p>
          <nav className="space-y-1">
            {orderedNavItems.map(({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  draggable
                  onDragStart={() => setDraggedMenuItem(href)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveMenuItem(href)}
                  data-testid={`link-nav-${label.toLowerCase().replaceAll(" ", "-")}`}
                  className={cx(
                    "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))]"
                      : "text-[hsl(var(--sidebar-foreground)/.67)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]",
                    collapsed && "md:justify-center",
                  )}
                >
                  <Icon
                    size={18}
                    strokeWidth={active ? 2.2 : 1.8}
                    className={
                      active ? "text-[hsl(var(--sidebar-primary))]" : ""
                    }
                  />
                  <span className={cx(collapsed && "md:hidden")}>{label}</span>
                  {!collapsed && (
                    <GripVertical
                      size={13}
                      className="ml-auto opacity-40"
                      aria-hidden="true"
                    />
                  )}
                  {active && (
                    <ChevronRight
                      size={14}
                      className={cx(
                        "ml-auto text-[hsl(var(--sidebar-primary))]",
                        collapsed && "md:hidden",
                      )}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          {userMode && teacherSpreadsheetSettingsError && (
            <p role="alert" className="mt-3 px-3 text-xs text-[hsl(var(--destructive))]">
              {teacherSpreadsheetSettingsError}
            </p>
          )}
        </div>
        <div className={cx("mt-auto p-4", collapsed && "md:p-3")}>
          <div
            className={cx(
              "rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.65)] p-4",
              collapsed && "md:hidden",
            )}
          >
            <div className="mb-2 flex items-center gap-2 text-[hsl(var(--sidebar-primary))]">
              <span className="h-2 w-2 rounded-full bg-[hsl(var(--sidebar-primary))]" />
              <span className="text-[10px] font-bold uppercase tracking-[.14em]">
                Central de operação
              </span>
            </div>
            <p className="text-xs leading-5 text-[hsl(var(--sidebar-foreground)/.65)]">
              {operatorMode
                ? "Mova os carrinhos e confirme cada entrega."
                : userMode
                  ? "Consulte sua agenda e reserve um carrinho antecipadamente."
                  : "Acompanhe a disponibilidade e o sinal antes do primeiro período."}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              operatorMode
                ? setLocation("/admin/login")
                : userMode
                  ? setLocation("/usuario")
                  : setLocation("/operador/login")
            }
            className={cx(
              "mt-4 flex w-full items-center justify-center text-xs font-semibold text-[hsl(var(--sidebar-foreground)/.58)] hover:text-[hsl(var(--sidebar-foreground))]",
              collapsed && "md:hidden",
            )}
            data-testid="button-switch-role"
          >
            {operatorMode
              ? "Ir para administração"
              : userMode
                ? "Visão do professor"
                : "Visão do TI"}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            className="mt-4 hidden w-full items-center justify-center gap-2 text-xs text-[hsl(var(--sidebar-foreground)/.46)] hover:text-[hsl(var(--sidebar-foreground))] md:flex"
            data-testid="button-collapse-sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <>
                <PanelLeftClose size={16} /> Recolher menu
              </>
            )}
          </button>
        </div>
      </aside>
      <div
        className={cx(
          "min-h-[100dvh] transition-[padding] duration-300 md:pl-[248px]",
          collapsed && "md:pl-[76px]",
        )}
      >
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.9)] px-5 backdrop-blur-md sm:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] md:hidden"
            aria-label="Abrir menu"
            data-testid="button-open-menu"
          >
            <Menu size={21} />
          </button>
          <div className="hidden items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] md:flex">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" />{" "}
            {campusSettings.agendaLabel}
            {campusSettings.campusName && (
              <>
                <span className="mx-1 text-[hsl(var(--border))]">/</span>
                {campusSettings.campusName}
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => void refreshPage()}
              disabled={refreshing}
              aria-label="Atualizar dados"
              title="Atualizar dados sem recarregar a página"
              data-testid="button-refresh-page"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-semibold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              <span className="hidden sm:inline">
                {refreshing ? "Atualizando..." : "Atualizar dados"}
              </span>
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold">
                {operatorMode
                  ? "TI"
                  : userMode
                    ? teacher.name
                    : "Administrador"}
              </p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                {operatorMode
                  ? "Área do TI"
                  : userMode
                    ? "Área do usuário"
                    : "Administrador"}
              </p>
            </div>
            <div
              className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--primary))] text-xs font-bold text-[hsl(var(--primary-foreground))]"
              data-testid="text-user-avatar"
            >
              CM
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
              data-testid="button-logout"
            >
              <LogOut size={15} />{" "}
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>
        {reservationsSyncError && (
          <div
            role="alert"
            className="mx-5 mt-4 rounded-xl border border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.08)] px-4 py-3 text-sm text-[hsl(var(--destructive))] sm:mx-8 lg:mx-10"
            data-testid="alert-shared-agenda-error"
          >
            {reservationsSyncError}
          </div>
        )}
        <main className="app-grid min-h-[calc(100dvh-76px)] px-5 py-7 sm:px-8 lg:px-10">
          {children}
        </main>
      </div>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-[hsl(187_54%_17%/.32)] md:hidden"
          data-testid="button-menu-backdrop"
        />
      )}
    </div>
  );
}
