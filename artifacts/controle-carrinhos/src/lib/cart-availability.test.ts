import { describe, expect, it } from "vitest";
import { getCartAvailability, nextBookableWeekday } from "./cart-availability";
import { type Cart, type CartScheduleTemplate, type Reservation } from "./campus-data";

const makeCart = (id: string, name: string, overrides: Partial<Cart> = {}): Cart => ({
  id,
  name,
  code: id,
  prefix: `${id}-`,
  total: 30,
  available: 30,
  location: "Sala de carrinhos",
  status: "Pronto",
  lastCheck: "",
  accent: "",
  unavailable: false,
  unavailableUnits: [],
  reservedUnits: [],
  reserveCapacity: 30,
  ...overrides,
});

const schedules: Record<string, CartScheduleTemplate> = {
  "Carrinho A": {
    Manhã: [
      { id: "a1", start: "07:00", end: "07:45" },
      { id: "a2", start: "07:45", end: "08:30" },
    ],
    Tarde: [{ id: "a3", start: "13:00", end: "13:45" }],
  },
  "Carrinho B": {
    Manhã: [{ id: "b1", start: "07:00", end: "07:45" }],
    Tarde: [],
  },
};

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 1,
  teacher: "Outra professora",
  segment: "Fundamental 1",
  subject: "",
  className: "2º ano A",
  room: "Sala 01",
  period: "Manhã",
  date: "2026-10-07",
  start: "07:00",
  end: "07:45",
  cart: "Carrinho A",
  status: "Confirmada",
  kind: "Aula",
  quantity: 1,
  ...overrides,
});

describe("teacher cart schedule availability", () => {
  it("marks schedule slots busy by cart and time, never by device count", () => {
    const availability = getCartAvailability(
      [makeCart("a", "Carrinho A"), makeCart("b", "Carrinho B")],
      schedules,
      [reservation()],
      "2026-10-07",
      false,
    );

    expect(availability).toEqual([
      {
        id: "a",
        name: "Carrinho A",
        slots: [
          { id: "Manhã-a1", period: "Manhã", start: "07:00", end: "07:45", available: false },
          { id: "Manhã-a2", period: "Manhã", start: "07:45", end: "08:30", available: true },
          { id: "Tarde-a3", period: "Tarde", start: "13:00", end: "13:45", available: true },
        ],
      },
      {
        id: "b",
        name: "Carrinho B",
        slots: [
          { id: "Manhã-b1", period: "Manhã", start: "07:00", end: "07:45", available: true },
        ],
      },
    ]);
  });

  it("hides unavailable or maintenance carts and protected transition slots", () => {
    const availability = getCartAvailability(
      [
        makeCart("a", "Carrinho A"),
        makeCart("b", "Carrinho B", { status: "Manutenção" }),
        makeCart("c", "Carrinho C", { unavailable: true }),
      ],
      {
        ...schedules,
        "Carrinho A": {
          Manhã: [{ id: "protected", start: "11:50", end: "12:45" }],
          Tarde: [],
        },
      },
      [],
      "2026-10-07",
      false,
    );

    expect(availability).toEqual([]);
  });

  it("starts at the next weekday that teachers can book", () => {
    expect(nextBookableWeekday(new Date(2026, 9, 6, 15))).toBe("2026-10-07");
    expect(nextBookableWeekday(new Date(2026, 9, 9, 15))).toBe("2026-10-12");
  });
});
