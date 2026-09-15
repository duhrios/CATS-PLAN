import { Music2, Volume2, VolumeX, Vibrate } from "lucide-react";
import { useState } from "react";
import { Button, Field, PageHeader, SectionCard, inputClass } from "@/components/app-ui";
import {
  type OperatorSettings,
  playOperatorAlert,
  readOperatorSettings,
} from "@/pages/operator";

const operatorSettingsStorageKey = "controle-carrinhos-operator-settings";

export function OperatorSettingsPage() {
  const [settings, setSettings] = useState<OperatorSettings>(readOperatorSettings);
  const saveSettings = (next: OperatorSettings) => {
    setSettings(next);
    window.localStorage.setItem(operatorSettingsStorageKey, JSON.stringify(next));
  };
  const handleToneUpload = (file: File | undefined) => {
    if (!file || !file.type.startsWith("audio/") || file.size > 2_000_000) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      saveSettings({ ...settings, tone: "custom", customToneName: file.name, customToneUrl: reader.result });
    };
    reader.readAsDataURL(file);
  };
  return <div className="animate-rise space-y-7"><PageHeader eyebrow="Área do TI" title="Configuração" description="Personalize como os avisos de novos agendamentos serão apresentados." action={<Button size="sm" variant="secondary" onClick={() => playOperatorAlert(settings, 2)}><Volume2 size={15} /> Testar aviso</Button>} /><SectionCard title="Alarme de agendamento" eyebrow="Preferências deste dispositivo"><div className="grid max-w-2xl gap-5 p-5"><Field label={`Volume · ${settings.volume}%`}><input type="range" min="0" max="100" value={settings.volume} onChange={(event) => saveSettings({ ...settings, volume: Number(event.target.value) })} className="w-full accent-[hsl(var(--primary))]" /></Field><label className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-sm font-semibold"><input type="checkbox" checked={settings.vibration} onChange={(event) => saveSettings({ ...settings, vibration: event.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" /> <Vibrate size={17} className="text-[hsl(var(--primary))]" /> Vibração quando houver novo agendamento</label><Field label={`Tempo do alarme · ${settings.alarmDurationSeconds} segundos`} hint="O alarme tocará continuamente durante este período. Mínimo de 5 segundos."><input type="number" min="5" max="120" value={settings.alarmDurationSeconds} onChange={(event) => saveSettings({ ...settings, alarmDurationSeconds: Math.max(5, Math.min(120, Number(event.target.value) || 5)) })} className={inputClass} /></Field><Field label="Escolha do toque"><select value={settings.tone} onChange={(event) => saveSettings({ ...settings, tone: event.target.value as OperatorSettings["tone"] })} className={inputClass}><option value="classic">Clássico</option><option value="double">Duplo</option><option value="soft">Suave</option>{settings.customToneUrl && <option value="custom">{settings.customToneName || "Toque personalizado"}</option>}</select></Field><Field label={<span className="inline-flex items-center gap-1.5"><Music2 size={14} className="text-[hsl(var(--primary))]" /> Toque personalizado</span>} hint="Escolha um arquivo de áudio de até 2 MB. Ele ficará salvo somente neste navegador."><input type="file" accept="audio/*" onChange={(event) => handleToneUpload(event.target.files?.[0])} className={inputClass} /></Field>{settings.customToneUrl && <div className="flex items-center justify-between gap-3 rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-xs"><span className="min-w-0 truncate">{settings.customToneName}</span><Button size="sm" variant="ghost" onClick={() => saveSettings({ ...settings, tone: "classic", customToneName: "", customToneUrl: "" })}><VolumeX size={14} /> Remover</Button></div>}<p className="text-xs text-[hsl(var(--muted-foreground))]">As preferências são locais e não alteram as configurações gerais definidas pelo administrador.</p></div></SectionCard></div>;
}
