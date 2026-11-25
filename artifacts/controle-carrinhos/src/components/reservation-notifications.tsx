import { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  reservationChangeEventName,
  reservationChangeStorageKey,
  type Reservation,
  useCampusData,
} from "@/lib/campus-data";
import { openSyncChannel, showBrowserNotification } from "@/lib/browser-notifications";
import { getAuthenticatedRole, onAuthenticatedSessionChange } from "@/lib/auth-session";
import { useNotificationSettings } from "@/lib/notification-settings";
import { playOperatorAlert } from "@/lib/operator-audio";
import { readOperatorSettings } from "@/pages/operator";

type ReservationChange = {
  type: "created" | "updated" | "deleted";
  reservation?: Reservation;
  timestamp?: string;
  source?: string;
};

const reservationBody = (reservation: Reservation) =>
  `${reservation.teacher} · ${reservation.room} · ${reservation.date} às ${reservation.start}`;

export function ReservationNotifications() {
  const { reservations, movementSettings } = useCampusData();
  const { settings, loading: settingsLoading, error: settingsError } = useNotificationSettings();
  const [role, setRole] = useState(getAuthenticatedRole);
  const knownIds = useRef(new Set(reservations.map((reservation) => reservation.id)));
  const scheduledIds = useRef(new Set<string>());
  const handledEvents = useRef(new Set<string>());
  const pendingCreatedEvents = useRef(new Map<string, ReservationChange>());
  const canNotify = (notification: "reservation-created" | "reservation-scheduled") =>
    typeof window !== "undefined" &&
    (role === "admin" || role === "operator") &&
    !settingsLoading &&
    !settingsError &&
    settings.ti[notification];
  const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  useEffect(
    () => onAuthenticatedSessionChange(() => setRole(getAuthenticatedRole())),
    [],
  );

  useEffect(() => {
    const showCreated = (reservation: Reservation) => {
      if (!canNotify("reservation-created")) return;
      const body = reservationBody(reservation);
      toast({ title: "Nova reserva criada", description: body });
      void showBrowserNotification("Nova reserva criada", body, "/reservas");
    };
    const handleChange = (change: ReservationChange) => {
      if (change.type !== "created" || !change.reservation) return;
      const eventId = change.source ?? `${change.type}:${change.reservation.id}:${change.timestamp ?? ""}`;
      if (handledEvents.current.has(eventId)) return;
      if (settingsLoading || settingsError || !role) {
        pendingCreatedEvents.current.set(eventId, change);
        return;
      }
      pendingCreatedEvents.current.delete(eventId);
      handledEvents.current.add(eventId);
      if (handledEvents.current.size > 200) handledEvents.current.clear();
      showCreated(change.reservation);
      knownIds.current.add(change.reservation.id);
    };
    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<ReservationChange>).detail;
      if (detail) handleChange(detail);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== reservationChangeStorageKey || !event.newValue) return;
      try {
        handleChange(JSON.parse(event.newValue) as ReservationChange);
      } catch {
        // Ignore malformed cross-tab events.
      }
    };
    window.addEventListener(reservationChangeEventName, handleCustomEvent);
    window.addEventListener("storage", handleStorage);
    const channel = openSyncChannel("controle-carrinhos-sync");
    const handleChannel = (event: MessageEvent<{ type?: string; change?: ReservationChange }>) => {
      if (event.data?.type === "reservations" && event.data.change) handleChange(event.data.change);
    };
    channel?.addEventListener("message", handleChannel);
    return () => {
      window.removeEventListener(reservationChangeEventName, handleCustomEvent);
      window.removeEventListener("storage", handleStorage);
      channel?.removeEventListener("message", handleChannel);
      channel?.close();
    };
  }, [settings.ti["reservation-created"], settingsLoading, settingsError, role]);

  useEffect(() => {
    pendingCreatedEvents.current.forEach((change) => {
      window.dispatchEvent(new CustomEvent(reservationChangeEventName, { detail: change }));
    });
  }, [settingsLoading, settingsError, role]);

  useEffect(() => {
    reservations.forEach((reservation) => knownIds.current.add(reservation.id));
  }, [reservations]);

  useEffect(() => {
    const checkScheduledReservations = () => {
      const now = new Date();
      const today = localDate(now);
      reservations
        .filter((reservation) => reservation.date === today)
        .forEach((reservation) => {
          const key = `${reservation.id}:${reservation.date}:${reservation.start}`;
          if (scheduledIds.current.has(key)) return;
          if (!canNotify("reservation-scheduled")) return;
          const [hour, minute] = reservation.start.split(":").map(Number);
          const scheduledAt = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            hour,
            minute,
          ).getTime();
          const elapsedSinceStart = now.getTime() - scheduledAt;
          if (elapsedSinceStart < 0 || elapsedSinceStart >= 60_000) return;
          try {
            if (window.sessionStorage.getItem(`controle-carrinhos-reservation-alert:${key}`) === "1") {
              scheduledIds.current.add(key);
              return;
            }
          } catch {
            // Continue with the in-memory guard when session storage is unavailable.
          }
          scheduledIds.current.add(key);
          const body = reservationBody(reservation);
          toast({ title: "Reserva no horário agendado", description: body });
          void showBrowserNotification("Reserva no horário agendado", body, "/reservas");
          if (settings.ti["movement-audio"]) {
            playOperatorAlert(
              readOperatorSettings(),
              movementSettings.alertRepeat,
            );
          }
          try {
            window.sessionStorage.setItem(`controle-carrinhos-reservation-alert:${key}`, "1");
          } catch {
            // Session storage can be unavailable in restricted browser contexts.
          }
        });
    };
    checkScheduledReservations();
    const timer = window.setInterval(checkScheduledReservations, 15000);
    return () => window.clearInterval(timer);
  }, [
    reservations,
    settings.ti["movement-audio"],
    settings.ti["reservation-scheduled"],
    settingsLoading,
    settingsError,
    role,
    movementSettings.alertRepeat,
  ]);

  return null;
}
