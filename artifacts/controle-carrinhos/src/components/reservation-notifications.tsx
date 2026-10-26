import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import {
  reservationChangeEventName,
  reservationChangeStorageKey,
  type Reservation,
  useCampusData,
} from "@/lib/campus-data";
import { openSyncChannel, showBrowserNotification } from "@/lib/browser-notifications";
import { useNotificationSettings } from "@/lib/notification-settings";

type ReservationChange = {
  type: "created" | "updated" | "deleted";
  reservation?: Reservation;
  timestamp?: string;
  source?: string;
};

const reservationBody = (reservation: Reservation) =>
  `${reservation.teacher} · ${reservation.room} · ${reservation.date} às ${reservation.start}`;

export function ReservationNotifications() {
  const { reservations } = useCampusData();
  const { settings, loading: settingsLoading, error: settingsError } = useNotificationSettings();
  const knownIds = useRef(new Set(reservations.map((reservation) => reservation.id)));
  const scheduledIds = useRef(new Set<string>());
  const handledEvents = useRef(new Set<string>());
  const canNotify = (notification: "reservation-created" | "reservation-scheduled") =>
    typeof window !== "undefined" &&
    !settingsLoading &&
    !settingsError &&
    settings.ti[notification] &&
    window.localStorage.getItem("controle-carrinhos-role") !== "user";
  const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

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
  }, [settings.ti["reservation-created"], settingsLoading, settingsError]);

  useEffect(() => {
    reservations.forEach((reservation) => knownIds.current.add(reservation.id));
  }, [reservations]);

  useEffect(() => {
    const checkScheduledReservations = () => {
      const now = new Date();
      const today = localDate(now);
      const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      reservations
        .filter((reservation) => reservation.date === today && reservation.start === current)
        .forEach((reservation) => {
          const key = `${reservation.id}:${reservation.date}:${reservation.start}`;
          if (scheduledIds.current.has(key)) return;
          try {
            if (window.sessionStorage.getItem(`controle-carrinhos-reservation-alert:${key}`) === "1") {
              scheduledIds.current.add(key);
              return;
            }
          } catch {
            // Continue with the in-memory guard when session storage is unavailable.
          }
          scheduledIds.current.add(key);
          if (!canNotify("reservation-scheduled")) return;
          const body = reservationBody(reservation);
          toast({ title: "Reserva no horário agendado", description: body });
          void showBrowserNotification("Reserva no horário agendado", body, "/reservas");
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
  }, [reservations, settings.ti["reservation-scheduled"], settingsLoading, settingsError]);

  return null;
}
