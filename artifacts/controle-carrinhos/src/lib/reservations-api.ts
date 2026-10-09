import { segments, type Reservation, type Segment } from "@/lib/campus-data";

const refreshReservationsEvent = "controle-carrinhos:refresh-reservations";

export const requestSharedReservationsRefresh = () =>
  new Promise<void>((resolve) => {
    window.dispatchEvent(
      new CustomEvent(refreshReservationsEvent, { detail: resolve }),
    );
  });

export const onSharedReservationsRefresh = (
  listener: (complete: () => void) => void,
) => {
  const handleRefresh = (event: Event) => {
    const complete = (event as CustomEvent<() => void>).detail;
    listener(typeof complete === "function" ? complete : () => {});
  };
  window.addEventListener(refreshReservationsEvent, handleRefresh);
  return () => window.removeEventListener(refreshReservationsEvent, handleRefresh);
};

type ReservationRecord = {
  id: number;
  teacherName: string;
  segment: string;
  subject: string;
  className: string;
  room: string;
  period: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  cartId: number;
  cartName: string;
  kind: string;
  quantity: number;
  status: string;
};

type CartRecord = { id: number; name: string; code: string };

const requireResponse = async (response: Response) => {
  if (response.ok) return response;
  const body = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(body?.error ?? `Falha na API (${response.status}).`);
};

const fromRecord = (item: ReservationRecord): Reservation => ({
  id: item.id,
  teacher: item.teacherName,
  segment: item.className.trim().toLocaleLowerCase("pt-BR") === "contraturno"
    ? "Contraturno"
    : segments.includes(item.segment as Segment) ? item.segment as Segment : "Fundamental 2",
  subject: item.subject,
  className: item.className,
  room: item.room,
  period: item.period === "Tarde" ? "Tarde" : "Manhã",
  date: item.scheduledDate,
  start: item.startTime.slice(0, 5),
  end: item.endTime.slice(0, 5),
  cart: item.kind === "Reserva" ? "Reservas" : item.cartName,
  status: item.status === "Confirmada" || item.status === "Concluída" ? item.status : "Aguardando",
  kind: item.kind === "Reserva" ? "Reserva" : "Aula",
  quantity: item.quantity,
});

export async function loadSharedReservations(): Promise<Reservation[]> {
  const response = await requireResponse(await fetch("/api/reservations", { cache: "no-store" }));
  const records = await response.json() as ReservationRecord[];
  return records.map(fromRecord);
}

export async function saveSharedReservation(
  reservation: Omit<Reservation, "id" | "status">,
  id?: number,
): Promise<void> {
  const cartsResponse = await requireResponse(await fetch("/api/carts", { cache: "no-store" }));
  const carts = await cartsResponse.json() as CartRecord[];
  const cart = carts.find((item) =>
    reservation.kind === "Reserva"
      ? item.code === "A"
      : item.name === reservation.cart,
  );
  if (!cart) throw new Error(`O ${reservation.cart} não foi encontrado na agenda compartilhada.`);

  const response = await requireResponse(await fetch(
    id ? `/api/reservations/${id}` : "/api/reservations",
    {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherName: reservation.teacher,
        segment: reservation.segment,
        subject: reservation.subject,
        className: reservation.className,
        room: reservation.room,
        period: reservation.period,
        scheduledDate: reservation.date,
        startTime: reservation.start,
        endTime: reservation.end,
        cartId: cart.id,
        kind: reservation.kind,
        quantity: reservation.quantity,
      }),
    },
  ));
  await response.json();
}

export async function moveSharedReservationsToCart(
  reservations: Reservation[],
): Promise<void> {
  let movedCount = 0;
  let firstError: unknown;
  for (const reservation of reservations) {
    const { id, status: _status, ...data } = reservation;
    try {
      await saveSharedReservation(data, id);
      movedCount += 1;
    } catch (error) {
      firstError ??= error;
    }
  }
  if (movedCount !== reservations.length) {
    const details = firstError instanceof Error
      ? ` ${firstError.message}`
      : "";
    throw new Error(
      `${movedCount} de ${reservations.length} aulas foram salvas; as demais não foram movidas.${details}`,
    );
  }
}

export async function deleteSharedReservation(id: number): Promise<void> {
  await requireResponse(await fetch(`/api/reservations/${id}`, { method: "DELETE" }));
}

export async function clearSharedReservations(): Promise<void> {
  const reservations = await loadSharedReservations();
  await Promise.all(reservations.map((reservation) => deleteSharedReservation(reservation.id)));
}

const reservationKey = (reservation: Reservation) => [
  reservation.teacher,
  reservation.segment,
  reservation.subject,
  reservation.className,
  reservation.room,
  reservation.period,
  reservation.date,
  reservation.start,
  reservation.end,
  reservation.cart,
  reservation.kind,
  reservation.quantity,
].join("\u0000");

export async function replaceSharedReservations(next: Reservation[]): Promise<void> {
  const existing = await loadSharedReservations();
  const nextLessons = next.filter((reservation) => reservation.kind === "Aula");
  const keysToKeep = new Set(nextLessons.map(reservationKey));
  await Promise.all(existing
    .filter((reservation) => reservation.kind === "Aula" && !keysToKeep.has(reservationKey(reservation)))
    .map((reservation) => deleteSharedReservation(reservation.id)));

  const existingKeys = new Set(existing.map(reservationKey));
  for (const reservation of nextLessons) {
    if (existingKeys.has(reservationKey(reservation))) continue;
    await saveSharedReservation({
      teacher: reservation.teacher,
      segment: reservation.segment,
      subject: reservation.subject,
      className: reservation.className,
      room: reservation.room,
      period: reservation.period,
      date: reservation.date,
      start: reservation.start,
      end: reservation.end,
      cart: reservation.cart,
      kind: reservation.kind,
      quantity: reservation.quantity,
    });
  }
}
