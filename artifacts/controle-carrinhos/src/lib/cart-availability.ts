import {
  isCartTransitionConflict,
  reservationsOverlap,
  type Cart,
  type CartScheduleTemplate,
  type Reservation,
} from "@/lib/campus-data";

export type CartSlotAvailability = {
  id: string;
  period: "Manhã" | "Tarde";
  start: string;
  end: string;
  available: boolean;
};

export type CartAvailability = {
  id: string;
  name: string;
  slots: CartSlotAvailability[];
};

export const nextBookableWeekday = (from: Date) => {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1, 12);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getCartAvailability = (
  carts: Cart[],
  schedules: Record<string, CartScheduleTemplate>,
  reservations: Reservation[],
  date: string,
  allowCartATransitionScheduling: boolean,
): CartAvailability[] =>
  carts
    .filter((cart) => !cart.unavailable && cart.status !== "Manutenção")
    .map((cart) => ({
      id: cart.id,
      name: cart.name,
      slots: (["Manhã", "Tarde"] as const).flatMap((period) =>
        (schedules[cart.name]?.[period] ?? [])
          .filter((slot) => !isCartTransitionConflict({
            cart: cart.name,
            start: slot.start,
            kind: "Aula",
          }, allowCartATransitionScheduling))
          .map((slot) => ({
            id: `${period}-${slot.id}`,
            period,
            start: slot.start,
            end: slot.end,
            available: !reservations.some((reservation) =>
              reservationsOverlap(reservation, {
                cart: cart.name,
                date,
                start: slot.start,
                end: slot.end,
                kind: "Aula",
              }),
            ),
          })),
      ),
    }))
    .filter((cart) => cart.slots.length > 0);
