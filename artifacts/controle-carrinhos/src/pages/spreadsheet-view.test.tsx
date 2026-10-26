import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMondayOfWeek, formatDateKey } from "@/lib/spreadsheet-view";
import { SpreadsheetViewPage } from "./spreadsheet-view";

const {
  getCampusData,
  loadTeacherReservations,
  getSession,
  saveSharedReservation,
  deleteSharedReservation,
  loadSharedReservations,
  moveSharedReservationsToCart,
} = vi.hoisted(() => ({
  getCampusData: vi.fn(),
  loadTeacherReservations: vi.fn(),
  getSession: vi.fn(() => ({ role: "admin" })),
  saveSharedReservation: vi.fn(),
  deleteSharedReservation: vi.fn(),
  loadSharedReservations: vi.fn(),
  moveSharedReservationsToCart: vi.fn(),
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

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedSession: getSession,
}));

vi.mock("@/lib/reservations-api", () => ({
  deleteSharedReservation,
  loadSharedReservations,
  requestSharedReservationsRefresh: vi.fn(),
  moveSharedReservationsToCart,
  saveSharedReservation,
}));

describe("teacher spreadsheet view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{ name: "Carrinho A", unavailable: false }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
    });
    loadSharedReservations.mockResolvedValue([]);
    saveSharedReservation.mockResolvedValue(undefined);
    deleteSharedReservation.mockResolvedValue(undefined);
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
    expect(screen.queryByRole("button", { name: /excluir agendamento/i })).not.toBeInTheDocument();

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

  it("opens quick access by default and restores the last selected mode", () => {
    const { unmount } = render(<SpreadsheetViewPage />);
    const quickTab = screen.getByRole("tab", { name: /acesso rápido/i });
    const completeTab = screen.getByRole("tab", { name: /acesso completo/i });

    expect(quickTab).toHaveAttribute("aria-selected", "true");
    expect(completeTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("quick-week-grid").className)
      .toContain("min-w-[3800px]");
    expect(screen.getAllByTestId("quick-day-grid")[0].className)
      .toContain("min-w-[740px]");
    expect(screen.getAllByTestId("quick-time-grid")[0].className)
      .toContain("grid-cols-[96px_minmax(0,1fr)]");

    fireEvent.click(completeTab);
    expect(completeTab).toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem("controle-carrinhos-view-mode")).toBe("complete");
    unmount();

    render(<SpreadsheetViewPage />);
    expect(screen.getByRole("tab", { name: /acesso completo/i }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("keeps the bottom border on the last empty quick-access slot", () => {
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{ name: "Carrinho A", unavailable: false }],
      cartSchedules: {
        "Carrinho A": {
          Manhã: [],
          Tarde: [{ id: "late-slot", start: "16:50", end: "17:35" }],
        },
      },
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);

    const lastSlot = screen.getAllByTestId("quick-schedule-row-Carrinho A-16:50")[0];
    expect(lastSlot.className).toContain("border-b");
    expect(lastSlot.className).toContain("border-[#b9c4d1]");
    expect(lastSlot.className).not.toContain("last:border-b-0");
  });

  it("lets an administrator type a teacher name directly into a free sheet slot and reserve it", async () => {
    const replaceReservations = vi.fn();
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{ name: "Carrinho A", unavailable: false }],
      cartSchedules: {
        "Carrinho A": {
          Manhã: [{ id: "morning-slot", start: "07:00", end: "07:45" }],
          Tarde: [],
        },
      },
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations,
    });
    const monday = formatDateKey(getMondayOfWeek(new Date()));

    render(<SpreadsheetViewPage />);
    fireEvent.click((await screen.findAllByRole("button", {
      name: "Reservar horário 07:00 para Carrinho A",
    }))[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do professor" }), {
      target: { value: "  Ana   Souza " },
    });
    fireEvent.change(screen.getByLabelText("Ano ou série"), {
      target: { value: "  3º ano B " },
    });
    fireEvent.change(screen.getByLabelText("Sala"), {
      target: { value: "Sala 12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reservar" }));

    await waitFor(() => expect(saveSharedReservation).toHaveBeenCalledWith(expect.objectContaining({
      teacher: "Ana Souza",
      className: "3º ano B",
      room: "Sala 12",
      date: monday,
      start: "07:00",
      end: "07:45",
      cart: "Carrinho A",
    })));
    expect(loadSharedReservations).toHaveBeenCalled();
    expect(replaceReservations).toHaveBeenCalledWith([]);
    expect(screen.queryByRole("textbox", { name: "Nome do professor" })).not.toBeInTheDocument();
  });

  it("lets an administrator delete a reservation from the spreadsheet", async () => {
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    const replaceReservations = vi.fn();
    getCampusData.mockReturnValue({
      reservations: [{
        id: 92,
        teacher: "Ana Souza",
        segment: "Fundamental 1",
        subject: "Aula",
        className: "3º ano B",
        room: "Sala 12",
        period: "Manhã",
        date: monday,
        start: "07:00",
        end: "07:45",
        cart: "Carrinho A",
        status: "Confirmada",
        kind: "Aula",
        quantity: 1,
      }],
      movements: [],
      carts: [{ name: "Carrinho A", unavailable: false }],
      cartSchedules: {
        "Carrinho A": {
          Manhã: [{ id: "morning-slot", start: "07:00", end: "07:45" }],
          Tarde: [],
        },
      },
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SpreadsheetViewPage />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Excluir agendamento de Ana Souza",
    }));

    await waitFor(() => expect(deleteSharedReservation).toHaveBeenCalledWith(92));
    expect(replaceReservations).toHaveBeenCalledWith([]);
  });

  it("lets an administrator edit the teacher, class, and room of an existing reservation", async () => {
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    const replaceReservations = vi.fn();
    getCampusData.mockReturnValue({
      reservations: [{
        id: 93,
        teacher: "Ana Souza",
        segment: "Fundamental 1",
        subject: "Aula",
        className: "Aula pela administração",
        room: "A definir",
        period: "Manhã",
        date: monday,
        start: "07:00",
        end: "07:45",
        cart: "Carrinho A",
        status: "Confirmada",
        kind: "Aula",
        quantity: 1,
      }],
      movements: [],
      carts: [{ name: "Carrinho A", unavailable: false }],
      cartSchedules: {
        "Carrinho A": {
          Manhã: [{ id: "morning-slot", start: "07:00", end: "07:45" }],
          Tarde: [],
        },
      },
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations,
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Editar agendamento de Ana Souza",
    }));
    expect(screen.getByLabelText("Ano ou série")).toHaveValue("Aula pela administração");
    expect(screen.getByLabelText("Sala")).toHaveValue("A definir");

    fireEvent.change(screen.getByLabelText("Nome do professor"), { target: { value: "Bruna Lima" } });
    fireEvent.change(screen.getByLabelText("Ano ou série"), { target: { value: "4º ano A" } });
    fireEvent.change(screen.getByLabelText("Sala"), { target: { value: "Sala 07" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição" }));

    await waitFor(() => expect(saveSharedReservation).toHaveBeenCalledWith(expect.objectContaining({
      teacher: "Bruna Lima",
      className: "4º ano A",
      room: "Sala 07",
      date: monday,
    }), 93));
    expect(replaceReservations).toHaveBeenCalledWith([]);
  });

  it("does not offer direct booking to non-admin staff", () => {
    getSession.mockReturnValue({ role: "operator" });

    render(<SpreadsheetViewPage />);

    expect(screen.queryByRole("button", { name: /reservar horário/i })).not.toBeInTheDocument();
  });
});
