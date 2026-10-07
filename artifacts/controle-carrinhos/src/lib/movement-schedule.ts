import type { CartMovement, Reservation } from "@/lib/campus-data";

export const repeatedLessonAutoCompleteActor = "Aula repetida na mesma sala/turma";

const itineraryKey = (reservation: Reservation) => [
  reservation.date,
  reservation.cart.trim().toLocaleLowerCase("pt-BR"),
].join("\u0000");

export function getAlreadyInRoomReservationIds(
  reservations: Reservation[],
  movements: CartMovement[],
): Set<number> {
  const movementsById = new Map(movements.map((movement) => [movement.reservationId, movement]));
  const itineraries = new Map<string, Reservation[]>();

  for (const reservation of reservations) {
    const key = itineraryKey(reservation);
    itineraries.set(key, [...(itineraries.get(key) ?? []), reservation]);
  }

  const alreadyInRoom = new Set<number>();
  for (const itinerary of itineraries.values()) {
    const ordered = [...itinerary].sort((a, b) =>
      a.start.localeCompare(b.start) || a.id - b.id,
    );

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (
        previous.end !== current.start ||
        previous.room.trim().toLocaleLowerCase("pt-BR") !== current.room.trim().toLocaleLowerCase("pt-BR")
      ) continue;

      const previousMovement = movementsById.get(previous.id);
      const previousAutoCompletedAsRoomFollowup =
        previousMovement?.completedBy === repeatedLessonAutoCompleteActor;
      const previousWasPlaced = previousMovement?.status === "Movendo" ||
        previousMovement?.status === "Concluído";
      if (
        alreadyInRoom.has(previous.id) ||
        (previousWasPlaced &&
          (!previousAutoCompletedAsRoomFollowup || alreadyInRoom.has(previous.id)))
      ) {
        alreadyInRoom.add(current.id);
      }
    }
  }

  return alreadyInRoom;
}

export function getStaleRepeatedRoomClassMovementIds(
  reservations: Reservation[],
  movements: CartMovement[],
): number[] {
  const alreadyInRoom = getAlreadyInRoomReservationIds(reservations, movements);
  const reservationIds = new Set(reservations.map((reservation) => reservation.id));
  return movements
    .filter((movement) =>
      reservationIds.has(movement.reservationId) &&
      movement.status === "Concluído" &&
      movement.autoCompleted &&
      movement.completedBy === repeatedLessonAutoCompleteActor &&
      !alreadyInRoom.has(movement.reservationId),
    )
    .map((movement) => movement.reservationId);
}

export function getDueRepeatedRoomClassReservations(
  reservations: Reservation[],
  movements: CartMovement[],
  currentMinutes: number,
): Reservation[] {
  const alreadyInRoom = getAlreadyInRoomReservationIds(reservations, movements);
  const movementByReservation = new Map(movements.map((movement) => [movement.reservationId, movement]));
  return reservations.filter((reservation) => {
    const [hours, minutes] = reservation.start.split(":").map(Number);
    if (!alreadyInRoom.has(reservation.id) || currentMinutes < hours * 60 + minutes) return false;
    return movementByReservation.get(reservation.id)?.status !== "Concluído";
  }).sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
}

export function getDueMovementNotifications(
  reservations: Reservation[],
  movements: CartMovement[],
  currentMinutes: number,
  earlyWarningEnabled: boolean,
  earlyWarningMinutes: number,
  alreadyAlertedIds: number[],
): Reservation[] {
  const alreadyInRoom = getAlreadyInRoomReservationIds(reservations, movements);
  const movementByReservation = new Map(movements.map((movement) => [movement.reservationId, movement]));
  return reservations.filter((reservation) => {
    if (alreadyAlertedIds.includes(reservation.id) || alreadyInRoom.has(reservation.id)) return false;

    const movement = movementByReservation.get(reservation.id);
    if (movement?.status === "Concluído" || movement?.status === "Não atendida" || movement?.status === "Movendo") {
      return false;
    }

    const [startHour, startMinute] = reservation.start.split(":").map(Number);
    const [endHour, endMinute] = reservation.end.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    const alertStart = earlyWarningEnabled ? startMinutes - earlyWarningMinutes : startMinutes;
    return currentMinutes >= alertStart && currentMinutes < endMinutes;
  }).sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);
}
