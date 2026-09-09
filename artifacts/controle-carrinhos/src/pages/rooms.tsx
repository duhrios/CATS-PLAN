import { useState } from "react";
import { CalendarDays, Check, DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Field, IconButton, Modal, PageHeader, SectionCard, inputClass } from "@/components/app-ui";
import { segments, type Segment } from "@/lib/campus-data";
import { type Room, useRoomDirectory } from "@/lib/room-directory";

const splitClasses = (value: string) => value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
const cleanRoomNumber = (value: string) => value.trim().replace(/^sala\s*/i, "");
const emptyForm = { number: "", segment: "Fundamental 2" as Segment, morningClasses: "", afternoonClasses: "" };

export function RoomsPage() {
  const { rooms, addRoom, updateRoom, deleteRoom, deleteRooms } = useRoomDirectory();
  const orderedRooms = [...rooms].sort((first, second) => Number(first.number) - Number(second.number));
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const closeModal = () => {
    setModalOpen(false);
    setError("");
    setEditingId(null);
    setForm(emptyForm);
  };

  const openAddModal = () => {
    setError("");
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (room: Room) => {
    setError("");
    setEditingId(room.id);
    setForm({
      number: room.number,
      segment: room.segment,
      morningClasses: room.morningClasses.join("\n"),
      afternoonClasses: room.afternoonClasses.join("\n"),
    });
    setModalOpen(true);
  };

  const saveRoom = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const number = cleanRoomNumber(form.number);
    if (!number) {
      setError("Informe o número da sala.");
      return;
    }
    const roomData = {
      number,
      segment: form.segment,
      morningClasses: splitClasses(form.morningClasses),
      afternoonClasses: splitClasses(form.afternoonClasses),
    };
    const saved = editingId ? updateRoom(editingId, roomData) : addRoom(roomData);
    if (!saved) {
      setError("Esse número já está cadastrado em outra sala. Use outro número.");
      return;
    }
    closeModal();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteRoom(deleteTarget.id);
    setDeleteTarget(null);
  };

  const toggleSelectionMode = () => {
    setSelectionMode((active) => !active);
    setSelectedIds(new Set());
  };

  const toggleRoomSelection = (roomId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const selectAllRooms = () => {
    setSelectedIds((current) => current.size === orderedRooms.length ? new Set() : new Set(orderedRooms.map((room) => room.id)));
  };

  const confirmBulkDelete = () => {
    deleteRooms([...selectedIds]);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setBulkDeleteOpen(false);
  };

  const periodLabel = (room: Room) => {
    const hasMorning = room.morningClasses.length > 0;
    const hasAfternoon = room.afternoonClasses.length > 0;
    if (hasMorning && hasAfternoon) return "2 períodos";
    if (hasMorning) return "Manhã";
    if (hasAfternoon) return "Tarde";
    return "Sem turma cadastrada";
  };

  return (
    <div className="animate-rise space-y-7">
       <PageHeader
        eyebrow="Cadastro administrativo"
        title="Salas"
        description="Cadastre os números e informe quais turmas usam cada sala em cada período."
        action={<Button onClick={openAddModal} data-testid="button-new-room"><Plus size={16} /> Adicionar sala</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Salas cadastradas</p><p className="mt-4 font-display text-3xl font-semibold">{rooms.length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Disponíveis para reservas</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Turmas pela manhã</p><p className="mt-4 font-display text-3xl font-semibold">{rooms.reduce((total, room) => total + room.morningClasses.length, 0)}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">O primeiro período</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Turmas à tarde</p><p className="mt-4 font-display text-3xl font-semibold">{rooms.reduce((total, room) => total + room.afternoonClasses.length, 0)}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">O segundo período</p></div>
      </div>
       <SectionCard
         title="Mapa de salas"
         eyebrow="Turmas por período"
         action={rooms.length > 0 && <Button size="sm" variant={selectionMode ? "secondary" : "ghost"} onClick={toggleSelectionMode} data-testid="button-toggle-room-selection">{selectionMode ? "Cancelar seleção" : "Selecionar"}</Button>}
       >
         {selectionMode && rooms.length > 0 && <div className="flex flex-col gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.28)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6" data-testid="room-selection-toolbar">
           <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
             <input type="checkbox" checked={selectedIds.size === orderedRooms.length} onChange={selectAllRooms} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-select-all-rooms" />
             Selecionar todas
           </label>
           <div className="flex items-center gap-3">
             <span className="text-xs text-[hsl(var(--muted-foreground))]">{selectedIds.size} selecionada{selectedIds.size === 1 ? "" : "s"}</span>
             <Button size="sm" variant="danger" disabled={selectedIds.size === 0} onClick={() => setBulkDeleteOpen(true)} data-testid="button-delete-selected-rooms"><Trash2 size={14} /> Excluir selecionadas</Button>
           </div>
         </div>}
         {rooms.length === 0 ? <EmptyState title="Nenhuma sala cadastrada" message="Adicione uma sala para começar a relacionar turmas e períodos." action={<Button size="sm" onClick={openAddModal}><Plus size={14} /> Adicionar sala</Button>} /> : <div className="grid gap-px bg-[hsl(var(--border))] sm:grid-cols-2">{orderedRooms.map((room) => <article key={room.id} className={`relative bg-[hsl(var(--card))] p-5 sm:p-6 ${selectionMode && selectedIds.has(room.id) ? "bg-[hsl(var(--primary)/.045)]" : ""}`} data-testid={`card-room-${room.number}`}>
           {selectionMode && <label className="absolute left-5 top-5 z-10 flex cursor-pointer items-center" aria-label={`Selecionar sala ${room.number}`}><input type="checkbox" checked={selectedIds.has(room.id)} onChange={() => toggleRoomSelection(room.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid={`checkbox-room-${room.number}`} /></label>}
           <div className={`flex items-start justify-between gap-4 ${selectionMode ? "pl-7" : ""}`}><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><DoorOpen size={19} /></span><div><p className="font-display text-lg font-semibold">Sala {room.number}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{room.segment} · aparece automaticamente nas reservas</p></div></div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]"><CalendarDays size={12} /> {periodLabel(room)}</span><IconButton label={`Editar sala ${room.number}`} onClick={() => openEditModal(room)}><Pencil size={15} /></IconButton><IconButton label={`Excluir sala ${room.number}`} variant="danger" onClick={() => setDeleteTarget(room)}><Trash2 size={15} /></IconButton></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[hsl(var(--muted)/.55)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Manhã</p>{room.morningClasses.length > 0 ? <ul className="mt-2 space-y-1.5">{room.morningClasses.map((className) => <li key={className} className="text-xs font-medium" data-testid={`text-room-morning-${room.number}`}>{className}</li>)}</ul> : <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Sem turma cadastrada</p>}</div><div className="rounded-xl bg-[hsl(var(--muted)/.55)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Tarde</p>{room.afternoonClasses.length > 0 ? <ul className="mt-2 space-y-1.5">{room.afternoonClasses.map((className) => <li key={className} className="text-xs font-medium" data-testid={`text-room-afternoon-${room.number}`}>{className}</li>)}</ul> : <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Sem turma cadastrada</p>}</div></div></article>)}</div>}
      </SectionCard>
       {modalOpen && <Modal title={editingId ? "Editar sala" : "Adicionar sala"} onClose={closeModal}><form className="space-y-5 p-5 sm:p-6" onSubmit={saveRoom} data-testid="form-room"><Field label="Número da sala" hint="Você pode informar apenas o número ou escrever Sala 14."><input required value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} className={inputClass} placeholder="Ex.: 14" data-testid="input-room-number" /></Field><Field label="Seguimento da sala" hint="Professores só verão salas do seu seguimento."><select value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value as Segment })} className={inputClass} data-testid="select-room-segment">{segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select></Field><Field label="Turmas da manhã" hint="Uma turma por linha. Ex.: 7º ano A · Matemática"><textarea value={form.morningClasses} onChange={(event) => setForm({ ...form, morningClasses: event.target.value })} className={`${inputClass} min-h-24 py-2`} placeholder={"7º ano A · Matemática\n8º ano B · Ciências"} data-testid="textarea-room-morning" /></Field><Field label="Turmas da tarde" hint="A mesma sala pode receber outras séries neste período."><textarea value={form.afternoonClasses} onChange={(event) => setForm({ ...form, afternoonClasses: event.target.value })} className={`${inputClass} min-h-24 py-2`} placeholder={"6º ano A · Português\n9º ano B · Geografia"} data-testid="textarea-room-afternoon" /></Field>{error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--destructive))]" data-testid="text-room-error">{error}</p>}<div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4"><Button variant="ghost" onClick={closeModal} data-testid="button-cancel-room">Cancelar</Button><Button type="submit" data-testid="button-save-room"><Check size={15} /> {editingId ? "Salvar alterações" : "Adicionar sala"}</Button></div></form></Modal>}
      {deleteTarget && <Modal title="Excluir sala?" onClose={() => setDeleteTarget(null)}><div className="space-y-5 p-5 sm:p-6"><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">A sala <strong className="text-[hsl(var(--foreground))]">Sala {deleteTarget.number}</strong> e as turmas dos dois períodos serão removidas do cadastro. Essa ação não pode ser desfeita.</p><div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4"><Button variant="ghost" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete-room">Cancelar</Button><Button variant="danger" onClick={confirmDelete} data-testid="button-confirm-delete-room"><Trash2 size={15} /> Excluir sala</Button></div></div></Modal>}
       {bulkDeleteOpen && <Modal title="Excluir salas selecionadas?" onClose={() => setBulkDeleteOpen(false)}><div className="space-y-5 p-5 sm:p-6"><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">As <strong className="text-[hsl(var(--foreground))]">{selectedIds.size} salas selecionadas</strong> e as turmas dos seus períodos serão removidas do cadastro. Essa ação não pode ser desfeita.</p><div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4"><Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} data-testid="button-cancel-bulk-delete-rooms">Cancelar</Button><Button variant="danger" onClick={confirmBulkDelete} data-testid="button-confirm-bulk-delete-rooms"><Trash2 size={15} /> Excluir salas</Button></div></div></Modal>}
    </div>
  );
}
