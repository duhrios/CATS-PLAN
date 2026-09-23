import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import {
  reservationChangeEventName,
  reservationChangeStorageKey,
  type Reservation,
  useCampusData,
} from "@/lib/campus-data";

type ReservationChange = {
  type: "created" | "updated" | "deleted";
  reservation?: Reservation;
  timestamp?: string;
  source?: string;
};

const notifyBrowser = (title: string, body: string) => {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body });
  }
};

const reservationBody = (reservation: Reservation) =>
  `${reservation.teacher} · ${reservation.room} · ${reservation.date} às ${reservation.start}`;

export function ReservationNotifications() {
  const { reservations } = useCampusData();
  const knownIds = useRef(new Set(reservations.map((reservation) => reservation.id)));
  const scheduledIds = useRef(new Set<string>());
  const canNotify = () =>
    typeof window !== "undefined" &&
    window.localStorage.getItem("controle-carrinhos-role") !== "user";
  const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    const showCreated = (reservation: Reservation) => {
      if (!canNotify()) return;
      const body = reservationBody(reservation);
      toast({ title: "Nova reserva criada", description: body });
      notifyBrowser("Nova reserva criada", body);
    };
    const handleChange = (change: ReservationChange) => {
      if (change.type !== "created" || !change.reservation) return;
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
    return () => {
      window.removeEventListener(reservationChangeEventName, handleCustomEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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
          if (!canNotify()) return;
          const body = reservationBody(reservation);
          toast({ title: "Reserva no horário agendado", description: body });
          notifyBrowser("Reserva no horário agendado", body);
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
  }, [reservations]);

  return null;
}
