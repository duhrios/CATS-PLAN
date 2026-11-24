import {
  Bell,
  Music2,
  Trash2,
  Upload,
  Volume2,
  Vibrate,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Field,
  PageHeader,
  SectionCard,
  inputClass,
} from "@/components/app-ui";
import {
  type OperatorSettings,
  playOperatorAlert,
  readOperatorSettings,
} from "@/pages/operator";
import { subscribeToOperatorAudioErrors } from "@/lib/operator-audio";

const operatorSettingsStorageKey = "controle-carrinhos-operator-settings";

export function OperatorSettingsPage() {
  const [settings, setSettings] =
    useState<OperatorSettings>(readOperatorSettings);
  const [toneUploadError, setToneUploadError] = useState("");
  const toneFileInputRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => subscribeToOperatorAudioErrors((message) => toast.error(message)),
    [],
  );
  const saveSettings = (next: OperatorSettings) => {
    window.localStorage.setItem(
      operatorSettingsStorageKey,
      JSON.stringify(next),
    );
    setSettings(next);
  };
  const handleToneUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setToneUploadError("Selecione um arquivo de áudio válido.");
      return;
    }
    if (file.size > 2_000_000) {
      setToneUploadError("O arquivo excede o limite de 2 MB.");
      return;
    }
    setToneUploadError("");
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setToneUploadError("Não foi possível carregar este arquivo de áudio.");
        return;
      }
      try {
        saveSettings({
          ...settings,
          tone: "custom",
          customToneName: file.name,
          customToneUrl: reader.result,
        });
      } catch {
        setToneUploadError(
          "Não foi possível salvar o toque neste navegador. Libere espaço ou escolha um arquivo menor.",
        );
      }
    };
    reader.onerror = () => {
      setToneUploadError("Não foi possível ler este arquivo. Tente novamente.");
    };
    reader.readAsDataURL(file);
  };
  const removeCustomTone = () => {
    saveSettings({
      ...settings,
      tone: settings.tone === "custom" ? "classic" : settings.tone,
      customToneName: "",
      customToneUrl: "",
    });
    if (toneFileInputRef.current) toneFileInputRef.current.value = "";
    setToneUploadError("");
  };
  return (
    <div className="animate-rise space-y-7">
      <PageHeader
        eyebrow="Área do TI"
        title="Configuração"
        description="Personalize os lembretes de movimentação e os avisos deste dispositivo."
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => playOperatorAlert(settings, 2)}
          >
            <Volume2 size={15} /> Testar aviso
          </Button>
        }
      />
      <SectionCard
        title="Lembretes de movimentação"
        eyebrow="Preferências deste dispositivo"
        defaultExpanded
      >
        <div className="grid max-w-2xl gap-5 p-5">
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Bell size={14} className="text-[hsl(var(--primary))]" />{" "}
                Exibição dos alertas
              </span>
            }
            hint="Modo seleção reúne movimentações simultâneas em um aviso com setas. Clássico mostra os avisos empilhados."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                <input
                  type="radio"
                  name="notificationMode"
                  value="selection"
                  checked={settings.notificationMode === "selection"}
                  onChange={() =>
                    saveSettings({ ...settings, notificationMode: "selection" })
                  }
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span>
                  <span className="block font-semibold">Modo seleção</span>
                  <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
                    Um aviso com anterior/próxima
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                <input
                  type="radio"
                  name="notificationMode"
                  value="classic"
                  checked={settings.notificationMode === "classic"}
                  onChange={() =>
                    saveSettings({ ...settings, notificationMode: "classic" })
                  }
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span>
                  <span className="block font-semibold">Clássico</span>
                  <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
                    Avisos um embaixo do outro
                  </span>
                </span>
              </label>
            </div>
          </Field>
          <Field label={`Volume · ${settings.volume}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.volume}
              onChange={(event) =>
                saveSettings({
                  ...settings,
                  volume: Number(event.target.value),
                })
              }
              className="w-full accent-[hsl(var(--primary))]"
            />
          </Field>
          <label className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={settings.vibration}
              onChange={(event) =>
                saveSettings({ ...settings, vibration: event.target.checked })
              }
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />{" "}
            <Vibrate size={17} className="text-[hsl(var(--primary))]" />{" "}
            Vibração quando houver lembrete de movimentação
          </label>
          <Field
            label={`Tempo do alarme · ${settings.alarmDurationSeconds} segundos`}
            hint="Duração do lembrete sonoro. Mínimo de 5 segundos."
          >
            <input
              type="number"
              min="5"
              max="120"
              value={settings.alarmDurationSeconds}
              onChange={(event) =>
                saveSettings({
                  ...settings,
                  alarmDurationSeconds: Math.max(
                    5,
                    Math.min(120, Number(event.target.value) || 5),
                  ),
                })
              }
              className={inputClass}
            />
          </Field>
          <Field label="Escolha do toque">
            <select
              value={settings.tone}
              onChange={(event) =>
                saveSettings({
                  ...settings,
                  tone: event.target.value as OperatorSettings["tone"],
                })
              }
              className={inputClass}
            >
              <option value="classic">Clássico</option>
              <option value="double">Duplo</option>
              <option value="soft">Suave</option>
              {settings.customToneUrl && (
                <option value="custom">
                  {settings.customToneName || "Toque personalizado"}
                </option>
              )}
            </select>
          </Field>
          <div className="block space-y-1.5">
            <p
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]"
            >
              <Music2 size={14} className="text-[hsl(var(--primary))]" />{" "}
              Toque personalizado
            </p>
            <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.22)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]">
                    <Music2 size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {settings.customToneUrl
                        ? "Toque personalizado selecionado"
                        : "Adicione um toque para os avisos"}
                    </p>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      MP3, WAV ou outro áudio · até 2 MB · salvo neste navegador
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => toneFileInputRef.current?.click()}
                  data-testid="button-select-custom-tone"
                >
                  <Upload size={15} />
                  {settings.customToneUrl ? "Trocar arquivo" : "Escolher arquivo"}
                </Button>
                <input
                  ref={toneFileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    handleToneUpload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  className="sr-only"
                  aria-label="Arquivo de áudio personalizado"
                  data-testid="input-custom-tone-file"
                />
              </div>
              {toneUploadError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-[hsl(var(--destructive))]"
                >
                  {toneUploadError}
                </p>
              )}
              {settings.customToneUrl && (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Music2
                      size={15}
                      className="shrink-0 text-[hsl(var(--primary))]"
                    />
                    <span className="truncate font-medium">
                      {settings.customToneName || "Toque personalizado"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]"
                    onClick={removeCustomTone}
                    data-testid="button-remove-custom-tone"
                  >
                    <Trash2 size={14} /> Remover toque
                  </Button>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            As preferências são locais e não alteram as configurações gerais
            definidas pelo administrador.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
