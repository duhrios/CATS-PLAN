import { CalendarDays, Clock3, Plus, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { Button, PageHeader, SectionCard, StatusPill, formatDate, todayISO } from "@/components/app-ui";
import { useCampusData } from "@/lib/campus-data";

export function UserOverviewPage() {
  const { reservations, teacher, movements, updateMovementStatus, reportNotReceived } = useCampusData();
  const todayReservations = reservations.filter((item) => item.date === todayISO()).sort((a, b) => a.start.localeCompare(b.start));
  const nextReservation = todayReservations[0];

  return (
    <div className="animate-rise space-y-7">
      <PageHeader eyebrow={`Área do professor · ${teacher.name}`} title="Bom dia." description="Consulte a agenda, reserve um carrinho ou solicite Chromebooks de reserva." action={<div className="flex flex-wrap gap-2"><Link href="/usuario/reservas?hoje=1" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold" data-testid="link-user-today-reservation"><CalendarDays size={16} /> Reserva de hoje</Link><Link href="/usuario/reservas" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="link-user-new-reservation"><Plus size={16} /> Nova reserva</Link></div>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Aulas hoje</p><p className="mt-4 font-display text-3xl font-semibold">{todayReservations.length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Na agenda do campus</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Próxima aula</p><p className="mt-4 font-display text-3xl font-semibold">{nextReservation?.start ?? "—"}</p><p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{nextReservation?.className ?? "Nenhuma aula agendada"}</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Regra de alteração</p><p className="mt-4 font-display text-3xl font-semibold">D−1 / D+1</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">No dia, a reserva fica bloqueada</p></div>
      </div>
      <SectionCard title="Agenda do dia" eyebrow="Aulas e carrinhos reservados" action={<Link href="/usuario/reservas" className="text-xs font-bold text-[hsl(var(--primary))] hover:underline" data-testid="link-user-view-reservations">Ver reservas</Link>}>
        {todayReservations.length === 0 ? <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma reserva para hoje.</div> : <div className="divide-y divide-[hsl(var(--border))]">{todayReservations.map((item) => { const movement = movements.find((entry) => entry.reservationId === item.id); return <div key={item.id} className="space-y-3 px-5 py-4 sm:px-6" data-testid={`row-user-today-${item.id}`}><div className="flex items-center gap-4"><div className="w-14 shrink-0"><p className="font-data text-sm font-semibold">{item.start}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{item.end}</p></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.className}</p><p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{item.room} · {item.teacher}</p></div><div className="hidden items-center gap-2 text-xs font-semibold sm:flex"><Clock3 size={14} className="text-[hsl(var(--primary))]" /> {item.cart}</div><StatusPill status={movement?.status ?? item.status} /></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => updateMovementStatus(item.id, "Concluído")}>Concluído</Button>        <Button size="sm" variant="secondary" onClick={() => reportNotReceived(item.id)}>Não Recebi</Button></div></div>; })}</div>}
      </SectionCard>
      <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.12)] p-4"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[hsl(34_60%_32%)]" /><div><p className="text-sm font-semibold">Reservas do dia não podem ser modificadas</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Para uma reserva de hoje, procure a coordenação. Novas reservas podem ser adicionadas para outras datas.</p></div></div>
    </div>
  );
}
