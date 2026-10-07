import { describe, expect, it } from "vitest";
import type { CartMovement, Reservation } from "@/lib/campus-data";
import {
  getDueMovementNotifications,
  getDueRepeatedRoomClassReservations,
  getAlreadyInRoomReservationIds,
  getStaleRepeatedRoomClassMovementIds,
  repeatedLessonAutoCompleteActor,
} from "@/lib/movement-schedule";

const reservation = (overrides: Partial<Reservation>): Reservation => ({
  id: 1,
  teacher: "Laura",
  segment: "Fundamental 2",
  subject: "Teste",
  className: "7° MA",
  room: "Sala 22",
  period: "Tarde",
  date: "2026-09-28",
  start: "14:00",
  end: "14:45",
  cart: "Carrinho A",
  status: "Aguardando",
  kind: "Aula",
  quantity: 30,
  ...overrides,
});

const movement = (
  reservationId: number,
  status: CartMovement["status"],
): CartMovement => ({
  reservationId,
  status,
  updatedAt: "2026-09-28T12:00:00.000Z",
  notReceived: false,
  autoCompleted: false,
  requestCount: 0,
});

describe("operator movement schedule rules", () => {
  it("notifies every cart scheduled at the same time", () => {
    const reservations = [
      reservation({
        id: 1,
        cart: "Carrinho A",
        room: "Sala 1",
        className: "6° MA",
      }),
      reservation({
        id: 2,
        cart: "Carrinho B",
        room: "Sala 2",
        className: "7° MA",
      }),
      reservation({
        id: 3,
        cart: "Carrinho C",
        room: "Sala 3",
        className: "8° MA",
      }),
    ];

    expect(
      getDueMovementNotifications(reservations, [], 14 * 60, false, 10, []).map(
        ({ id }) => id,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("does not raise reminders for reservations whose time has already passed", () => {
    const past = reservation({ start: "07:45", end: "08:30" });
    expect(
      getDueMovementNotifications([past], [], 8 * 60 + 31, false, 10, []),
    ).toEqual([]);
  });

  it("does not remind for movements that are underway, completed, or not attended", () => {
    const current = reservation({ start: "14:00", end: "14:45" });
    const terminalAndActiveMovements = [
      movement(current.id, "Movendo"),
      movement(current.id + 1, "Concluído"),
      movement(current.id + 2, "Não atendida"),
    ];
    const reservations = [
      current,
      reservation({ id: current.id + 1 }),
      reservation({ id: current.id + 2 }),
    ];

    expect(
      getDueMovementNotifications(
        reservations,
        terminalAndActiveMovements,
        14 * 60 + 10,
        false,
        10,
        [],
      ),
    ).toEqual([]);
  });

  it("keeps the cart in the same room for consecutive bookings even when the class or teacher changes", () => {
    const reservations = [
      reservation({ id: 1, start: "14:00", end: "14:45" }),
      reservation({
        id: 2,
        start: "14:45",
        end: "15:30",
        teacher: "Geize",
        className: "4° TB",
      }),
    ];
    const movements = [movement(1, "Movendo")];

    expect([
      ...getAlreadyInRoomReservationIds(reservations, movements),
    ]).toEqual([2]);
    expect(
      getDueMovementNotifications(
        reservations,
        [],
        14 * 60 + 30,
        false,
        10,
        [],
      ).map(({ id }) => id),
    ).toEqual([1]);
    expect(
      getDueMovementNotifications(
        reservations,
        movements,
        14 * 60 + 45,
        false,
        10,
        [],
      ).map(({ id }) => id),
    ).toEqual([]);
    expect(
      getDueMovementNotifications(
        reservations,
        [],
        14 * 60 + 45,
        false,
        10,
        [],
      ).map(({ id }) => id),
    ).toEqual([2]);
  });

  it("notifies again when the cart has an intervening destination or a time gap", () => {
    const first = reservation({
      id: 1,
      start: "08:00",
      end: "08:45",
      cart: "Carrinho A",
    });
    const intervening = reservation({
      id: 2,
      start: "08:45",
      end: "09:30",
      teacher: "Fábio",
      className: "6° MD",
      room: "Sala 25",
      cart: "Carrinho A",
    });
    const laterSameRoom = reservation({
      id: 3,
      start: "09:30",
      end: "10:15",
      cart: "Carrinho A",
    });
    const laterWithGap = reservation({
      id: 4,
      start: "10:30",
      end: "11:15",
      cart: "Carrinho A",
    });
    const reservations = [first, intervening, laterSameRoom, laterWithGap];
    const movements = [movement(1, "Concluído"), movement(2, "Concluído")];

    expect([
      ...getAlreadyInRoomReservationIds(reservations, movements),
    ]).toEqual([]);
    expect(
      getDueMovementNotifications(
        reservations,
        movements,
        9 * 60 + 30,
        false,
        10,
        [],
      ).map(({ id }) => id),
    ).toEqual([3]);
    expect(
      getDueMovementNotifications(
        reservations,
        movements,
        10 * 60 + 30,
        false,
        10,
        [],
      ).map(({ id }) => id),
    ).toEqual([4]);
    const differentCartSameRoom = reservation({
      id: 5,
      start: "14:45",
      end: "15:30",
      cart: "Carrinho B",
    });
    expect([
      ...getAlreadyInRoomReservationIds(
        [first, differentCartSameRoom],
        [movement(1, "Movendo")],
      ),
    ]).toEqual([]);
  });

  it("auto-completes a same-room follow-up at its start when the previous delivery was started", () => {
    const repeated = reservation({ id: 2, start: "14:45", end: "15:30" });
    const reservations = [
      reservation({ id: 1, start: "14:00", end: "14:45" }),
      repeated,
    ];
    const previousMoved = [movement(1, "Movendo")];

    expect(
      getDueRepeatedRoomClassReservations(
        reservations,
        previousMoved,
        14 * 60 + 44,
      ),
    ).toEqual([]);
    expect(
      getDueRepeatedRoomClassReservations(
        reservations,
        previousMoved,
        14 * 60 + 45,
      ),
    ).toEqual([repeated]);
    expect(
      getDueRepeatedRoomClassReservations(
        reservations,
        [movement(2, "Concluído")],
        14 * 60 + 45,
      ),
    ).toEqual([]);
    expect(
      getDueRepeatedRoomClassReservations(
        reservations,
        [...previousMoved, movement(2, "Não atendida")],
        14 * 60 + 45,
      ),
    ).toEqual([repeated]);
  });

  it("restores prior auto-completions that are no longer consecutive lessons", () => {
    const reservations = [
      reservation({ id: 1, start: "08:00", end: "08:45", cart: "Carrinho A" }),
      reservation({
        id: 2,
        start: "08:45",
        end: "09:30",
        cart: "Carrinho A",
        room: "Sala 23",
      }),
      reservation({ id: 3, start: "10:00", end: "10:45", cart: "Carrinho A" }),
      reservation({ id: 4, start: "10:45", end: "11:30", cart: "Carrinho A" }),
      reservation({ id: 5, start: "12:00", end: "12:45", cart: "Carrinho B" }),
      reservation({ id: 6, start: "12:45", end: "13:30", cart: "Carrinho B" }),
    ];
    const stale = {
      ...movement(3, "Concluído"),
      autoCompleted: true,
      completedBy: repeatedLessonAutoCompleteActor,
    };
    const staleFollowup = {
      ...movement(4, "Concluído"),
      autoCompleted: true,
      completedBy: repeatedLessonAutoCompleteActor,
    };
    const validFirst = movement(5, "Movendo");
    const valid = {
      ...movement(6, "Concluído"),
      autoCompleted: true,
      completedBy: repeatedLessonAutoCompleteActor,
    };

    expect(
      getStaleRepeatedRoomClassMovementIds(reservations, [
        stale,
        staleFollowup,
        validFirst,
        valid,
      ]),
    ).toEqual([3, 4]);
  });
});
