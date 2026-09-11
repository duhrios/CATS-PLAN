import { Bell, Check, Clock3, LogIn, MoveRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button, Field, PageHeader, SectionCard, StatusPill, inputClass, todayISO } from "@/components/app-ui";
import { useCampusData } from "@/lib/campus-data";

export function OperatorLoginPage() {
  const { authenticateOperator } = useCampusData();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("Operador");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center py-8"><form className="w-full max-w-md space-y-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-lg sm:p-8]" onSubmit={(event) => { event.preventDefault(); const account = authenticateOperator(name, password); if (!account) { setError("Nome ou senha do operador incorretos."); return; } window.localStorage.setItem("controle-carrinhos-role", "operator"); setLocation("/operador"); }}><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--primary))] text-white"><LogIn size={20} /></span><div><h1 className="font-display text-xl font-semibold">Acesso do operador</h1><p className="text-xs text-[hsl(var(--muted-foreground))]">Agenda e movimentação dos carrinhos</p></div></div><Field label="Nome"><input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></Field><Field label="Senha"><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder="Senha do operador" /></Field>{error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}<Button className="w-full" type="submit">Entrar</Button><Link href="/login" className="block text-center text-xs font-semibold text-[hsl(var(--primary))]">Voltar para acessos</Link></form></div>;
}

export function OperatorPage() {
  const { reservations, movements, movementSettings, updateMovementStatus } = useCampusData();
  const today = reservations.filter((item) => item.date === todayISO() && item.kind === "Aula").sort((a, b) => a.start.localeCompare(b.start));
  const [now, setNow] = useState(Date.now());
  const playMovementAlert = () => {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    for (let index = 0; index < movementSettings.alertRepeat; index += 1) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 740;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.001, audio.currentTime + index * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + index * 0.35 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + index * 0.35 + 0.22);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(audio.currentTime + index * 0.35);
      oscillator.stop(audio.currentTime + index * 0.35 + 0.24);
    }
    window.setTimeout(() => void audio.close(), Math.max(500, movementSettings.alertRepeat * 350 + 300));
  };
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!movementSettings.autoComplete) return;
    movements.forEach((movement) => {
      if (movement.status === "Movendo" && now - new Date(movement.updatedAt).getTime() >= movementSettings.alertIntervalMinutes * 60000) updateMovementStatus(movement.reservationId, "Concluído");
    });
  }, [now, movementSettings, movements, updateMovementStatus]);
  return <div className="animate-rise space-y-7"><PageHeader eyebrow="Área do operador" title="Agenda de movimentações" description="Leve os carrinhos até as salas e atualize cada etapa para a coordenação e o professor." action={<Link href="/" className="text-xs font-semibold text-[hsl(var(--primary))]">Voltar ao administrador</Link>} /><SectionCard title="Movimentações de hoje" eyebrow={`${today.length} agendamento${today.length === 1 ? "" : "s"} para atender`}>{today.length === 0 ? <p className="p-6 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma movimentação para hoje.</p> : <div className="divide-y divide-[hsl(var(--border))]">{today.map((item) => { const movement = movements.find((entry) => entry.reservationId === item.id); const status = movement?.status ?? "Não movido"; return <div key={item.id} className="space-y-4 p-5 sm:p-6"><div className="flex flex-wrap items-start gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><MoveRight size={18} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.start}–{item.end} · {item.cart}</p><p className="mt-1 text-sm">{item.className}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.room} · Professor: {item.teacher}</p>{movement?.notReceived && <p className="mt-2 rounded-lg bg-[hsl(var(--destructive)/.1)] p-2 text-xs font-semibold text-[hsl(var(--destructive))]">Carrinho não movimentado — o professor informou que não recebeu.</p>}</div><StatusPill status={status} /></div><div className="flex flex-wrap gap-2">    <Button size="sm" variant={status === "Movendo" ? "primary" : "secondary"} onClick={() => { playMovementAlert(); updateMovementStatus(item.id, "Movendo"); }}><Clock3 size={14} /> Movendo</Button><Button size="sm" variant={status === "Concluído" ? "primary" : "secondary"} onClick={() => updateMovementStatus(item.id, "Concluído")}><Check size={14} /> Concluído</Button><Button size="sm" variant={status === "Não movido" ? "danger" : "ghost"} onClick={() => updateMovementStatus(item.id, "Não movido")}><X size={14} /> Não movido</Button></div></div>; })}</div>}</SectionCard><div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.12)] p-4 text-xs leading-5"><Bell size={17} className="mt-0.5 text-[hsl(34_60%_32%)]" /><p>O alerta de movimentação é configurado pela administração. Conclusões automáticas respeitam o tempo definido no perfil administrativo.</p></div></div>;
}
