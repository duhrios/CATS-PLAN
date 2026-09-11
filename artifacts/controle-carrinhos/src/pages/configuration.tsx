import { AlertTriangle, CalendarX, Database, Factory, History, Trash2, Users, UserRound } from "lucide-react";
import { PageHeader, SectionCard, Button } from "@/components/app-ui";
import { useCampusData } from "@/lib/campus-data";

export function ConfigurationPage() {
  const { resetData } = useCampusData();
  const actions = [
    ["reservations", "Redefinir Agenda", "Apagar todos os agendamentos.", CalendarX],
    ["profiles", "Apagar todos os perfis", "Remover professores e usuários TI.", Users],
    ["history", "Apagar históricos", "Remover registros de movimentação.", History],
    ["teachers", "Apagar professores", "Remover apenas os perfis de professores.", UserRound],
    ["factory", "Restaurar padrões de fábrica", "Limpar configurações e dados, preservando este Super administrador.", Factory],
  ] as const;
  const run = (kind: typeof actions[number][0], label: string) => {
    if (window.confirm(`${label}? Esta ação não pode ser desfeita.`)) resetData(kind);
  };
  return <div className="animate-rise space-y-7">
    <PageHeader eyebrow="Acesso exclusivo · Super administrador" title="Configuração" description="Ações de manutenção do sistema. O Super administrador é preservado em qualquer redefinição." />
    <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.06)] p-4 text-sm"><AlertTriangle size={18} className="mt-0.5 text-[hsl(var(--destructive))]" /><p>As ações abaixo apagam dados locais permanentemente. Confirme somente quando necessário.</p></div>
    <SectionCard title="Manutenção de dados" eyebrow="Operações irreversíveis">
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {actions.map(([kind, label, description, Icon]) => <div key={kind} className="flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))] p-4"><div className="flex items-center gap-3"><Icon size={19} className="text-[hsl(var(--primary))]" /><div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p></div></div><Button size="sm" variant={kind === "factory" ? "danger" : "secondary"} onClick={() => run(kind, label)}><Trash2 size={14} /> Executar</Button></div>)}
      </div>
    </SectionCard>
  </div>;
}
