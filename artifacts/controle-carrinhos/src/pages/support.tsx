import { Check, MessageSquareText, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Modal, PageHeader, SectionCard, StatusPill, inputClass } from "@/components/app-ui";
import { getAuthenticatedSession } from "@/lib/auth-session";
import {
  createSupportTicket,
  deleteSupportTicket,
  loadSupportTickets,
  updateSupportTicket,
  type SupportTicket,
} from "@/lib/support-api";

export function SupportPage({ admin = false }: { admin?: boolean }) {
  const session = getAuthenticatedSession();
  const canSubmit = session?.role === "user" || session?.role === "operator";
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    category: "Bug" as SupportTicket["category"],
    title: "",
    message: "",
  });
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [responseForm, setResponseForm] = useState({
    status: "Respondido" as SupportTicket["status"],
    adminResponse: "",
  });

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setTickets(await loadSupportTickets());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o suporte.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createSupportTicket(form);
      setForm({ category: "Bug", title: "", message: "" });
      setModalOpen(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o chamado.");
    } finally {
      setSaving(false);
    }
  };

  const openResponse = (ticket: SupportTicket) => {
    setSelectedId(ticket.id);
    setResponseForm({
      status: ticket.status === "Pendente" ? "Respondido" : ticket.status,
      adminResponse: ticket.adminResponse ?? "",
    });
    setError("");
  };

  const saveResponse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError("");
    try {
      await updateSupportTicket(selectedId, responseForm);
      setSelectedId(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível responder.");
    } finally {
      setSaving(false);
    }
  };

  const removeTicket = async (ticket: SupportTicket) => {
    if (!admin || ticket.status === "Pendente" || !ticket.adminResponse?.trim()) return;
    if (!window.confirm(`Excluir o chamado "${ticket.title}"? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteSupportTicket(ticket.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o chamado.");
    } finally {
      setSaving(false);
    }
  };

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId);

  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Central de atendimento"
        title="Suporte"
        description={
          admin
            ? "Visualize relatórios de bugs, dúvidas e sugestões enviadas pelos professores e pelo TI."
            : "Envie bugs, dúvidas ou sugestões diretamente para a administração."
        }
        action={canSubmit
          ? <Button onClick={() => { setError(""); setModalOpen(true); }}><Plus size={16} /> Novo chamado</Button>
          : undefined}
      />
      {error && <p role="alert" className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm font-semibold text-[hsl(var(--destructive))]">{error}</p>}
      {loading
        ? <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">Carregando chamados...</p>
        : tickets.length === 0
          ? <SectionCard title="Nenhum chamado" eyebrow="Suporte">
              <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">
                {canSubmit ? "Você ainda não enviou solicitações ao suporte." : "Não há chamados pendentes."}
              </div>
            </SectionCard>
          : <div className="grid gap-4 lg:grid-cols-2">
              {tickets.map((ticket) => (
                <article key={ticket.id} className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{ticket.category}</p>
                      <h2 className="mt-1 break-words font-display text-lg font-semibold">{ticket.title}</h2>
                    </div>
                    <StatusPill status={ticket.status} />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[hsl(var(--muted-foreground))]">{ticket.message}</p>
                  {ticket.adminResponse && (
                    <div className="mt-4 rounded-xl border border-[hsl(var(--primary)/.18)] bg-[hsl(var(--primary)/.05)] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--primary))]">Resposta da administração</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{ticket.adminResponse}</p>
                      {ticket.respondedBy && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Respondido por {ticket.respondedBy}</p>}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-3">
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {ticket.senderRole === "operator" ? "TI" : ticket.senderRole === "user" ? "Professor" : "Administrador"} · {ticket.senderName}
                    </p>
                    {admin && <div className="flex items-center gap-2">
                      {ticket.status !== "Pendente" && ticket.adminResponse?.trim() && (
                        <Button size="sm" variant="danger" disabled={saving} onClick={() => void removeTicket(ticket)} data-testid={`button-delete-support-ticket-${ticket.id}`}>
                          <Trash2 size={14} /> Excluir
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" disabled={saving} onClick={() => openResponse(ticket)}><MessageSquareText size={14} /> Responder</Button>
                    </div>}
                  </div>
                </article>
              ))}
            </div>}
      {modalOpen && <Modal title="Novo chamado" onClose={() => !saving && setModalOpen(false)}>
        <form className="space-y-4 p-5 sm:p-6" onSubmit={submitTicket}>
          <Field label="Tipo">
            <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SupportTicket["category"] })} className={inputClass}>
              <option>Bug</option>
              <option>Sugestão</option>
              <option>Dúvida</option>
            </select>
          </Field>
          <Field label="Assunto">
            <input required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} placeholder="Resumo do problema ou sugestão" />
          </Field>
          <Field label="Descrição">
            <textarea required minLength={10} maxLength={3000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className={`${inputClass} min-h-32 py-3`} placeholder="Explique o que aconteceu, em qual tela e o que esperava..." />
          </Field>
          <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}><Send size={15} /> {saving ? "Enviando..." : "Enviar chamado"}</Button>
          </div>
        </form>
      </Modal>}
      {selectedTicket && <Modal title={`Responder chamado: ${selectedTicket.title}`} onClose={() => !saving && setSelectedId(null)}>
        <form className="space-y-4 p-5 sm:p-6" onSubmit={saveResponse}>
          <Field label="Situação">
            <select value={responseForm.status} onChange={(event) => setResponseForm({ ...responseForm, status: event.target.value as SupportTicket["status"] })} className={inputClass}>
              <option>Pendente</option>
              <option>Respondido</option>
              <option>Resolvido</option>
            </select>
          </Field>
          <Field label="Resposta">
            <textarea required={responseForm.status !== "Pendente"} minLength={responseForm.status === "Pendente" ? undefined : 3} maxLength={3000} value={responseForm.adminResponse} onChange={(event) => setResponseForm({ ...responseForm, adminResponse: event.target.value })} className={`${inputClass} min-h-32 py-3`} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
            <Button type="button" variant="ghost" onClick={() => setSelectedId(null)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}><Check size={15} /> {saving ? "Salvando..." : "Salvar resposta"}</Button>
          </div>
        </form>
      </Modal>}
    </div>
  );
}
