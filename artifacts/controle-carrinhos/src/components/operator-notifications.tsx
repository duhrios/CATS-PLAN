import { useEffect, useRef, useState } from "react";
import { todayISO } from "@/components/app-ui";
import {
  getAuthenticatedRole,
  onAuthenticatedSessionChange,
} from "@/lib/auth-session";
import {
  movementChangeEventName,
  movementStorageKey,
  isReservationInProgress,
  syncChannelName,
  useCampusData,
  type CartMovement,
} from "@/lib/campus-data";
import { getDueAutoCompletedMovementReservations } from "@/lib/movement-schedule";
import {
  openSyncChannel,
  showBrowserNotification,
} from "@/lib/browser-notifications";
import { isNewTeacherMovementRequest } from "@/lib/movement-notifications";
import { useNotificationSettings } from "@/lib/notification-settings";

export function OperatorNotifications() {
  const {
    movements,
    reservations,
    movementSettings,
    updateMovementStatus,
  } = useCampusData();
  const { settings, loading: settingsLoading, error: settingsError } = useNotificationSettings();
  const known = useRef(new Map<number, CartMovement>());
  const [now, setNow] = useState(Date.now());
  const [role, setRole] = useState(getAuthenticatedRole);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => onAuthenticatedSessionChange(() => setRole(getAuthenticatedRole())),
    [],
  );

  useEffect(() => {
    if (role !== "admin" && role !== "operator") return;
    const todaysReservations = reservations.filter(
      (reservation) =>
        reservation.date === todayISO() && reservation.kind === "Aula",
    );
    getDueAutoCompletedMovementReservations(
      todaysReservations,
      movements,
      now,
      movementSettings.autoComplete,
      movementSettings.alertIntervalMinutes,
    ).forEach((reservation) => {
      updateMovementStatus(reservation.id, "Concluído", true);
    });
  }, [
    movements,
    movementSettings.alertIntervalMinutes,
    movementSettings.autoComplete,
    now,
    reservations,
    role,
    updateMovementStatus,
  ]);

  useEffect(() => {
    movements.forEach((movement) =>
      known.current.set(movement.reservationId, movement),
    );
  }, []);

  useEffect(() => {
    const notify = (next: CartMovement[]) => {
      if (
        settingsLoading ||
        settingsError ||
        !settings.ti["movement-request"] ||
        !["operator", "admin"].includes(getAuthenticatedRole() ?? "")
      ) {
        next.forEach((movement) =>
          known.current.set(movement.reservationId, movement),
        );
        return;
      }
      next.forEach((movement) => {
        const previous = known.current.get(movement.reservationId);
        known.current.set(movement.reservationId, movement);
        if (!isNewTeacherMovementRequest(previous, movement)) return;
        const reservation = reservations.find(
          (item) => item.id === movement.reservationId,
        );
        if (!reservation || !isReservationInProgress(reservation)) return;
        const body = `${reservation.teacher} pediu novamente · ${reservation.room} · ${reservation.start}-${reservation.end}`;
        const title = "Pedido de movimentação";
        void showBrowserNotification(
          title,
          body,
          "/operador",
          "operator-movement-request",
        );
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
    const onChannel = (
      event: MessageEvent<{ type?: string; movements?: CartMovement[] }>,
    ) => {
      if (
        event.data?.type === "movements" &&
        Array.isArray(event.data.movements)
      )
        notify(event.data.movements);
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
  }, [reservations, settings.ti["movement-request"], settingsLoading, settingsError]);

  return null;
}
