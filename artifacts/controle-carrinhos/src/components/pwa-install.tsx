import { Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/app-ui";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    updateInstalled();
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", updateInstalled);
    if (media.addEventListener) media.addEventListener("change", updateInstalled);
    else media.addListener(updateInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", updateInstalled);
      if (media.removeEventListener) media.removeEventListener("change", updateInstalled);
      else media.removeListener(updateInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!prompt) {
      setShowHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" onClick={install}>
        {prompt ? <Download size={14} /> : <Smartphone size={14} />}
        {prompt ? "Instalar aplicativo" : "Usar como aplicativo"}
      </Button>
      {showHelp && (
        <p className="max-w-xs rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-right text-[11px] text-[hsl(var(--muted-foreground))]">
          No Chrome, abra o menu ⋮ e escolha <strong>Instalar aplicativo</strong>.
          No iPhone/iPad, use Compartilhar e <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
    </div>
  );
}
