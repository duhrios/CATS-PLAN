import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { movementChangeEventName, movementStorageKey, syncChannelName, useCampusData, type CartMovement } from "@/lib/campus-data";
import { openSyncChannel, showBrowserNotification } from "@/lib/browser-notifications";


export function OperatorNotifications() {
  const { movements, reservations } = useCampusData();
  const known = useRef(new Map<number, string>());

  useEffect(() => {
    movements.forEach((movement) => known.current.set(movement.reservationId, movement.status));
  }, []);

  useEffect(() => {
    const notify = (next: CartMovement[]) => {
      if (window.localStorage.getItem("controle-carrinhos-role") !== "operator") {
        next.forEach((movement) => known.current.set(movement.reservationId, movement.status));
        return;
      }
      next.forEach((movement) => {
        const previous = known.current.get(movement.reservationId);
        if (!previous || previous === movement.status) {
          known.current.set(movement.reservationId, movement.status);
          return;
        }
        const reservation = reservations.find((item) => item.id === movement.reservationId);
        if (!reservation) return;
        const body = `${reservation.teacher} · ${reservation.room} · ${reservation.start}-${reservation.end}`;
        const title = movement.status === "Não atendida" ? "Solicitação não atendida" : `Movimentação: ${movement.status}`;
        toast({ title, description: body });
        void showBrowserNotification(title, body, "/operador");
        known.current.set(movement.reservationId, movement.status);
      });
    };
    const onCustom = (event: Event) => {
      const next = (event as CustomEvent<CartMovement[]>).detail;
      if (Array.isArray(next)) notify(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== movementStorageKey || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as CartMovement[];
        notify(next);
      } catch {
        // Ignore incomplete writes from another browser context.
      }
    };
    const channel = openSyncChannel(syncChannelName);
    const onChannel = (event: MessageEvent<{ type?: string; movements?: CartMovement[] }>) => {
      if (event.data?.type === "movements" && Array.isArray(event.data.movements)) notify(event.data.movements);
    };
    window.addEventListener(movementChangeEventName, onCustom);
    window.addEventListener("storage", onStorage);
    channel?.addEventListener("message", onChannel);
    return () => {
      window.removeEventListener(movementChangeEventName, onCustom);
      window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onChannel);
      channel?.close();
    };
  }, [reservations]);

  return null;
}
