import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadTeacherSpreadsheetEnabled,
  loadTeacherSpreadsheetReservations,
  saveTeacherSpreadsheetEnabled,
} from "./teacher-spreadsheet";

describe("teacher spreadsheet API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the shared teacher access setting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ enabled: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadTeacherSpreadsheetEnabled()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/teacher-spreadsheet/settings", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {},
    });
  });

  it("saves the teacher access setting through the authenticated API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ enabled: false }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveTeacherSpreadsheetEnabled(false)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/teacher-spreadsheet/settings", {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("loads only the teacher-safe quick-view fields for the requested week", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 5,
      teacherName: "Ana Souza",
      className: "2º ano A",
      period: "Manhã",
      scheduledDate: "2026-10-05",
      startTime: "08:00:00",
      endTime: "08:45:00",
      cartName: "Carrinho A",
      kind: "Aula",
    }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadTeacherSpreadsheetReservations("2026-10-05", "2026-10-09")).resolves.toEqual([{
      id: 5,
      teacher: "Ana Souza",
      segment: "Fundamental 2",
      subject: "",
      className: "2º ano A",
      room: "",
      period: "Manhã",
      date: "2026-10-05",
      start: "08:00",
      end: "08:45",
      cart: "Carrinho A",
      status: "Aguardando",
      kind: "Aula",
      quantity: 1,
    }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teacher-spreadsheet/reservations?from=2026-10-05&to=2026-10-09",
      { cache: "no-store", credentials: "same-origin", headers: {} },
    );
  });

  it("surfaces disabled access rather than returning an empty schedule", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: "A visualização da planilha está desativada pelo administrador.",
      }), { status: 403 }),
    ));

    await expect(loadTeacherSpreadsheetReservations("2026-10-05", "2026-10-09"))
      .rejects.toThrow("A visualização da planilha está desativada pelo administrador.");
  });
});
