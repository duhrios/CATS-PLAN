import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartsPage, HistoryPage, ReservationModal } from "./operations";

const { useCampusData, loadTeacherAccounts, loadSharedHistory } = vi.hoisted(() => ({
  useCampusData: vi.fn(),
  loadTeacherAccounts: vi.fn(),
  loadSharedHistory: vi.fn(),
}));

vi.mock("@/lib/campus-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campus-data")>();
  return { ...actual, useCampusData };
});

vi.mock("@/lib/room-directory", () => ({
  useRoomDirectory: () => ({
    classEntries: [],
    roomForClass: (className: string) => className ? "Sala 22" : "",
    classesForRoom: () => [],
    roomOptionsForSegment: () => ["Sala 22"],
  }),
}));

vi.mock("@/lib/teacher-accounts", () => ({
  loadTeacherAccounts,
  sortTeacherAccounts: (accounts: unknown[]) => accounts,
}));

vi.mock("@/lib/history-api", () => ({ loadSharedHistory }));

describe("reservation modal teacher selection", () => {
  const onSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockResolvedValue(true);
    loadSharedHistory.mockReturnValue(new Promise(() => {}));
    loadTeacherAccounts.mockResolvedValue([{
      id: "21",
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 2",
      subject: "Ciências",
      className: "7º ano A",
      mustSetPassword: false,
    }]);
    useCampusData.mockReturnValue({
      carts: [{ id: "cart-a", name: "Carrinho A", unavailable: false }],
      reservations: [],
      wifiRooms: [],
      wifiPoints: [],
      movementSettings: { allowCartATransitionScheduling: false },
      campusSettings: { reservationsEnabled: true, reservationLimit: 10 },
      cartSchedules: {
        "Carrinho A": { Manhã: [{ start: "07:00", end: "07:45" }], Tarde: [] },
      },
    });

  });

  it("lets an administrator choose an active teacher and saves a linked reservation", async () => {
    render(
      <ReservationModal
        mode="admin"
        onClose={vi.fn()}
        onSave={onSave}
        teacher={{ name: "teste", segment: "Fundamental 2", subject: "Teste" }}
        reserveAvailable={10}
        teacherReserved={0}
      />,
    );

    const teacherSelect = await screen.findByTestId("select-reservation-teacher");
    expect(screen.getByRole("option", { name: /Ana Souza/ })).toBeInTheDocument();
    fireEvent.change(teacherSelect, { target: { value: "21" } });
    expect(screen.getByTestId("input-reservation-subject")).toHaveValue("Ciências");
    expect(screen.getByTestId("input-reservation-class")).toHaveValue("7º ano A");
    expect(screen.getByTestId("input-reservation-room")).toHaveValue("Sala 22");

    const form = screen.getByTestId("form-reservation");
    fireEvent.submit(form);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      teacher: "Ana Souza",
      teacherAccountId: "21",
      segment: "Fundamental 2",
      subject: "Ciências",
      className: "7º ano A",
      room: "Sala 22",
    })));
  });

  it("keeps teacher reservations tied to the signed-in teacher profile", async () => {
    render(
      <ReservationModal
        mode="user"
        onClose={vi.fn()}
        onSave={onSave}
        teacher={{ name: "Ana Souza", segment: "Fundamental 2", subject: "Ciências" }}
        reserveAvailable={10}
        teacherReserved={0}
      />,
    );

    expect(screen.getByTestId("input-reservation-teacher")).toHaveValue("Ana Souza");
    expect(screen.queryByTestId("select-reservation-teacher")).not.toBeInTheDocument();
    expect(loadTeacherAccounts).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("input-reservation-date"), {
      target: { value: "2030-10-15" },
    });
    fireEvent.change(screen.getByTestId("input-reservation-class"), {
      target: { value: "7º ano A" },
    });
    fireEvent.submit(screen.getByTestId("form-reservation"));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      teacher: "Ana Souza",
      className: "7º ano A",
    })));
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("teacherAccountId");
  });
});

