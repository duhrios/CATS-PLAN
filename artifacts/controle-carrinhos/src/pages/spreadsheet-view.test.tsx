import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMondayOfWeek, formatDateKey } from "@/lib/spreadsheet-view";
import { SpreadsheetViewPage } from "./spreadsheet-view";

const { getCampusData, loadTeacherReservations } = vi.hoisted(() => ({
  getCampusData: vi.fn(),
  loadTeacherReservations: vi.fn(),
}));

vi.mock("@/lib/campus-data", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/campus-data")>(),
  useCampusData: getCampusData,
}));

vi.mock("@/lib/room-directory", () => ({
  useRoomDirectory: () => ({ floorForRoom: () => null }),
}));

vi.mock("@/lib/teacher-spreadsheet", () => ({
  loadTeacherSpreadsheetReservations: loadTeacherReservations,
}));

describe("teacher spreadsheet view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{ name: "Carrinho A", unavailable: false }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
    });
    const date = new Date();
    const monday = getMondayOfWeek(date);
    loadTeacherReservations.mockResolvedValue([{
      id: 41,
      teacher: "Ana Souza",
      segment: "Fundamental 2",
      subject: "",
      className: "2º ano A",
      room: "",
      period: "Manhã",
      date: formatDateKey(monday),
      start: "08:00",
      end: "08:45",
      cart: "Carrinho A",
      status: "Aguardando",
      kind: "Aula",
      quantity: 1,
    }]);
  });

  it("shows only the quick spreadsheet in non-editable mode for teachers", async () => {
    render(<SpreadsheetViewPage readOnly />);

    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("2º ano A")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: /modo de visualização da planilha/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /acesso completo/i })).not.toBeInTheDocument();
    expect(screen.getByText(/somente para consulta/i)).toBeInTheDocument();

    const teacherName = screen.getByText("Ana Souza");
    const reservation = teacherName.closest("[draggable]");
    expect(reservation).toBeNull();
    expect(teacherName.closest('[role="button"]')).toBeNull();
    expect(screen.queryByText(/arraste/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(loadTeacherReservations).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });
  });
});
