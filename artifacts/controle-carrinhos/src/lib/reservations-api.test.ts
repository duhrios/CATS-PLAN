import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteSharedReservation,
  loadSharedReservations,
  moveSharedReservationsToCart,
  onSharedReservationsRefresh,
  requestSharedReservationsRefresh,
  saveSharedReservation,
} from "@/lib/reservations-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared reservations API", () => {
  it("signals an in-app data refresh and waits for the reservation provider", async () => {
    const unsubscribe = onSharedReservationsRefresh((complete) => complete());
    try {
      await expect(requestSharedReservationsRefresh()).resolves.toBeUndefined();
    } finally {
      unsubscribe();
    }
  });

  it("maps server reservations into the agenda model", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 42,
      teacherName: "Laura",
      segment: "Fundamental 2",
      subject: "Teste",
      className: "7° MA",
      room: "Sala 22",
      period: "Manhã",
      scheduledDate: "2026-09-28",
      startTime: "07:00:00",
      endTime: "07:45:00",
      cartId: 5,
      cartName: "Carrinho B",
      kind: "Aula",
      quantity: 30,
      status: "Aguardando",
    }]), { status: 200 })));

    await expect(loadSharedReservations()).resolves.toEqual([{
      id: 42,
      teacher: "Laura",
      segment: "Fundamental 2",
      subject: "Teste",
      className: "7° MA",
      room: "Sala 22",
      period: "Manhã",
      date: "2026-09-28",
      start: "07:00",
      end: "07:45",
      cart: "Carrinho B",
      status: "Aguardando",
      kind: "Aula",
      quantity: 30,
    }]);
  });

  it("persists a reservation using the shared cart ID", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 5, name: "Carrinho B", code: "B" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveSharedReservation({
      teacher: "Laura",
      segment: "Fundamental 2",
      subject: "Teste",
      className: "7° MA",
      room: "Sala 22",
      period: "Manhã",
      date: "2026-09-28",
      start: "07:00",
      end: "07:45",
      cart: "Carrinho B",
      kind: "Aula",
      quantity: 30,
    });

    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(fetchMock.mock.calls[1][0]).toBe("/api/reservations");
    expect(JSON.parse(String(request.body))).toMatchObject({
      teacherName: "Laura",
      scheduledDate: "2026-09-28",
      cartId: 5,
      startTime: "07:00",
      endTime: "07:45",
    });
  });

  it("stores reserve requests against the reserve inventory anchor", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 4, name: "Carrinho A", code: "A" },
        { id: 5, name: "Carrinho B", code: "B" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveSharedReservation({
      teacher: "Laura",
      segment: "Fundamental 2",
      subject: "Teste",
      className: "Chromebooks de reserva",
      room: "Reserva",
      period: "Manhã",
      date: "2026-09-28",
      start: "07:00",
      end: "07:45",
      cart: "Reservas",
      kind: "Reserva",
      quantity: 2,
    });

    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      cartId: 4,
      kind: "Reserva",
      quantity: 2,
    });
  });

  it("updates an existing reservation by ID and surfaces a rejected move", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 5, name: "Carrinho B", code: "B" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: "Já existe um agendamento para este carrinho nesse intervalo." }),
        { status: 409 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveSharedReservation({
      teacher: "Laura",
      segment: "Fundamental 2",
      subject: "Teste",
      className: "7° MA",
      room: "Sala 22",
      period: "Tarde",
      date: "2026-09-29",
      start: "13:00",
      end: "13:45",
      cart: "Carrinho B",
      kind: "Aula",
      quantity: 30,
    }, 42)).rejects.toThrow("Já existe um agendamento");

    expect(fetchMock.mock.calls[1][0]).toBe("/api/reservations/42");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)))
      .toMatchObject({
        scheduledDate: "2026-09-29",
        startTime: "13:00",
        endTime: "13:45",
        cartId: 5,
      });
  });

  it("continues moving selected lessons and reports partial saves", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 5, name: "Carrinho B", code: "B" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Horário ocupado." }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 5, name: "Carrinho B", code: "B" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 43 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(moveSharedReservationsToCart([
      {
        id: 42,
        teacher: "Laura",
        segment: "Fundamental 2",
        subject: "Teste",
        className: "7° MA",
        room: "Sala 22",
        period: "Manhã",
        date: "2026-09-28",
        start: "07:00",
        end: "07:45",
        cart: "Carrinho B",
        status: "Confirmada",
        kind: "Aula",
        quantity: 30,
      },
      {
        id: 43,
        teacher: "Laura",
        segment: "Fundamental 2",
        subject: "Teste",
        className: "8° MA",
        room: "Sala 24",
        period: "Manhã",
        date: "2026-09-28",
        start: "08:00",
        end: "08:45",
        cart: "Carrinho B",
        status: "Confirmada",
        kind: "Aula",
        quantity: 30,
      },
    ])).rejects.toThrow("1 de 2 aulas foram salvas");

    expect(fetchMock.mock.calls[1][0]).toBe("/api/reservations/42");
    expect(fetchMock.mock.calls[3][0]).toBe("/api/reservations/43");
  });

  it("surfaces API failures instead of reporting a successful save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Carrinho indisponível." }), { status: 409 }),
    ));

    await expect(loadSharedReservations()).rejects.toThrow("Carrinho indisponível.");
  });

  it("deletes a reservation on the shared API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteSharedReservation(42);

    expect(fetchMock).toHaveBeenCalledWith("/api/reservations/42", { method: "DELETE" });
  });
});
