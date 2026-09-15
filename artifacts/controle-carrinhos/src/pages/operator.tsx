import { Bell, Check, Clock3, LogIn, MoveRight, Volume2, VolumeX, Vibrate, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button, Field, PageHeader, SectionCard, StatusPill, inputClass, todayISO } from "@/components/app-ui";
import { type Reservation, useCampusData } from "@/lib/campus-data";

const operatorSettingsStorageKey = "controle-carrinhos-operator-settings";
export type OperatorSettings = {
  volume: number;
  vibration: boolean;
  tone: "classic" | "double" | "soft" | "custom";
  customToneName: string;
  customToneUrl: string;
  alarmDurationSeconds: number;
};
const defaultOperatorSettings: OperatorSettings = {
  volume: 70,
  vibration: true,
  tone: "classic",
  customToneName: "",
  customToneUrl: "",
  alarmDurationSeconds: 5,
};
export const readOperatorSettings = (): OperatorSettings => {
  if (typeof window === "undefined") return defaultOperatorSettings;
  try {
    const saved = window.localStorage.getItem(operatorSettingsStorageKey);
    return saved ? { ...defaultOperatorSettings, ...JSON.parse(saved), alarmDurationSeconds: Math.max(5, Number(JSON.parse(saved).alarmDurationSeconds ?? 5)) } : defaultOperatorSettings;
  } catch {
    return defaultOperatorSettings;
  }
};
export const playOperatorAlert = (settings: OperatorSettings, repeat: number, durationSeconds = settings.alarmDurationSeconds): (() => void) => {
  if (settings.vibration && "vibrate" in navigator) navigator.vibrate([180, 90, 180]);
  if (settings.tone === "custom" && settings.customToneUrl) {
    const audio = new Audio(settings.customToneUrl);
    audio.volume = settings.volume / 100;
    audio.loop = true;
    void audio.play().catch(() => undefined);
    const timeout = window.setTimeout(() => audio.pause(), durationSeconds * 1000);
    return () => {
      window.clearTimeout(timeout);
      audio.pause();
      audio.currentTime = 0;
    };
  }
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass || settings.volume === 0) return () => undefined;
  const audio = new AudioContextClass();
  const frequencies = settings.tone === "double" ? [620, 880] : settings.tone === "soft" ? [440] : [740];
  const totalRepeats = Math.max(repeat, Math.ceil(durationSeconds / 0.7));
  for (let index = 0; index < totalRepeats; index += 1) {
    const frequency = frequencies[index % frequencies.length];
    const start = audio.currentTime + index * 0.7;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = settings.tone === "soft" ? "triangle" : "sine";
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.18 * (settings.volume / 100), start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  }
  const timeout = window.setTimeout(() => void audio.close(), durationSeconds * 1000);
  return () => {
    window.clearTimeout(timeout);
    void audio.close();
  };
};

