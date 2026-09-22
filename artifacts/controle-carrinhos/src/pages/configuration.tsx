import { AlertTriangle, CalendarX, Clock3, Database, Factory, History, Plus, Trash2, Users, UserRound } from "lucide-react";
import { PageHeader, SectionCard, Button, Field, Modal, inputClass } from "@/components/app-ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { buildCartSchedule, useCampusData, type CartScheduleTemplate } from "@/lib/campus-data";
import TestViewPage from "@/pages/test-view";

export function ScheduleManagementPage() {
  const { carts, cartSchedules, updateCartSchedules, syncCartSchedules } = useCampusData();
  const cartNames = useMemo(() => carts.length ? carts.map((cart) => cart.name) : Object.keys(cartSchedules), [carts, cartSchedules]);
  const [selectedCart, setSelectedCart] = useState<string>(cartNames[0] ?? "Carrinho A");
  const [period, setPeriod] = useState<"Manhã" | "Tarde">("Manhã");
  const [draft, setDraft] = useState({ start: "07:00", end: "07:45", label: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncSource, setSyncSource] = useState<Record<string, boolean>>({});
  const [syncTarget, setSyncTarget] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!cartNames.includes(selectedCart) && cartNames.length) {
      setSelectedCart(cartNames[0]);
    }
  }, [cartNames, selectedCart]);

  useEffect(() => {
    const nextSource: Record<string, boolean> = {};
    const nextTarget: Record<string, boolean> = {};
    cartNames.forEach((cartName) => {
      nextSource[cartName] = cartName === selectedCart;
      nextTarget[cartName] = cartName !== selectedCart;
    });
    setSyncSource(nextSource);
    setSyncTarget(nextTarget);
  }, [cartNames, selectedCart]);

  const schedule = cartSchedules[selectedCart] ?? buildCartSchedule(selectedCart);
  const currentSlots = schedule[period] ?? [];

  const handleSave = () => {
    const start = draft.start;
    const end = draft.end;
    if (!start || !end || start >= end) return;
    const nextSlots = editingId
      ? currentSlots.map((slot) =>
          slot.id === editingId ? { ...slot, start, end, label: draft.label.trim() || undefined } : slot,
        )
      : [...currentSlots, { id: `slot-${Date.now()}`, start, end, label: draft.label.trim() || undefined }];
    updateCartSchedules(selectedCart, { ...schedule, [period]: nextSlots });
    setDraft({ start: "07:00", end: "07:45", label: "" });
    setEditingId(null);
  };

  const handleDelete = (slotId: string) => {
    updateCartSchedules(selectedCart, { ...schedule, [period]: currentSlots.filter((slot) => slot.id !== slotId) });
  };

  const handleSync = () => {
    const sources = cartNames.filter((name) => syncSource[name]);
    const targets = cartNames.filter((name) => syncTarget[name]);
    if (!sources.length || !targets.length) return;
    syncCartSchedules(sources, targets);
  };

  const toggleAll = (kind: "source" | "target", checked: boolean) => {
    const nextValues = Object.fromEntries(cartNames.map((name) => [name, checked]));
    if (kind === "source") setSyncSource(nextValues); else setSyncTarget(nextValues);
  };

  return (
    <div className="animate-rise space-y-7">
      <PageHeader eyebrow="Acesso exclusivo · Super Administrador" title="Horários" description="Gerencie os horários de cada carrinho, sincronize as faixas entre os veículos e mantenha a agenda escolar consistente." />
      <SectionCard title="Configuração por carrinho" eyebrow="Agenda operacional">
        <div className="grid gap-5 p-4 xl:grid-cols-[260px_1fr] xl:p-6">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Carrinho</p>
              <div className="space-y-2">
                {cartNames.map((cartName) => (
                  <button
                    key={cartName}
                    type="button"
                    onClick={() => setSelectedCart(cartName)}
                    className={cartName === selectedCart ? "w-full rounded-xl border border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] px-3 py-2 text-left text-sm font-semibold text-[hsl(var(--primary))]" : "w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-left text-sm font-medium text-[hsl(var(--foreground))]"}
                  >
                    {cartName}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Período</p>
              <div className="flex gap-2">
                {(["Manhã", "Tarde"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setPeriod(value)} className={period === value ? "flex-1 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-semibold text-[hsl(var(--primary-foreground))]" : "flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]"}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-2 text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
                <span>Início</span>
                <span>Fim</span>
                <span>Observação</span>
                <span>Ações</span>
              </div>
              {currentSlots.length ? currentSlots.map((slot) => (
                <div key={slot.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 border-b border-[hsl(var(--border))] px-3 py-3 last:border-b-0">
                  <span className="text-sm font-medium">{slot.start}</span>
                  <span className="text-sm font-medium">{slot.end}</span>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">{slot.label ?? "-"}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setEditingId(slot.id); setDraft({ start: slot.start, end: slot.end, label: slot.label ?? "" }); }} className="text-xs font-semibold text-[hsl(var(--primary))]">Editar</button>
                    <button type="button" onClick={() => handleDelete(slot.id)} className="text-xs font-semibold text-[hsl(var(--destructive))]">Excluir</button>
                  </div>
                </div>
              )) : <div className="p-5 text-sm text-[hsl(var(--muted-foreground))]">Nenhum horário cadastrado para este período.</div>}
            </div>

            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{editingId ? "Editar faixa" : "Adicionar faixa"}</p>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  Início
                  <input type="time" value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} className={`${inputClass} mt-1 h-10`} />
                </label>
                <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  Fim
                  <input type="time" value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} className={`${inputClass} mt-1 h-10`} />
                </label>
                <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] md:col-span-2">
                  Observação
                  <input value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Opcional" className={`${inputClass} mt-1 h-10`} />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                {editingId && <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setDraft({ start: "07:00", end: "07:45", label: "" }); }}>Cancelar</Button>}
                <Button type="button" onClick={handleSave}>
                  <span className="inline-flex items-center gap-2"><Plus size={14} /> {editingId ? "Salvar alterações" : "Adicionar horário"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Sincronizar carrinhos" eyebrow="Replicar horários">
        <div className="space-y-4 p-4 xl:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Origem</p>
                <button type="button" onClick={() => toggleAll("source", true)} className="text-xs font-semibold text-[hsl(var(--primary))]">Todos</button>
              </div>
              <div className="space-y-2">
                {cartNames.map((cartName) => (
                  <label key={`source-${cartName}`} className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm">
                    <input type="checkbox" checked={Boolean(syncSource[cartName])} onChange={(event) => setSyncSource((current) => ({ ...current, [cartName]: event.target.checked }))} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    {cartName}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Destino</p>
                <button type="button" onClick={() => toggleAll("target", true)} className="text-xs font-semibold text-[hsl(var(--primary))]">Todos</button>
              </div>
              <div className="space-y-2">
                {cartNames.map((cartName) => (
                  <label key={`target-${cartName}`} className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm">
                    <input type="checkbox" checked={Boolean(syncTarget[cartName])} onChange={(event) => setSyncTarget((current) => ({ ...current, [cartName]: event.target.checked }))} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    {cartName}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={handleSync}><span className="inline-flex items-center gap-2"><Clock3 size={14} /> Sincronizar horários</span></Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

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
    <SectionCard title="Identidade do colégio" eyebrow="Configurações operacionais">
      <div className="grid max-w-2xl gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Nome do colégio">
          <input value={campusSettings.campusName} onChange={(event) => updateCampusSettings({ ...campusSettings, campusName: event.target.value })} className={`${inputClass} h-9`} />
        </Field>
        <Field label="Nome do administrador">
          <input value={campusSettings.coordinatorName} onChange={(event) => updateCampusSettings({ ...campusSettings, coordinatorName: event.target.value })} className={`${inputClass} h-9`} placeholder="Nome da pessoa responsável" />
        </Field>
        <Field label="Nome da seção">
          <input value={campusSettings.agendaLabel} onChange={(event) => updateCampusSettings({ ...campusSettings, agendaLabel: event.target.value })} className={`${inputClass} h-9`} />
        </Field>
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
