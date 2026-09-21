import { AlertTriangle, CalendarX, Database, Factory, History, Trash2, Users, UserRound } from "lucide-react";
import { PageHeader, SectionCard, Button, Field, Modal, inputClass } from "@/components/app-ui";
import { useState, type FormEvent } from "react";
import { useCampusData } from "@/lib/campus-data";
import TestViewPage from "@/pages/test-view";

export function ConfigurationPage() {
  const actions = [
    ["reservations", "Redefinir Agenda", "Apagar todos os agendamentos.", CalendarX],
    ["profiles", "Apagar todos os perfis", "Remover professores e usuários TI.", Users],
    ["history", "Apagar históricos", "Remover registros de movimentação.", History],
    ["teachers", "Apagar professores", "Remover apenas os perfis de professores.", UserRound],
    ["factory", "Restaurar padrões de fábrica", "Limpar configurações e dados, preservando este Super administrador.", Factory],
  ] as const;
  const { resetData, movementSettings, updateMovementSettings, campusSettings, updateCampusSettings, authenticateAdmin } = useCampusData();
  const [pendingAction, setPendingAction] = useState<typeof actions[number] | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const run = (action: typeof actions[number]) => {
    setPendingAction(action);
    setPassword("");
    setPasswordError("");
  };
  const confirmAction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction) return;
    const currentAdminName = window.localStorage.getItem("controle-carrinhos-admin-name") ?? "";
    const account = authenticateAdmin(currentAdminName, password);
    if (!account?.isSuperAdmin) {
      setPasswordError("Senha incorreta. Informe novamente a senha do administrador.");
      return;
    }
    const [, label] = pendingAction;
    if (window.confirm(`${label}? Esta ação não pode ser desfeita.`)) {
      resetData(pendingAction[0]);
      setPendingAction(null);
      setPassword("");
    }
  };
  return <div className="animate-rise space-y-7">
    <PageHeader eyebrow="Acesso exclusivo · Super administrador" title="Configuração" description="Ações de manutenção do sistema e validação rápida de fluxos do aplicativo." />
    <SectionCard title="Movimentação dos carrinhos" eyebrow="Configurações operacionais">
      <div className="grid max-w-2xl gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Intervalo do alerta (minutos)">
          <input type="number" min="1" max="60" value={movementSettings.alertIntervalMinutes} onChange={(event) => updateMovementSettings({ ...movementSettings, alertIntervalMinutes: Math.max(1, Number(event.target.value)) })} className={`${inputClass} h-9`} />
        </Field>
        <Field label="Repetições do alerta">
          <input type="number" min="1" max="10" value={movementSettings.alertRepeat} onChange={(event) => updateMovementSettings({ ...movementSettings, alertRepeat: Math.max(1, Number(event.target.value)) })} className={`${inputClass} h-9`} />
        </Field>
        <Field label="Aviso de movimentação antecipada (minutos)">
          <input type="number" min="1" max="120" disabled={!movementSettings.earlyWarningEnabled} value={movementSettings.earlyWarningMinutes} onChange={(event) => updateMovementSettings({ ...movementSettings, earlyWarningMinutes: Math.min(120, Math.max(1, Number(event.target.value))) })} className={`${inputClass} h-9`} />
        </Field>
        <label className="flex h-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] p-2 text-xs font-semibold">
          <input type="checkbox" checked={movementSettings.autoComplete} onChange={(event) => updateMovementSettings({ ...movementSettings, autoComplete: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Concluir automaticamente após o intervalo
        </label>
        <label className="flex h-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] p-2 text-xs font-semibold">
          <input type="checkbox" checked={movementSettings.earlyWarningEnabled} onChange={(event) => updateMovementSettings({ ...movementSettings, earlyWarningEnabled: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Avisar quando o TI movimentar o carrinho antecipadamente
        </label>
        <label className="flex h-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] p-2 text-xs font-semibold sm:col-span-2">
          <input type="checkbox" checked={movementSettings.allowCartATransitionScheduling} onChange={(event) => updateMovementSettings({ ...movementSettings, allowCartATransitionScheduling: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Permitir agendar o Carrinho A nos horários de transição (11:50 e 12:00)
        </label>
      </div>
    </SectionCard>
    <SectionCard title="Identidade e reservas" eyebrow="Configurações operacionais">
      <div className="grid max-w-2xl gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Nome do campus">
          <input value={campusSettings.campusName} onChange={(event) => updateCampusSettings({ ...campusSettings, campusName: event.target.value })} className={`${inputClass} h-9`} />
        </Field>
        <Field label="Nome do administrador">
          <input value={campusSettings.coordinatorName} onChange={(event) => updateCampusSettings({ ...campusSettings, coordinatorName: event.target.value })} className={`${inputClass} h-9`} placeholder="Nome da pessoa responsável" />
        </Field>
        <Field label="Nome da seção">
          <input value={campusSettings.agendaLabel} onChange={(event) => updateCampusSettings({ ...campusSettings, agendaLabel: event.target.value })} className={`${inputClass} h-9`} />
        </Field>
        <Field label="Limite de Chromebooks por reserva">
          <input type="number" min="1" value={campusSettings.reservationLimit} onChange={(event) => updateCampusSettings({ ...campusSettings, reservationLimit: Math.max(1, Number(event.target.value) || 1) })} className={`${inputClass} h-9`} />
        </Field>
        <label className="flex h-fit items-center gap-2 rounded-lg border border-[hsl(var(--border))] p-2 text-xs font-semibold sm:col-span-2">
          <input type="checkbox" checked={campusSettings.reservationsEnabled} onChange={(event) => updateCampusSettings({ ...campusSettings, reservationsEnabled: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Permitir reservas de Chromebooks
        </label>
        <p className="text-xs leading-5 text-[hsl(var(--muted-foreground))] sm:col-span-2">Quando a seleção dos códigos não for informada, o sistema separa automaticamente os últimos Chromebooks disponíveis.</p>
      </div>
    </SectionCard>
    <SectionCard title="Validação do projeto" eyebrow="Teste de navegação">
      <div className="p-4">
        <TestViewPage compact />
      </div>
    </SectionCard>
    <SectionCard title="Manutenção de dados" eyebrow="Operações irreversíveis">
      <div className="p-5">
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.06)] p-4 text-sm"><AlertTriangle size={18} className="mt-0.5 text-[hsl(var(--destructive))]" /><p>As ações abaixo apagam dados locais permanentemente. Confirme somente quando necessário.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => { const [kind, label, description, Icon] = action; return <div key={kind} className="flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))] p-4"><div className="flex items-center gap-3"><Icon size={19} className="text-[hsl(var(--primary))]" /><div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p></div></div><Button size="sm" variant={kind === "factory" ? "danger" : "secondary"} onClick={() => run(action)}><Trash2 size={14} /> Executar</Button></div>; })}
        </div>
      </div>
    </SectionCard>
    {pendingAction && <Modal title="Confirmar ação protegida" onClose={() => setPendingAction(null)}>
      <form className="space-y-5 p-5 sm:p-6" onSubmit={confirmAction}>
        <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">Digite novamente a senha do administrador para executar <strong>{pendingAction[1]}</strong>.</p>
        <Field label="Senha do administrador">
          <input autoFocus required type="password" value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(""); }} className={inputClass} />
        </Field>
        {passwordError && <p role="alert" className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">{passwordError}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setPendingAction(null)}>Cancelar</Button>
          <Button type="submit" variant={pendingAction[0] === "factory" ? "danger" : "primary"}><Trash2 size={14} /> Confirmar e executar</Button>
        </div>
      </form>
    </Modal>}
  </div>;
}
