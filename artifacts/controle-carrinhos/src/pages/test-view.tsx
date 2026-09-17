import {
  ArrowRight,
  BadgeCheck,
  CalendarRange,
  Clock3,
  Database,
  LayoutDashboard,
  MonitorSmartphone,
  Network,
  Router,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { Button, PageHeader, SectionCard, StatusPill, cx } from "@/components/app-ui";

const sections = [
  {
    href: "/admin",
    label: "Administração",
    summary: "Visão geral do dia, reservas e operação central.",
    icon: LayoutDashboard,
    status: "Operacional",
  },
  {
    href: "/reservas",
    label: "Reservas",
    summary: "Agenda, filtros por data e confirmação de movimentações.",
    icon: MonitorSmartphone,
    status: "Ativa",
  },
  {
    href: "/carrinhos",
    label: "Carrinhos",
    summary: "Acompanhamento dos equipamentos e estados por sala.",
    icon: Router,
    status: "Em uso",
  },
  {
    href: "/wifi",
    label: "Pontos Wi‑Fi",
    summary: "Monitoramento de salas e cobertura por ponto fixo.",
    icon: Network,
    status: "Cobertura",
  },
  {
    href: "/salas",
    label: "Salas",
    summary: "Cadastro de salas, disponibilidade e detalhes de ambiente.",
    icon: ShieldCheck,
    status: "Disponível",
  },
  {
    href: "/historico",
    label: "Histórico",
    summary: "Movimentações concluídas, filtros e registro de ações.",
    icon: Database,
    status: "Registro",
  },
  {
    href: "/professores",
    label: "Usuários",
    summary: "Perfis de professor, TI e admin com edição e gestão de acesso.",
    icon: Users,
    status: "Gerência",
  },
  {
    href: "/operador",
    label: "TI",
    summary: "Visão do dia do TI, alarme e movimentação em andamento.",
    icon: BadgeCheck,
    status: "TI",
  },
  {
    href: "/operador/configuracao",
    label: "Configuração do TI",
    summary: "Volume, vibração, toque padrão e tempo de notificação.",
    icon: Settings,
    status: "Alarme",
  },
  {
    href: "/configuracao",
    label: "Configuração do SA",
    summary: "Manutenção do sistema e validação de testes do ambiente.",
    icon: Clock3,
    status: "Super",
  },
  {
    href: "/usuario",
    label: "Professor",
    summary: "Acesso do professor para ver reservas e perfil.",
    icon: Users,
    status: "Perfil",
  },
  {
    href: "/login",
    label: "Login do professor",
    summary: "Acesso e identificação do usuário professor.",
    icon: CalendarRange,
    status: "Login",
  },
];

const checks = [
  { label: "Visão administrativa", href: "/admin" },
  { label: "Reservas e filtros", href: "/reservas" },
  { label: "Movimentação de carrinhos", href: "/carrinhos" },
  { label: "Pontos Wi‑Fi e salas", href: "/wifi" },
  { label: "Usuários e perfis", href: "/professores" },
  { label: "Operação do TI e alarme", href: "/operador" },
  { label: "Histórico e manutenção", href: "/historico" },
];

export default function TestViewPage({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-6 pb-8">
      {!compact && (
        <PageHeader
          eyebrow="QA / visualização"
          title="Tela de teste"
          description="Página de revisão rápida para validar a aparência e os principais fluxos do sistema antes de continuar as mudanças."
          action={
            <Link href="/admin">
              <Button variant="primary" className="gap-2">
                Abrir visão principal
                <ArrowRight size={16} />
              </Button>
            </Link>
          }
        />
      )}

      <SectionCard title="Resumo da aplicação" eyebrow="Status geral">
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Sistema</p>
            <p className="mt-3 text-2xl font-display font-semibold">Controle</p>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">de carrinhos e salas</p>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Ambientes</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status="Operacional" label="Admin" />
              <StatusPill status="TI" label="TI" />
              <StatusPill status="Perfil" label="Professor" />
            </div>
          </div>
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Ações rápidas</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/operador"><Button variant="secondary" size="sm">TI</Button></Link>
              <Link href="/usuario"><Button variant="secondary" size="sm">Professor</Button></Link>
              <Link href="/wifi"><Button variant="secondary" size="sm">Wi‑Fi</Button></Link>
              <Link href="/configuracao"><Button variant="secondary" size="sm">Super admin</Button></Link>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Checklist de validação" eyebrow="Fluxos críticos">
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {checks.map(({ label, href }) => (
            <Link key={label} href={href} className="group flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 text-sm transition-colors hover:border-[hsl(var(--primary)/.45)] hover:bg-[hsl(var(--primary)/.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--primary)/.14)] text-[hsl(var(--primary))]">
                <BadgeCheck size={14} />
              </span>
              <span className="group-hover:text-[hsl(var(--primary))]">{label}</span>
            </Link>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Fluxos principais" eyebrow="Navegação visual">
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          {sections.map(({ href, label, summary, icon: Icon, status }) => (
            <Link key={href} href={href} className="block">
              <div className={cx(
                "group rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.4)] hover:shadow-[0_12px_30px_hsl(187_42%_18%/.06)]",
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]">
                      <Icon size={20} />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">{label}</h3>
                      <p className="text-sm text-[hsl(var(--muted-foreground))]">{summary}</p>
                    </div>
                  </div>
                  <StatusPill status={status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
