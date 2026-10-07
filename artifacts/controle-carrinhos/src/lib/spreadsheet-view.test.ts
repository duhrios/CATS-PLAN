import { describe, expect, it } from "vitest";
import type { Reservation } from "@/lib/campus-data";
import {
  allReservationsTab,
  completeViewColumns,
  defaultCompleteViewColumns,
  filterReservationsByCart,
  getCompleteViewCartNames,
  getFloorOptimizationSuggestions,
  filterReservationsByPeriod,
  formatDateKey,
  getVisibleCompleteViewColumns,
  getCartScheduleRows,
  getMondayOfWeek,
  getWeekDates,
  isReservationMoveInPast,
  prepareQuickAccessCartMove,
  prepareQuickAccessMove,
} from "@/lib/spreadsheet-view";

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
  id: 1,
  teacher: "Laura",
  segment: "Fundamental 2",
  subject: "Matemática",
  className: "7º MA",
  room: "Sala 22",
  period: "Manhã",
  date: "2026-09-28",
  start: "07:00",
  end: "07:45",
  cart: "Carrinho A",
  status: "Confirmada",
  kind: "Aula",
  quantity: 30,
  ...overrides,
});
const moveTestNow = new Date(2026, 8, 28, 6, 0);

describe("spreadsheet schedule view", () => {
  it("keeps the three standard carts first and adds tabs for other carts present", () => {
    expect(getCompleteViewCartNames([
      { cart: "Carrinho C" },
      { cart: "Carrinho B" },
      { cart: "Carrinho Extra 2" },
      { cart: "Reservas" },
      { cart: "Carrinho Extra 1" },
    ])).toEqual([
      "Carrinho A",
      "Carrinho B",
      "Carrinho C",
      "Carrinho Extra 1",
      "Carrinho Extra 2",
      "Reservas",
    ]);
  });

  it("shows only reservations assigned to the selected cart", () => {
    const reservations = [
      reservation(),
      reservation({ id: 2, cart: "Carrinho B" }),
      reservation({ id: 3, cart: "Carrinho C" }),
    ];
    expect(filterReservationsByCart(reservations, "Carrinho B").map(({ id }) => id))
      .toEqual([2]);
  });

  it("shows reservations from every cart in the all-reservations tab", () => {
    const reservations = [
      reservation(),
      reservation({ id: 2, cart: "Carrinho B" }),
      reservation({ id: 3, cart: "Reservas", kind: "Reserva" }),
    ];
    expect(filterReservationsByCart(reservations, allReservationsTab)).toEqual(reservations);
  });

  it("filters reservations by morning or afternoon while keeping both periods in all mode", () => {
    const reservations = [
      reservation({ id: 1, period: "Manhã" }),
      reservation({ id: 2, period: "Tarde" }),
    ];
    expect(filterReservationsByPeriod(reservations, "Todos")).toEqual(reservations);
    expect(filterReservationsByPeriod(reservations, "Manhã")).toEqual([reservations[0]]);
    expect(filterReservationsByPeriod(reservations, "Tarde")).toEqual([reservations[1]]);
  });

  it("provides a compact default set of complete-view columns", () => {
    expect(defaultCompleteViewColumns).toEqual([
      "date",
      "time",
      "cart",
      "className",
      "teacher",
      "room",
      "reservationStatus",
      "movementStatus",
    ]);
    expect(defaultCompleteViewColumns.length).toBeLessThan(completeViewColumns.length);
  });

  it("sanitizes saved column preferences and falls back for empty or invalid values", () => {
    expect(getVisibleCompleteViewColumns(["teacher", "unknown", "teacher", 5])).toEqual([
      "teacher",
    ]);
    expect(getVisibleCompleteViewColumns([])).toEqual(defaultCompleteViewColumns);
    expect(getVisibleCompleteViewColumns(null)).toEqual(defaultCompleteViewColumns);
  });

  it("builds a Monday-to-Sunday week using local dates", () => {
    const monday = getMondayOfWeek(new Date(2026, 8, 30));
    expect(formatDateKey(monday)).toBe("2026-09-28");
    expect(getWeekDates(monday).map(formatDateKey)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("places reservations in configured slots and retains unconfigured reservation times", () => {
    const rows = getCartScheduleRows(
      "Carrinho A",
      "2026-09-28",
      [
        { id: "slot-1", start: "07:00", end: "07:45" },
        { id: "slot-2", start: "07:45", end: "08:30" },
      ],
      [
        reservation(),
        reservation({ id: 2, start: "08:00", end: "08:45" }),
        reservation({ id: 3, cart: "Carrinho B" }),
      ],
    );

    expect(
      rows.map((row) => [
        row.start,
        row.end,
        row.reservations.map((item) => item.id),
      ]),
    ).toEqual([
      ["07:00", "07:45", [1]],
      ["07:45", "08:30", []],
      ["08:00", "08:45", [2]],
    ]);
  });

  it("prepares a reservation move without changing its identity or unrelated fields", () => {
    const result = prepareQuickAccessMove(
      [reservation()],
      1,
      {
        date: "2026-09-29",
        start: "08:00",
        end: "08:45",
        cart: "Carrinho B",
        period: "Manhã",
      },
      false,
      moveTestNow,
    );
    expect(result).toMatchObject({
      reservation: {
        id: 1,
        status: "Confirmada",
        date: "2026-09-29",
        start: "08:00",
        end: "08:45",
        cart: "Carrinho B",
        period: "Manhã",
        teacher: "Laura",
      },
    });
  });

  it("rejects invalid or conflicting quick-access moves", () => {
    const existing = reservation();
    const target = {
      date: existing.date,
      start: "07:00",
      end: "07:45",
      cart: "Carrinho B",
      period: "Manhã" as const,
    };
    expect(prepareQuickAccessMove([], existing.id, target, false, moveTestNow)).toMatchObject({
      ok: false,
      error: expect.stringContaining("não está mais"),
    });
    expect(prepareQuickAccessMove([reservation({ kind: "Reserva" })], 1, target, false, moveTestNow))
      .toMatchObject({
        ok: false,
        error: expect.stringContaining("Somente aulas"),
      });
    expect(prepareQuickAccessMove([existing], existing.id, {
        ...target,
        cart: "Reservas",
      }, false, moveTestNow)).toMatchObject({
        ok: false,
        error: expect.stringContaining("não podem ser movidos"),
      });
    expect(prepareQuickAccessMove(
        [existing, reservation({ id: 2, cart: "Carrinho B", start: "07:15", end: "08:00" })],
        existing.id,
        target,
        false,
        moveTestNow,
      )).toMatchObject({
        ok: false,
        error: expect.stringContaining("Já existe"),
      });
    expect(prepareQuickAccessMove([existing], existing.id, {
        ...target,
        start: "12:00",
        end: "12:45",
        cart: "Carrinho A",
      }, false, moveTestNow)).toMatchObject({
        ok: false,
        error: expect.stringContaining("transição"),
      });
  });

  it("prepares a group move to another cart without changing its date or time", () => {
    const selected = [
      reservation({ id: 1 }),
      reservation({ id: 2, start: "08:00", end: "08:45", className: "8º MA" }),
    ];
    const result = prepareQuickAccessCartMove(selected, [1, 2], "Carrinho B", false, moveTestNow);
    expect(result).toMatchObject({
      ok: true,
      reservations: [
        { id: 1, cart: "Carrinho B", date: "2026-09-28", start: "07:00", end: "07:45" },
        { id: 2, cart: "Carrinho B", date: "2026-09-28", start: "08:00", end: "08:45" },
      ],
    });
  });

  it("rejects group moves with missing lessons, Chromebook reservations, or occupied slots", () => {
    expect(prepareQuickAccessCartMove([reservation()], [1, 2], "Carrinho B", false, moveTestNow))
      .toMatchObject({ ok: false, error: expect.stringContaining("não está mais") });
    expect(prepareQuickAccessCartMove(
      [reservation({ kind: "Reserva" })],
      [1],
      "Carrinho B",
      false,
      moveTestNow,
    )).toMatchObject({ ok: false, error: expect.stringContaining("Somente aulas") });
    expect(prepareQuickAccessCartMove(
      [
        reservation(),
        reservation({ id: 2, cart: "Carrinho B", start: "07:15", end: "08:00" }),
      ],
      [1],
      "Carrinho B",
      false,
      moveTestNow,
    )).toMatchObject({ ok: false, error: expect.stringContaining("ocupados") });
  });

  it("blocks moves from past dates, elapsed times, and into past time slots", () => {
    expect(isReservationMoveInPast(
      reservation({ date: "2026-09-27" }),
      moveTestNow,
    )).toBe(true);
    expect(isReservationMoveInPast(
      reservation({ date: "2026-09-28", start: "05:59" }),
      moveTestNow,
    )).toBe(true);
    expect(isReservationMoveInPast(
      reservation({ date: "2026-09-28", start: "06:01" }),
      moveTestNow,
    )).toBe(false);
    expect(prepareQuickAccessMove(
      [reservation({ date: "2026-09-28", start: "06:01" })],
      1,
      {
        date: "2026-09-28",
        start: "05:30",
        end: "06:00",
        cart: "Carrinho B",
        period: "Manhã",
      },
      false,
      moveTestNow,
    )).toMatchObject({
      ok: false,
      error: expect.stringContaining("já passado"),
    });
    expect(prepareQuickAccessCartMove(
      [
        reservation({ date: "2026-09-28", start: "06:01" }),
        reservation({ id: 2, date: "2026-09-27", start: "07:00" }),
      ],
      [1, 2],
      "Carrinho B",
      false,
      moveTestNow,
    )).toMatchObject({
      ok: false,
      error: expect.stringContaining("já passado"),
    });
  });

  it("suggests the previous cart for a later reservation on the same floor", () => {
    const suggestions = getFloorOptimizationSuggestions(
      [
        reservation({ id: 1, date: "2026-09-28", room: "Sala 12", cart: "Carrinho A" }),
        reservation({ id: 2, date: "2026-09-28", room: "Sala 14", cart: "Carrinho B", start: "08:00" }),
      ],
      () => "1º piso",
      ["2026-09-28"],
      new Date(2026, 8, 28, 6, 0),
    );
    expect(suggestions).toEqual([
      {
        current: expect.objectContaining({ id: 2 }),
        previous: expect.objectContaining({ id: 1 }),
        floor: "1º piso",
      },
    ]);
  });

  it("does not suggest carts when there are no upcoming lessons in the visible week", () => {
    const previousWeekReservations = [
      reservation({ id: 1, date: "2026-09-28", room: "Sala 12", cart: "Carrinho A" }),
      reservation({ id: 2, date: "2026-09-28", room: "Sala 14", cart: "Carrinho B", start: "08:00" }),
    ];
    const now = new Date(2026, 9, 5, 9, 0);

    expect(getFloorOptimizationSuggestions(
      previousWeekReservations,
      () => "1º piso",
      ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
      now,
    )).toEqual([]);
    expect(getFloorOptimizationSuggestions(
      [
        reservation({ id: 1, date: "2026-10-05", start: "07:00", room: "Sala 12", cart: "Carrinho A" }),
        reservation({ id: 2, date: "2026-10-05", start: "08:00", room: "Sala 14", cart: "Carrinho B" }),
      ],
      () => "1º piso",
      ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
      now,
    )).toEqual([]);
    expect(getFloorOptimizationSuggestions(
      [],
      () => "1º piso",
      ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
      now,
    )).toEqual([]);
  });
});
