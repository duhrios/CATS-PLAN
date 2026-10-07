export type OperatorAudioSettings = {
  volume: number;
  vibration: boolean;
  tone: "classic" | "double" | "soft" | "custom";
  customToneUrl: string;
  alarmDurationSeconds: number;
};

const audioErrorEventName = "operator-audio-error";
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Este navegador não oferece suporte a alertas de áudio.");
  }

  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContextClass();
  }
  return audioContext;
};

const reportAudioError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : "Não foi possível reproduzir o alarme neste dispositivo.";
  window.dispatchEvent(new CustomEvent(audioErrorEventName, { detail: message }));
};

export async function enableOperatorAudio(): Promise<void> {
  const context = getAudioContext();
  if (context.state !== "running") await context.resume();
  if (context.state !== "running") {
    throw new Error("O navegador bloqueou o som. Toque em Ativar som e tente novamente.");
  }
}

const playTone = async (
  settings: OperatorAudioSettings,
  repeat: number,
  durationSeconds: number,
  isCancelled: () => boolean,
  registerStop: (stop: () => void) => void,
) => {
  const context = getAudioContext();
  if (context.state !== "running") await context.resume();
  if (isCancelled()) return;
  if (context.state !== "running") {
    throw new Error("O som está bloqueado pelo navegador. Toque em Ativar som na tela do TI.");
  }

  if (settings.tone === "custom" && settings.customToneUrl) {
    try {
      const response = await fetch(settings.customToneUrl);
      if (!response.ok) throw new Error("Não foi possível carregar o toque personalizado.");
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (isCancelled()) return;

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = settings.volume / 100;
      source.connect(gain).connect(context.destination);
      source.start();
      const timeout = window.setTimeout(() => source.stop(), durationSeconds * 1000);
      registerStop(() => {
        window.clearTimeout(timeout);
        try {
          source.stop();
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
        }
      });
      return;
    } catch (error) {
      if (isCancelled()) return;
      reportAudioError(error);
    }
  }

  const frequencies = settings.tone === "double" ? [620, 880] : settings.tone === "soft" ? [440] : [740];
  const totalRepeats = Math.max(Math.max(1, repeat), Math.ceil(durationSeconds / 0.7));
  const oscillators: OscillatorNode[] = [];
  for (let index = 0; index < totalRepeats; index += 1) {
    const start = context.currentTime + index * 0.7;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequencies[index % frequencies.length];
    oscillator.type = settings.tone === "soft" ? "triangle" : "sine";
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.45 * (settings.volume / 100), start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
    oscillators.push(oscillator);
  }

  const timeout = window.setTimeout(() => {
    oscillators.forEach((oscillator) => oscillator.stop());
  }, durationSeconds * 1000);
  registerStop(() => {
    window.clearTimeout(timeout);
    oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
      }
    });
  });
};

export function playOperatorAlert(
  settings: OperatorAudioSettings,
  repeat: number,
  durationSeconds = settings.alarmDurationSeconds,
): () => void {
  if (
    settings.vibration &&
    "vibrate" in navigator &&
    navigator.userActivation?.hasBeenActive
  ) {
    navigator.vibrate([180, 90, 180]);
  }
  if (settings.volume <= 0) {
    reportAudioError(new Error("O volume do alarme está em 0%. Ajuste o volume nas configurações do TI."));
    return () => {};
  }

  let cancelled = false;
  let stopPlayback: () => void = () => {};
  void playTone(settings, repeat, durationSeconds, () => cancelled, (stop) => {
    if (cancelled) stop();
    else stopPlayback = stop;
  }).catch((error: unknown) => {
    if (!cancelled) reportAudioError(error);
  });

  return () => {
    cancelled = true;
    stopPlayback();
  };
}

export function subscribeToOperatorAudioErrors(listener: (message: string) => void): () => void {
  const handleError = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "string") listener(event.detail);
  };
  window.addEventListener(audioErrorEventName, handleError);
  return () => window.removeEventListener(audioErrorEventName, handleError);
}

if (typeof window !== "undefined") {
  const unlockFromFirstInteraction = () => {
    void enableOperatorAudio().catch(reportAudioError);
    window.removeEventListener("keydown", unlockFromFirstInteraction);
    window.removeEventListener("pointerdown", unlockFromFirstInteraction);
    window.removeEventListener("touchstart", unlockFromFirstInteraction);
  };
  window.addEventListener("keydown", unlockFromFirstInteraction, { once: true });
  window.addEventListener("pointerdown", unlockFromFirstInteraction, { once: true });
  window.addEventListener("touchstart", unlockFromFirstInteraction, { once: true, passive: true });
}
