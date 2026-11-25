import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { todayISO } from "@/components/app-ui";
import {
  CartsPage,
  HistoryPage,
  ReservationModal,
  ReservationsPage,
  WifiPage,
} from "./operations";

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
    roomOptions: [],
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

describe("reservation calendar visibility", () => {
  beforeEach(() => {
    useCampusData.mockReturnValue({
      reservations: [],
      replaceReservations: vi.fn(),
      saveReservation: vi.fn(),
      teacher: { name: "Ana Souza", segment: "Fundamental 2", subject: "Ciências" },
      reserveAvailable: 4,
      teacherReserved: 0,
      movements: [],
      updateMovementStatus: vi.fn(),
      reportNotReceived: vi.fn(),
      requestMovementAgain: vi.fn(),
      deleteReservation: vi.fn(),
      carts: [],
      movementSettings: { allowCartATransitionScheduling: false },
      campusSettings: { reservationsEnabled: true, reservationLimit: 10 },
    });
  });

  it.each(["admin", "user", "operator"] as const)(
    "shows the calendar expanded by default for the %s profile",
    (mode) => {
      render(
        <Router>
          <ReservationsPage mode={mode} />
        </Router>,
      );

      expect(
        screen.getByRole("button", { name: "Minimizar Calendário" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByTestId("calendar-reservations").closest("[hidden]")).toBeNull();
    },
  );
});

describe("Wi-Fi inventory counts", () => {
  const mobileAntenna = {
    id: "mobile-1",
    name: "Antena Volante",
    point: "AV-01",
    location: "Armário de conectividade",
    type: "Antena volante",
    status: "Disponível",
  } as const;

  const mockWifiInventory = (deleteWifiPoint = vi.fn()) => {
    useCampusData.mockReturnValue({
      wifiPoints: [mobileAntenna],
      wifiRooms: [],
      toggleRoomWifi: vi.fn(),
      updateWifiPointStatus: vi.fn(),
      updateWifiPoint: vi.fn(),
      addWifiPoint: vi.fn(),
      deleteWifiPoint,
      assignMobileAntenna: vi.fn(),
    });
    return deleteWifiPoint;
  };

  it("distinguishes fixed access points from mobile antennas", () => {
    useCampusData.mockReturnValue({
      wifiPoints: [
        { id: "fixed-1", type: "Ponto fixo", status: "Disponível" },
        { id: "fixed-2", type: "Ponto fixo", status: "Disponível" },
        { id: "mobile-1", type: "Antena volante", status: "Disponível" },
      ],
      wifiRooms: [],
      toggleRoomWifi: vi.fn(),
      updateWifiPointStatus: vi.fn(),
      updateWifiPoint: vi.fn(),
      addWifiPoint: vi.fn(),
      deleteWifiPoint: vi.fn(),
      assignMobileAntenna: vi.fn(),
    });

    render(<WifiPage />);

    expect(screen.getByText("Pontos fixos")).toBeInTheDocument();
    expect(
      screen.getByText("Pontos de acesso Wi-Fi cadastrados"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/antenas? volantes? cadastradas?/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Antenas disponíveis")).toBeInTheDocument();
  });

  it("allows TI to delete a mobile antenna without enabling other read-only actions", () => {
    const deleteWifiPoint = mockWifiInventory();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WifiPage readOnly allowAntennaDeletion />);
    fireEvent.click(screen.getByTestId("row-wifi-mobile-1"));

    expect(screen.getByTestId("button-delete-wifi-mobile-1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar antena" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("select-wifi-status-mobile-1")).toBeDisabled();
    expect(screen.getByTestId("select-wifi-room-mobile-1")).toBeDisabled();

    fireEvent.click(screen.getByTestId("button-delete-wifi-mobile-1"));

    expect(confirm).toHaveBeenCalledWith("Excluir Antena Volante?");
    expect(deleteWifiPoint).toHaveBeenCalledWith("mobile-1");
    confirm.mockRestore();
  });

  it("does not expose antenna deletion to read-only viewers without permission", () => {
    mockWifiInventory();

    render(<WifiPage readOnly />);
    fireEvent.click(screen.getByTestId("row-wifi-mobile-1"));

    expect(
      screen.queryByTestId("button-delete-wifi-mobile-1"),
    ).not.toBeInTheDocument();
  });
});

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

  it("rejects a teacher reservation dated before today", async () => {
    const yesterday = new Date(`${todayISO()}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayISO = yesterday.toISOString().slice(0, 10);

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

    const dateInput = screen.getByTestId("input-reservation-date");
    expect(dateInput).toHaveAttribute("min", todayISO());
    fireEvent.change(dateInput, { target: { value: yesterdayISO } });
    fireEvent.submit(screen.getByTestId("form-reservation"));

    expect(await screen.findByTestId("text-reservation-error")).toHaveTextContent(
      "Não é possível agendar em uma data que já passou.",
    );
    expect(onSave).not.toHaveBeenCalled();
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

  it("lets an operator select multiple Chromebooks before marking them unavailable", () => {
    const setCartUnitsStatus = vi.fn(() => true);
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
      toggleCartUnitUnavailable: vi.fn(),
      setCartUnitsStatus,
      setCartUnitUnavailableReason: vi.fn(),
      deleteCartUnit: vi.fn(),
      toggleCartUnitReserved: vi.fn(),
      restoreReservedUnits: vi.fn(),
      reservations: [],
      reserveAvailable: 0,
      campusSettings: { reservationsEnabled: true, reservationLimit: 10 },
      updateCampusSettings: vi.fn(),
    });

    render(<CartsPage />);
    fireEvent.click(screen.getByRole("button", {
      name: "Minimizar Inventário operacional",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "Maximizar Inventário operacional",
    }));
    fireEvent.click(screen.getByTestId("button-select-units-cart-a"));
    fireEvent.click(screen.getByTestId("button-unit-A1"));
    fireEvent.click(screen.getByTestId("button-unit-A2"));

    expect(screen.getByTestId("button-unit-A1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-unit-A2")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("selected-cart-units-cart-a")).toHaveTextContent(
      "2 unidade(s) selecionada(s)",
    );

    fireEvent.click(screen.getByTestId("button-mark-selected-unavailable-cart-a"));

    expect(setCartUnitsStatus).toHaveBeenCalledWith(
      "cart-a",
      ["A1", "A2"],
      "unavailable",
    );
    expect(screen.getByTestId("unit-observation-panel-A1")).toBeInTheDocument();
    expect(screen.queryByTestId("selected-cart-units-cart-a")).not.toBeInTheDocument();
  });

  it("lets an operator select units before marking them for reservation and cancel with Escape", () => {
    const setCartUnitsStatus = vi.fn(() => true);
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
      toggleCartUnitUnavailable: vi.fn(),
      setCartUnitsStatus,
      setCartUnitUnavailableReason: vi.fn(),
      deleteCartUnit: vi.fn(),
      toggleCartUnitReserved: vi.fn(),
      restoreReservedUnits: vi.fn(),
      reservations: [],
      reserveAvailable: 0,
      campusSettings: { reservationsEnabled: true, reservationLimit: 10 },
      updateCampusSettings: vi.fn(),
    });

    render(<CartsPage />);
    fireEvent.click(screen.getByRole("button", {
      name: "Minimizar Inventário operacional",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "Maximizar Inventário operacional",
    }));
    fireEvent.click(screen.getByTestId("button-select-units-cart-a"));
    fireEvent.click(screen.getByTestId("button-unit-A2"));
    expect(screen.getByTestId("selected-cart-units-cart-a")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("selected-cart-units-cart-a")).not.toBeInTheDocument();
    expect(setCartUnitsStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-unit-A2"));
    fireEvent.click(screen.getByTestId("button-mark-selected-reserved-cart-a"));

    expect(setCartUnitsStatus).toHaveBeenCalledWith(
      "cart-a",
      ["A2"],
      "reserved",
    );
    expect(screen.queryByTestId("selected-cart-units-cart-a")).not.toBeInTheDocument();
  });

  it("selects while dragging, deselects when retracing, and cancels with Escape", () => {
    const setCartUnitsStatus = vi.fn(() => true);
    useCampusData.mockReturnValue({
      carts: [{
        id: "cart-a",
        name: "Carrinho A",
        code: "A",
        prefix: "A",
        total: 3,
        available: 3,
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
      toggleCartUnitUnavailable: vi.fn(),
      setCartUnitsStatus,
      setCartUnitUnavailableReason: vi.fn(),
      deleteCartUnit: vi.fn(),
      toggleCartUnitReserved: vi.fn(),
      restoreReservedUnits: vi.fn(),
      reservations: [],
      reserveAvailable: 0,
      campusSettings: { reservationsEnabled: true, reservationLimit: 10 },
      updateCampusSettings: vi.fn(),
    });

    render(<CartsPage />);
    fireEvent.click(screen.getByRole("button", {
      name: "Minimizar Inventário operacional",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "Maximizar Inventário operacional",
    }));
    fireEvent.click(screen.getByTestId("button-select-units-cart-a"));

    const first = screen.getByTestId("button-unit-A1");
    const second = screen.getByTestId("button-unit-A2");
    const third = screen.getByTestId("button-unit-A3");
    const unitList = screen.getByLabelText("Chromebooks do Carrinho A");

    fireEvent.mouseDown(first);
    fireEvent.mouseEnter(second);
    fireEvent.mouseEnter(third);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(third).toHaveAttribute("aria-pressed", "true");

    fireEvent.mouseEnter(second);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(third).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("selected-cart-units-cart-a")).not.toBeInTheDocument();

    fireEvent.mouseDown(first);
    fireEvent.mouseEnter(second);
    fireEvent.mouseUp(unitList);
    fireEvent.click(first);
    fireEvent.click(screen.getByTestId("button-mark-selected-unavailable-cart-a"));

    expect(setCartUnitsStatus).toHaveBeenCalledWith(
      "cart-a",
      ["A1", "A2"],
      "unavailable",
    );
  });
});

describe("reserved Chromebook selection in cart inventory", () => {
  const restoreReservedUnits = vi.fn();
  const unitNames = ["B53", "B54", "B55"];

  beforeEach(() => {
    vi.clearAllMocks();
    useCampusData.mockReturnValue({
      carts: [{
        id: "cart-b",
        name: "Carrinho B",
        code: "B",
        prefix: "B",
        total: 55,
        available: 55,
        location: "Bloco 1",
        status: "Pronto",
        lastCheck: "Hoje, 06:52",
        accent: "bg-blue-500",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: unitNames,
        deletedUnits: [],
        reserveCapacity: 20,
      }],
      addCart: vi.fn(),
      addCartUnit: vi.fn(),
      deleteCart: vi.fn(),
      toggleCartUnavailable: vi.fn(),
      toggleCartUnitUnavailable: vi.fn(),
      setCartUnitUnavailableReason: vi.fn(),
      deleteCartUnit: vi.fn(),
      toggleCartUnitReserved: vi.fn(),
      restoreReservedUnits,
      reservations: [],
      reserveAvailable: unitNames.length,
      campusSettings: { reservationsEnabled: true, reservationLimit: 10 },
      updateCampusSettings: vi.fn(),
    });
  });

  it("supports selecting with Ctrl/Cmd, canceling, and clearing with Escape", () => {
    render(<CartsPage />);
    const firstUnit = screen.getByTestId("reserve-inventory-unit-B53");
    const secondUnit = screen.getByTestId("reserve-inventory-unit-B54");

    fireEvent.click(firstUnit);
    fireEvent.click(secondUnit, { ctrlKey: true });

    expect(firstUnit).toHaveAttribute("aria-pressed", "true");
    expect(secondUnit).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/2 unidade\(s\) selecionada\(s\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-cancel-reserve-inventory-selection"));
    expect(firstUnit).toHaveAttribute("aria-pressed", "false");
    expect(secondUnit).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByTestId("button-move-selected-reserve-units"),
    ).not.toBeInTheDocument();

    fireEvent.click(firstUnit);
    fireEvent.click(secondUnit, { metaKey: true });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(firstUnit).toHaveAttribute("aria-pressed", "false");
    expect(secondUnit).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByTestId("button-move-selected-reserve-units"),
    ).not.toBeInTheDocument();
  });

  it("selects units by dragging, reverses selection along the path, and moves the selection", () => {
    render(<CartsPage />);
    const firstUnit = screen.getByTestId("reserve-inventory-unit-B53");
    const secondUnit = screen.getByTestId("reserve-inventory-unit-B54");
    const thirdUnit = screen.getByTestId("reserve-inventory-unit-B55");
    const unitList = screen.getByLabelText("Unidades reservadas");

    fireEvent.mouseDown(firstUnit);
    fireEvent.mouseEnter(secondUnit);
    fireEvent.mouseEnter(thirdUnit);
    expect(firstUnit).toHaveAttribute("aria-pressed", "true");
    expect(secondUnit).toHaveAttribute("aria-pressed", "true");
    expect(thirdUnit).toHaveAttribute("aria-pressed", "true");

    fireEvent.mouseEnter(secondUnit);
    expect(secondUnit).toHaveAttribute("aria-pressed", "true");
    expect(thirdUnit).toHaveAttribute("aria-pressed", "false");
    fireEvent.mouseUp(unitList);
    fireEvent.click(firstUnit);

    fireEvent.click(screen.getByTestId("button-move-selected-reserve-units"));
    expect(restoreReservedUnits).toHaveBeenCalledWith(["B53", "B54"]);
    expect(firstUnit).toHaveAttribute("aria-pressed", "false");
    expect(secondUnit).toHaveAttribute("aria-pressed", "false");
  });

  it("selects every reserved unit and toggles select-all off", () => {
    render(<CartsPage />);
    const selectAll = screen.getByRole("button", { name: "Selecionar todos" });

    fireEvent.click(selectAll);
    unitNames.forEach((unit) => {
      expect(screen.getByTestId(`reserve-inventory-unit-${unit}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(
      screen.getByRole("button", { name: "Desmarcar todos" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    unitNames.forEach((unit) => {
      expect(screen.getByTestId(`reserve-inventory-unit-${unit}`)).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });
});
