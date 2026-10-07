import { CalendarDays, Clock3, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button, PageHeader, SectionCard, StatusPill, formatDate, fridaySabbathMessage, isFridayISO, todayISO } from "@/components/app-ui";
import { isReservationInProgress, useCampusData } from "@/lib/campus-data";
import { getCartAvailability, nextBookableWeekday } from "@/lib/cart-availability";

export function UserOverviewPage() {
  const { reservations, teacher, movements, carts, cartSchedules, movementSettings, campusSettings, updateMovementStatus, reportNotReceived, requestMovementAgain } = useCampusData();
  const currentHour = new Date().getHours();
  const periodGreeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setCurrentTime(new Date()), 30000); return () => window.clearInterval(timer); }, []);
  const nextBookableDate = useMemo(() => nextBookableWeekday(currentTime), [currentTime]);
  const cartAvailability = useMemo(
    () => getCartAvailability(
      carts,
      cartSchedules,
      reservations,
      nextBookableDate,
      movementSettings.allowCartATransitionScheduling,
    ),
    [carts, cartSchedules, reservations, nextBookableDate, movementSettings.allowCartATransitionScheduling],
  );
  const availableSlotCount = cartAvailability.reduce(
    (total, cart) => total + cart.slots.filter((slot) => slot.available).length,
    0,
  );
  const totalSlotCount = cartAvailability.reduce((total, cart) => total + cart.slots.length, 0);
  const todayReservations = reservations
    .filter((item) => item.date === todayISO() && item.teacher === teacher.name)
    .sort((a, b) => a.start.localeCompare(b.start));
  const nextReservation = todayReservations[0];
  const fridayMessage = isFridayISO(todayISO()) ? fridaySabbathMessage(todayISO()) : null;

  return (
    <div className="animate-rise space-y-7">
      <PageHeader eyebrow={`Área do professor · ${teacher.name}`} title={`${periodGreeting}, ${teacher.name}.`} description={`Consulte a ${campusSettings.agendaLabel.toLocaleLowerCase("pt-BR")}, reserve um carrinho ou solicite Chromebooks de reserva.`} action={<div className="flex flex-wrap gap-2"><Link href="/usuario/reservas?hoje=1" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm font-semibold" data-testid="link-user-today-reservation"><CalendarDays size={16} /> Reserva de hoje</Link><Link href="/usuario/reservas?nova=1" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]" data-testid="link-user-new-reservation"><Plus size={16} /> Nova reserva</Link></div>} />
      {fridayMessage && <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.14)] p-4"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[hsl(34_60%_32%)]" /><div><p className="text-sm font-semibold text-[hsl(34_60%_28%)]">Preparação para o Sábado do Senhor</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{fridayMessage}</p></div></div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Aulas hoje</p><p className="mt-4 font-display text-3xl font-semibold">{todayReservations.length}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Agendado</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Próxima aula</p><p className="mt-4 font-display text-3xl font-semibold">{nextReservation?.start ?? "—"}</p><p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{nextReservation?.className ?? "Nenhuma aula agendada"}</p></div>
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">Reserva disponível</p><p className="mt-4 font-display text-xl font-semibold leading-snug">Não é possível agendar para o mesmo dia.</p>        <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Se necessário, faça o agendamento conforme a disponibilidade atual dos Chromebooks reservas.</p></div>
      </div>
      <SectionCard
        title="Carrinhos e horários disponíveis"
        eyebrow={`Próximo dia para agendamento · ${formatDate(nextBookableDate)}`}
        action={<Link href={`/usuario/reservas?nova=1&data=${nextBookableDate}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-3 text-xs font-semibold text-[hsl(var(--primary-foreground))]" data-testid="link-user-book-next-date"><Plus size={14} /> Reservar neste dia</Link>}
      >
        <div className="p-5 sm:p-6" data-testid="cart-schedule-availability">
          <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
            {availableSlotCount} de {totalSlotCount} horários estão livres. A disponibilidade considera reservas feitas para cada carrinho.
          </p>
          {cartAvailability.length === 0 ? (
            <p className="rounded-xl bg-[hsl(var(--muted)/.35)] p-4 text-sm text-[hsl(var(--muted-foreground))]" data-testid="text-no-cart-schedule">
              Nenhum horário foi configurado para os carrinhos disponíveis.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {cartAvailability.map((cart) => (
                <article key={cart.id} className="rounded-xl border border-[hsl(var(--border))] p-4" data-testid={`card-cart-availability-${cart.id}`}>
                  <h3 className="text-sm font-semibold">{cart.name}</h3>
                  <div className="mt-3 space-y-3">
                    {(["Manhã", "Tarde"] as const).map((period) => {
                      const periodSlots = cart.slots.filter((slot) => slot.period === period);
                      if (periodSlots.length === 0) return null;
                      return (
                        <div key={period}>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">{period}</p>
                          <div className="flex flex-wrap gap-2">
                            {periodSlots.map((slot) => (
                              <span
                                key={slot.id}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${slot.available
                                  ? "border-emerald-600/25 bg-emerald-600/10 text-emerald-800"
                                  : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/.45)] text-[hsl(var(--muted-foreground))]"
                                }`}
                                data-testid={`slot-availability-${cart.id}-${slot.id}`}
                                aria-label={`${period}, ${slot.start} às ${slot.end}: ${slot.available ? "disponível" : "reservado"}`}
                              >
                                {slot.start}–{slot.end} · {slot.available ? "Livre" : "Reservado"}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Agenda do dia" eyebrow="Aulas e carrinhos reservados" action={<Link href="/usuario/reservas" className="text-xs font-bold text-[hsl(var(--primary))] hover:underline" data-testid="link-user-view-reservations">Minhas reservas</Link>}>
        {todayReservations.length === 0 ? <div className="p-6 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma reserva para hoje.</div> : <div className="divide-y divide-[hsl(var(--border))]">{todayReservations.map((item) => { const movement = movements.find((entry) => entry.reservationId === item.id); const movementStatus = movement?.status ?? "Não movido"; const classInProgress = isReservationInProgress(item); const canReportNotReceived = classInProgress && (!movement || movement.status !== "Concluído" || movement.autoCompleted); const canRequestAgain = classInProgress && movement?.notReceived === true; return <div key={item.id} className="space-y-3 px-5 py-4 sm:px-6" data-testid={`row-user-today-${item.id}`}><div className="flex items-center gap-4"><div className="w-14 shrink-0"><p className="font-data text-sm font-semibold">{item.start}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{item.end}</p></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.className}</p><p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{item.room} · {item.teacher}</p></div><div className="hidden items-center gap-2 text-xs font-semibold sm:flex"><Clock3 size={14} className="text-[hsl(var(--primary))]" /> {item.cart}</div><StatusPill status={movementStatus} /></div><div className="flex flex-wrap items-center gap-2"><Button size="sm" disabled={!classInProgress || movement?.status === "Concluído"} onClick={() => updateMovementStatus(item.id, "Concluído", false, teacher.name)}>Concluído</Button><Button size="sm" variant="secondary" disabled={!canReportNotReceived} onClick={() => reportNotReceived(item.id)}>Não Recebi</Button><Button size="sm" variant="secondary" disabled={!canRequestAgain} onClick={() => requestMovementAgain(item.id)}>Pedir novamente</Button>{!classInProgress && <span className="text-xs text-[hsl(var(--muted-foreground))]">Disponível somente no horário da aula.</span>}</div></div>; })}</div>}      </SectionCard>
      <div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.12)] p-4"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[hsl(34_60%_32%)]" /><div><p className="text-sm font-semibold">Reservas do dia não podem ser modificadas</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Para uma reserva de hoje, procure a coordenação. Novas reservas podem ser adicionadas para outras datas.</p></div></div>
    </div>
  );
}