describe("reservation activity history", () => {
  it("shows each event date and orders the newest activity first", () => {
    useCampusData.mockReturnValue({
      reservations: [
        {
          id: 1,
          teacher: "Ana Souza",
          segment: "Fundamental 1",
          subject: "Matemática",
          className: "3º ano A",
          room: "Sala 12",
          period: "Manhã",
          date: "2026-10-20",
          start: "08:30",
          end: "09:15",
          cart: "Carrinho A",
          status: "Confirmada",
          kind: "Aula",
          quantity: 1,
        },
        {
          id: 2,
          teacher: "Bruna Lima",
          segment: "Fundamental 2",
          subject: "Ciências",
          className: "6º ano B",
          room: "Sala 08",
          period: "Manhã",
          date: "2026-10-21",
          start: "09:15",
          end: "10:00",
          cart: "Carrinho B",
          status: "Concluída",
          kind: "Aula",
          quantity: 1,
        },
      ],
      movements: [],
    });

    render(<HistoryPage />);

    const rows = screen.getAllByTestId(/^row-history-reservation-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Bruna Lima");
    expect(rows[1]).toHaveTextContent("Ana Souza");
    expect(screen.getByTestId("date-history-reservation-2")).toHaveTextContent(
      "21 de outubro de 2026",
    );
    expect(screen.getByTestId("date-history-reservation-1")).toHaveTextContent(
      "20 de outubro de 2026",
    );
    expect(screen.getByTestId("history-results-count")).toHaveTextContent("2 atividades encontradas");

    fireEvent.click(screen.getByTestId("button-filter-history-reservas"));
    expect(screen.queryByTestId(/^row-history-reservation-/)).not.toBeInTheDocument();
    expect(screen.getByTestId("history-results-count")).toHaveTextContent(
      "0 atividades encontradas",
    );

    fireEvent.click(screen.getByTestId("button-filter-history-aulas"));
    expect(screen.getAllByTestId(/^row-history-reservation-/)).toHaveLength(2);
    expect(screen.getByTestId("history-results-count")).toHaveTextContent("2 atividades encontradas");
  });

  it("includes manually assigned reserve Chromebooks in the Reservas history filter with their time", () => {
    useCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        id: "cart-b",
        name: "Carrinho B",
        reserveAssignments: {
          C48: {
            teacher: "Kaique Moura",
            date: "2026-11-18",
            start: "10:25",
            personType: "Professor",
          },
          C49: {
            teacher: "Kaique Moura",
            date: "2026-11-18",
            start: "10:25",
            personType: "Professor",
          },
          C50: {
            teacher: "Kaique Moura",
            date: "2026-11-18",
            personType: "Professor",
          },
        },
      }],
    });

    render(<HistoryPage />);
    fireEvent.click(screen.getByTestId("button-filter-history-reservas"));

    const rows = screen.getAllByTestId(/^row-history-reserve-assignment-/);
    const timedRow = rows.find((row) => row.textContent?.includes("10:25"));
    const legacyRow = rows.find((row) => row.textContent?.includes("C50"));
    expect(timedRow).toHaveTextContent("Chromebooks de reserva atribuídos");
    expect(timedRow).toHaveTextContent("Kaique Moura");
    expect(timedRow).toHaveTextContent("C48, C49");
    expect(legacyRow).toHaveTextContent("Horário não informado");
    expect(screen.getByTestId("history-results-count")).toHaveTextContent("2 atividades encontradas");
  });

  it("shows returned reserve Chromebooks from persistent history after the assignment is removed", async () => {
    useCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        id: "cart-c",
        name: "Carrinho C",
        reserveAssignments: {},
      }],
    });
    loadSharedHistory.mockResolvedValue([{
      id: "activity-41",
      type: "Reserva",
      title: "Chromebook de reserva devolvido",
      detail: "Carrinho C · Unidades: C48, C49 · Responsável: Ana Souza · Agendamento: 2026-11-23 às 09:00",
      date: "2026-11-23",
      time: "09:15",
      tone: "bad",
      person: "Ana Souza",
      profile: "Professor",
      entityKeys: [
        "reserve-assignment:cart-c:C48",
        "reserve-assignment:cart-c:C49",
      ],
    }]);

    render(<HistoryPage />);
    fireEvent.click(screen.getByTestId("button-filter-history-reservas"));

    const row = await screen.findByTestId("row-history-activity-41");
    expect(row).toHaveTextContent("Chromebook de reserva devolvido");
    expect(row).toHaveTextContent("C48, C49");
    expect(row).toHaveTextContent("Ana Souza");
    expect(screen.getByTestId("history-results-count")).toHaveTextContent(
      "1 atividade encontrada",
    );
  });
});

describe("cart unit availability observations", () => {
  it("opens an observation when marking a Chromebook unavailable and saves the reason", () => {
    const toggleCartUnitUnavailable = vi.fn();
    const setCartUnitUnavailableReason = vi.fn();
    useCampusData.mockReturnValue({
      carts: [{
        id: "cart-a",
        name: "Carrinho A",
        code: "A",
        prefix: "A",
        total: 2,
        available: 2,
        location: "Sala TI",
        status: "Pronto",
        lastCheck: "2026-01-01",
        accent: "bg-blue-500",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: [],
        deletedUnits: [],
        reserveCapacity: 0,
      }],
      addCart: vi.fn(),
      addCartUnit: vi.fn(),
      deleteCart: vi.fn(),
      toggleCartUnavailable: vi.fn(),
      toggleCartUnitUnavailable,
      setCartUnitUnavailableReason,
      deleteCartUnit: vi.fn(),
      toggleCartUnitReserved: vi.fn(),
      restoreReservedUnits: vi.fn(),
      reservations: [],
      reserveAvailable: 0,
      campusSettings: { reservationsEnabled: true, reservationLimit: 10 },
      updateCampusSettings: vi.fn(),
    });

    render(<CartsPage />);
    const inventoryToggle = screen.getByRole("button", {
      name: "Minimizar Inventário operacional",
    });
    expect(inventoryToggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(inventoryToggle);
    expect(screen.getByRole("button", {
      name: "Maximizar Inventário operacional",
    })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", {
      name: "Maximizar Inventário operacional",
    }));
    fireEvent.click(screen.getByTestId("button-unit-A1"));

    expect(toggleCartUnitUnavailable).toHaveBeenCalledWith("cart-a", "A1");
    expect(screen.getByTestId("unit-observation-panel-A1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Observação do Chromebook A1"), {
      target: { value: "  Tela quebrada  " },
    });
    fireEvent.click(screen.getByTestId("button-save-unit-observation-A1"));

    expect(setCartUnitUnavailableReason).toHaveBeenCalledWith(
      "cart-a",
      "A1",
      "  Tela quebrada  ",
    );
  });
});