export function OperatorLoginPage() {
  const { authenticateOperator } = useCampusData();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("TI");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center py-8"><form className="w-full max-w-md space-y-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-lg sm:p-8]" onSubmit={(event) => { event.preventDefault(); const account = authenticateOperator(name, password); if (!account) { setError("Nome ou senha do TI incorretos."); return; } window.localStorage.setItem("controle-carrinhos-role", account.isAdmin ? "admin" : "operator"); window.localStorage.setItem("controle-carrinhos-super-admin", "false"); window.localStorage.setItem("controle-carrinhos-operator-name", account.name); setLocation(account.isAdmin ? "/admin" : "/operador"); }}><div className="flex items-center gap-3"><span className="grid h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-white"><LogIn size={20} /></span><div><h1 className="font-display text-xl font-semibold">Acesso do TI</h1><p className="text-xs text-[hsl(var(--muted-foreground))]">Agenda e movimentação dos carrinhos</p></div></div><Field label="Nome"><input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></Field><Field label="Senha"><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder="Senha do TI" /></Field>{error && <p className="rounded-lg bg-[hsl(var(--destructive)/.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">{error}</p>}<Button className="w-full" type="submit">Entrar</Button><Link href="/" className="block text-center text-xs font-semibold text-[hsl(var(--primary))]">Voltar para acessos</Link></form></div>;
}

export function OperatorPage() {
  const { reservations, movements, movementSettings, updateMovementStatus, wifiRooms, wifiPoints, assignMobileAntenna, releaseMobileAntenna } = useCampusData();
  const [warning, setWarning] = useState("");
  const [alarm, setAlarm] = useState<Reservation | null>(null);
  const [view, setView] = useState<"pending" | "completed">("pending");
  const [alertedReservations, setAlertedReservations] = useState<number[]>([]);
  const alarmStopRef = useRef<(() => void) | null>(null);
  const operatorSettings = readOperatorSettings();
  const today = reservations.filter((item) => item.date === todayISO() && item.kind === "Aula").sort((a, b) => a.start.localeCompare(b.start));
  const [now, setNow] = useState(Date.now());
  const playMovementAlert = () => {
    alarmStopRef.current?.();
    alarmStopRef.current = playOperatorAlert(operatorSettings, movementSettings.alertRepeat);
  };
  const movementActor = () => window.localStorage.getItem("controle-carrinhos-operator-name") ?? "TI";
  const canUpdateMovement = (start: string, end: string) => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    const isEarly = currentMinutes < startMinutes;
    const isWithinWarningWindow =
      isEarly &&
      currentMinutes >= startMinutes - movementSettings.earlyWarningMinutes;
    if (movementSettings.earlyWarningEnabled && isWithinWarningWindow) {
      setWarning(
        `Atenção: o carrinho está sendo movimentado ${startMinutes - currentMinutes} minuto${startMinutes - currentMinutes === 1 ? "" : "s"} antes do início da aula (${start}–${end}).`,
      );
    } else {
      setWarning("");
    }

    return { allowed: true, late: currentMinutes > startMinutes };
  };
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!movementSettings.autoComplete) return;
    movements.forEach((movement) => {
      if (movement.status === "Movendo" && now - new Date(movement.updatedAt).getTime() >= movementSettings.alertIntervalMinutes * 60000) updateMovementStatus(movement.reservationId, "Concluído", true);
    });
  }, [now, movementSettings, movements, updateMovementStatus]);
  useEffect(() => {
    const current = new Date();
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    const reservation = today.find((item) => {
      if (alertedReservations.includes(item.id)) return false;
      const movement = movements.find((entry) => entry.reservationId === item.id);
      if (movement?.status === "Concluído") return false;
      const [hour, minute] = item.start.split(":").map(Number);
      const startMinutes = hour * 60 + minute;
      const alertStart = movementSettings.earlyWarningEnabled
        ? startMinutes - movementSettings.earlyWarningMinutes
        : startMinutes;
      return currentMinutes >= alertStart;
    });
    if (!reservation) return;
    setAlertedReservations((currentIds) => [...currentIds, reservation.id]);
    setAlarm(reservation);
    setView("pending");
    playMovementAlert();
  }, [now, today, movements, movementSettings, alertedReservations]);
  useEffect(() => {
    if (!alarm) return;
    const movement = movements.find((entry) => entry.reservationId === alarm.id);
    if (movement?.status === "Movendo") {
      alarmStopRef.current?.();
      alarmStopRef.current = null;
      setAlarm(null);
    }
  }, [alarm, movements]);
  useEffect(() => () => alarmStopRef.current?.(), []);
  useEffect(() => {
    const current = new Date();
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    wifiPoints
      .filter((point) => point.type === "Antena volante" && point.assignedRoom && point.status === "Em uso")
      .forEach((point) => {
        const stillInUse = today.some((reservation) => {
          if (reservation.room !== point.assignedRoom) return false;
          const [hour, minute] = reservation.end.split(":").map(Number);
          return currentMinutes < hour * 60 + minute;
        });
        if (!stillInUse) releaseMobileAntenna(point.id);
      });
  }, [now, today, wifiPoints, releaseMobileAntenna]);
  const visibleToday = today.filter((item) => {
    const movement = movements.find((entry) => entry.reservationId === item.id);
    return view === "completed" ? movement?.status === "Concluído" : movement?.status !== "Concluído";
  });
  return <div className="animate-rise space-y-7"><PageHeader eyebrow="Área do TI" title="Agenda de movimentações" description="Leve os carrinhos até as salas e atualize cada etapa para a coordenação e o professor." action={<Link href="/admin" className="text-xs font-semibold text-[hsl(var(--primary))]">Voltar ao administrador</Link>} />{alarm && <div role="alert" className="flex items-start gap-3 rounded-xl border border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.08)] p-4 shadow-sm"><Bell size={20} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" /><div className="min-w-0 flex-1"><p className="text-sm font-bold">Novo agendamento para movimentar</p><p className="mt-1 text-xs leading-5">{alarm.start}–{alarm.end} · {alarm.cart} · {alarm.room} · {alarm.teacher}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">O aviso segue as configurações definidas pela administração.</p></div><button type="button" onClick={() => setAlarm(null)} className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Fechar aviso"><X size={16} /></button></div>}{warning && <div role="alert" className="rounded-xl border border-[hsl(var(--destructive)/.4)] bg-[hsl(var(--destructive)/.08)] p-4 text-sm font-semibold text-[hsl(var(--destructive))]">{warning}</div>}<SectionCard title="Movimentações de hoje" eyebrow={`${visibleToday.length} agendamento${visibleToday.length === 1 ? "" : "s"} ${view === "completed" ? "concluído" : "para atender"}`}><div className="flex gap-2 border-b border-[hsl(var(--border))] px-5 pt-4 sm:px-6"><button type="button" onClick={() => setView("pending")} className={`border-b-2 px-1 pb-3 text-xs font-bold ${view === "pending" ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "border-transparent text-[hsl(var(--muted-foreground))]"}`}>Para atender</button><button type="button" onClick={() => setView("completed")} className={`border-b-2 px-1 pb-3 text-xs font-bold ${view === "completed" ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "border-transparent text-[hsl(var(--muted-foreground))]"}`}>Concluído</button></div>{visibleToday.length === 0 ? <p className="p-6 text-sm text-[hsl(var(--muted-foreground))]">{view === "completed" ? "Nenhuma movimentação concluída hoje." : "Nenhuma movimentação para hoje."}</p> : <div className="divide-y divide-[hsl(var(--border))]">{visibleToday.map((item) => { const movement = movements.find((entry) => entry.reservationId === item.id); const status = movement?.status ?? "Não movido"; const roomWifi = wifiRooms.find((room) => room.room === item.room); const roomNeedsAntenna = !roomWifi || !roomWifi.hasWifi; const mobileAntenna = wifiPoints.find((point) => point.type === "Antena volante" && (!point.assignedRoom || point.assignedRoom === item.room) && point.status === "Disponível"); return <div key={item.id} className="space-y-4 p-5 sm:p-6"><div className="flex flex-wrap items-start gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><MoveRight size={18} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.start}–{item.end} · {item.cart}</p><p className="mt-1 text-sm">{item.className}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.room} · Professor: {item.teacher}</p>{movement?.notReceived && <p className="mt-2 rounded-lg bg-[hsl(var(--destructive)/.1)] p-2 text-xs font-semibold text-[hsl(var(--destructive))]">Carrinho não movimentado — o professor não recebeu. Solicitação {movement.requestCount > 1 ? `repetida (${movement.requestCount}x)` : "registrada"}.</p>}{roomNeedsAntenna && <p className="mt-2 rounded-lg bg-[hsl(var(--accent)/.12)] p-2 text-xs font-semibold text-[hsl(34_60%_32%)]">Sala sem conexão fixa · {mobileAntenna ? `${mobileAntenna.name} (${mobileAntenna.point})` : "nenhuma antena volante disponível"}</p>}</div><StatusPill status={status} /></div>{view === "pending" && <div className="flex flex-wrap gap-2"><Button size="sm" variant={status === "Movendo" ? "primary" : "secondary"} onClick={() => { const timing = canUpdateMovement(item.start, item.end); if (!timing.allowed) return; if (roomNeedsAntenna && mobileAntenna) assignMobileAntenna(mobileAntenna.id, item.room); playMovementAlert(); updateMovementStatus(item.id, "Movendo", false, movementActor(), timing.late); }}><Clock3 size={14} /> Movendo</Button><Button size="sm" variant={status === "Concluído" ? "primary" : "secondary"} onClick={() => { const timing = canUpdateMovement(item.start, item.end); if (!timing.allowed) return; if (roomNeedsAntenna && mobileAntenna) assignMobileAntenna(mobileAntenna.id, item.room); updateMovementStatus(item.id, "Concluído", false, movementActor(), timing.late); }}><Check size={14} /> Concluído</Button></div>}</div>; })}</div>}</SectionCard><div className="flex items-start gap-3 rounded-2xl border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.12)] p-4 text-xs leading-5"><Bell size={17} className="mt-0.5 text-[hsl(34_60%_32%)]" />  <p>O alerta de movimentação é configurado pela administração. Ações antecipadas dentro da janela configurada exibem um aviso; ações após o início ficam registradas como movimentação com atraso.</p></div></div>;
}
