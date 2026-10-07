import { BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/app-ui";

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

const toUint8Array = (value: string) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

export function PushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("controle-carrinhos-push-enabled") === "true",
  );
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  useEffect(() => {
    const available =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    setSupported(available);
    if ("Notification" in window) setPermission(Notification.permission);
    setRegistered(
      "Notification" in window &&
        Notification.permission === "granted" &&
        window.localStorage.getItem("controle-carrinhos-push-enabled") === "true",
    );
    if (available) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
        .then(() => setServiceWorkerReady(true))
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? `Não foi possível preparar as notificações: ${cause.message}` : "Não foi possível preparar as notificações.");
        });
    }
  }, []);

  if (!supported || registered) return null;

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      let publicKey = vapidPublicKey;
      if (!publicKey) {
        const response = await fetch("/api/push/public-key");
        if (!response.ok) throw new Error("O servidor ainda não configurou as notificações push.");
        publicKey = (await response.json() as { publicKey?: string }).publicKey;
      }
      if (!publicKey) throw new Error("Chave pública VAPID ausente.");
      const subscription = await registration.pushManager.getSubscription() ??
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toUint8Array(publicKey),
        });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("Não foi possível registrar este dispositivo.");
      window.localStorage.setItem("controle-carrinhos-push-enabled", "true");
      setRegistered(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ativar as notificações.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {permission === "denied" ? (
        <p className="max-w-xs text-right text-[11px] text-[hsl(var(--muted-foreground))]">
          Notificações bloqueadas. Permita notificações nas configurações do site para ativá-las.
        </p>
      ) : (
        <Button size="sm" variant="secondary" onClick={enable} disabled={busy || !serviceWorkerReady}>
          <BellOff size={14} />
          {busy ? "Ativando..." : !serviceWorkerReady ? "Preparando notificações..." : "Ativar notificações"}
        </Button>
      )}
      {error && <p className="max-w-xs text-right text-[11px] text-[hsl(var(--destructive))]">{error}</p>}
    </div>
  );
}
