import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayISO } from "@/components/app-ui";
import type { Reservation } from "@/lib/campus-data";
import type { ClassRoomEntry } from "@/lib/room-directory";
import { getMondayOfWeek, formatDateKey } from "@/lib/spreadsheet-view";
import { SpreadsheetViewPage } from "./spreadsheet-view";

const {
  getCampusData,
  loadTeacherReservations,
  loadTeacherProfile,
  getRoomDirectory,
  loadTeacherAccountSuggestions,
  getSession,
  saveSharedReservation,
  deleteSharedReservation,
  loadSharedReservations,
  moveSharedReservationsToCart,
} = vi.hoisted(() => ({
  getCampusData: vi.fn(),
  loadTeacherReservations: vi.fn(),
  loadTeacherProfile: vi.fn(),
  getRoomDirectory: vi.fn(() => ({
    floorForRoom: () => null,
    classEntries: [] as ClassRoomEntry[],
    roomOptions: [] as string[],
  })),
  loadTeacherAccountSuggestions: vi.fn(),
  getSession: vi.fn(() => ({ role: "admin", name: "Administrador" })),
  saveSharedReservation: vi.fn(),
  deleteSharedReservation: vi.fn(),
  loadSharedReservations: vi.fn(),
  moveSharedReservationsToCart: vi.fn(),
}));

vi.mock("@/lib/campus-data", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/campus-data")>(),
  useCampusData: getCampusData,
}));

vi.mock("@/lib/room-directory", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/room-directory")>(),
  useRoomDirectory: getRoomDirectory,
}));

vi.mock("@/lib/teacher-spreadsheet", () => ({
  loadTeacherSpreadsheetReservations: loadTeacherReservations,
}));

vi.mock("@/lib/teacher-profile", () => ({
  loadTeacherProfile,
}));

vi.mock("@/lib/teacher-accounts", () => ({
  loadTeacherAccounts: loadTeacherAccountSuggestions,
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    getSession.mockReturnValue({ role: "admin", name: "Administrador" });
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
    getRoomDirectory.mockReturnValue({
      floorForRoom: () => null,
      roomOptions: [],
      classEntries: [],
    });
    loadTeacherProfile.mockResolvedValue({
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 2",
      subject: "Ciências",
      className: "",
    });
    loadTeacherAccountSuggestions.mockImplementation(() => new Promise(() => {}));
    loadTeacherReservations.mockResolvedValue([{
      id: 41,
      teacher: "Ana Souza",
      segment: "Fundamental 2",
      subject: "",
      className: "2º ano A",
      room: "",
      period: "Manhã",
      date: todayISO(),
      start: "08:00",
      end: "08:45",
      cart: "Carrinho A",
      status: "Aguardando",
      kind: "Aula",
      quantity: 1,
    }]);
  });

  it("shows only the quick spreadsheet in non-editable mode for teachers", async () => {
    getSession.mockReturnValue({ role: "user", name: "Ana Souza" });
    render(<SpreadsheetViewPage readOnly />);

    expect(await screen.findByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("2º ano A")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: /modo de visualização da planilha/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /acesso completo/i })).not.toBeInTheDocument();
    expect(screen.getByText(/reserve um ou mais horários para você/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excluir agendamento/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/layout inspirado|somente para consulta/i)).not.toBeInTheDocument();

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

  it("opens the administrator spreadsheet focused on today's column", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
    render(<SpreadsheetViewPage />);

    expect(screen.getByLabelText("Escolher semana pela data")).toHaveValue("2026-11-25");
    await waitFor(() => {
      expect(screen.getByTestId("quick-week-scroll-container").scrollLeft).toBe(1520);
    });
    const scrollContainer = screen.getByTestId("quick-week-scroll-container");
    scrollContainer.scrollLeft = 0;
    fireEvent.scroll(scrollContainer);
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    await waitFor(() => expect(scrollContainer.scrollLeft).toBe(1520));
  });

  it("hides past weekdays unless the teacher navigates to the previous week", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T12:00:00.000Z"));
    getSession.mockReturnValue({ role: "user", name: "Ana Souza" });
    loadTeacherProfile.mockResolvedValue({
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 2",
      additionalSegments: [],
      subject: "Ciências",
      className: "",
    });
    loadTeacherReservations.mockResolvedValue([]);
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
      campusSettings: { sameDayBookingEnabled: true },
      replaceReservations: vi.fn(),
    });

    const monday = getMondayOfWeek(new Date());
    const mondayKey = formatDateKey(monday);
    render(<SpreadsheetViewPage readOnly />);

    expect(await screen.findByTestId(`quick-day-${formatDateKey(new Date("2026-11-24T12:00:00"))}`))
      .toBeInTheDocument();
    expect(screen.queryByTestId(`quick-day-${mondayKey}`)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Escolher semana pela data")).toHaveValue("2026-11-24");
    await waitFor(() => {
      expect(screen.getByTestId("quick-week-scroll-container").scrollLeft).toBe(0);
    });
    expect(screen.getByRole("button", { name: "Amanhã" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Anterior" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Amanhã" }));
    expect(screen.getByLabelText("Escolher semana pela data")).toHaveValue("2026-11-25");
    await waitFor(() => {
      expect(screen.getByTestId("quick-week-scroll-container").scrollLeft).toBeGreaterThan(0);
    });

    const previousMonday = new Date(monday);
    previousMonday.setDate(previousMonday.getDate() - 7);
    fireEvent.click(screen.getAllByRole("button", { name: "Anterior" })[0]);
    expect(await screen.findByTestId(`quick-day-${formatDateKey(previousMonday)}`))
      .toBeInTheDocument();
  });

  it("keeps the spreadsheet position when the booking form receives focus and input", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
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
      replaceReservations: vi.fn(),
    });
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, "focus");
    render(<SpreadsheetViewPage />);

    const todayKey = formatDateKey(new Date("2026-11-25T12:00:00"));
    const today = await screen.findByTestId(`quick-day-${todayKey}`);
    const scrollContainer = screen.getByTestId("quick-week-scroll-container");
    await waitFor(() => expect(scrollContainer.scrollLeft).toBe(1520));
    scrollContainer.scrollLeft = 760;

    fireEvent.click(within(today).getByRole("button", {
      name: "Reservar horário 07:00 para Carrinho A",
    }));

    const teacherInput = screen.getByTestId("quick-book-teacher");
    expect(teacherInput).toHaveFocus();
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollContainer.scrollLeft).toBe(760);
    fireEvent.change(teacherInput, { target: { value: "Ana Souza" } });
    expect(teacherInput).toHaveValue("Ana Souza");
    expect(scrollContainer.scrollLeft).toBe(760);
    focusSpy.mockRestore();
  });

  it("allows teachers to book multiple free sheet slots only under their own name", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T09:00:00.000Z"));
    const replaceReservations = vi.fn();
    getSession.mockReturnValue({ role: "user", name: "Ana Souza" });
    loadTeacherProfile.mockResolvedValue({
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Ensino Médio",
      additionalSegments: ["Fundamental 2"],
      subject: "Ciências",
      className: "",
    });
    getRoomDirectory.mockReturnValue({
      floorForRoom: () => null,
      roomOptions: ["Sala 07", "Sala 10", "Sala 48"],
      classEntries: [
        { className: "6º ano B", room: "Sala 07", period: "Manhã", segment: "Fundamental 2", floor: "1º piso" },
        { className: "6º ano B", room: "Sala 10", period: "Tarde", segment: "Fundamental 2", floor: "1º piso" },
        { className: "2º EM B", room: "Sala 10", period: "Manhã", segment: "Ensino Médio", floor: "2º piso" },
        { className: "2º ano C", room: "Sala 48", period: "Manhã", segment: "Fundamental 1", floor: "1º piso" },
      ],
    });
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{ name: "Carrinho A", unavailable: false }],
      cartSchedules: {
        "Carrinho A": {
          Manhã: [{ id: "morning-slot", start: "07:00", end: "07:45" }],
          Tarde: [{ id: "afternoon-slot", start: "13:00", end: "13:45" }],
        },
      },
      movementSettings: { allowCartATransitionScheduling: false },
      campusSettings: {
        sameDayBookingEnabled: true,
        sameDayBookingWindows: [{ start: "06:00", end: "18:00" }],
        reservationFreezeHours: 24,
      },
      replaceReservations,
    });
    const monday = getMondayOfWeek(new Date());
    const mondayKey = formatDateKey(monday);
    const tuesday = new Date(monday);
    tuesday.setDate(tuesday.getDate() + 1);
    const tuesdayKey = formatDateKey(tuesday);

    render(<SpreadsheetViewPage readOnly />);

    fireEvent.click(await screen.findByTestId(
      `teacher-book-slot-${mondayKey}-Carrinho A-Manhã-07:00-07:45`,
    ));
    fireEvent.click(screen.getByTestId(
      `teacher-book-slot-${tuesdayKey}-Carrinho A-Tarde-13:00-13:45`,
    ));

    const classSelect = screen.getByTestId("teacher-booking-class");
    expect(classSelect).toHaveDisplayValue("Selecione sua turma");
    expect(within(classSelect).getByRole("option", { name: "6º ano B · F2 (Fundamental 2)" })).toBeInTheDocument();
    expect(within(classSelect).queryByRole("option", { name: "2º EM B · Ensino Médio" })).not.toBeInTheDocument();
    expect(within(classSelect).queryByRole("option", { name: "2º ano C · Fundamental 1" })).not.toBeInTheDocument();

    fireEvent.change(classSelect, { target: { value: "Fundamental 2::6º ano B" } });

    expect(screen.getByTestId("teacher-booking-panel")).toHaveTextContent("Professor: Ana Souza");
    expect(screen.queryByRole("textbox", { name: /nome do professor/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("teacher-booking-room-0")).toHaveValue("Sala 07");
    expect(screen.getByTestId("teacher-booking-room-1")).toHaveValue("Sala 10");
    expect(within(screen.getByTestId("teacher-booking-room-0"))
      .queryByRole("option", { name: "Sala 48" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("teacher-booking-submit"));

    await waitFor(() => expect(saveSharedReservation).toHaveBeenCalledTimes(2));
    expect(saveSharedReservation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      teacher: "Ana Souza",
      segment: "Fundamental 2",
      className: "6º ano B",
      room: "Sala 07",
      date: mondayKey,
      start: "07:00",
    }));
    expect(saveSharedReservation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      teacher: "Ana Souza",
      segment: "Fundamental 2",
      className: "6º ano B",
      room: "Sala 10",
      date: tuesdayKey,
      start: "13:00",
    }));
    expect(screen.getByText("2 horários reservados para Ana Souza.")).toBeInTheDocument();
  });

  it("only offers classes with a registered room in the selected slot period", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T09:00:00.000Z"));
    getSession.mockReturnValue({ role: "user", name: "Ana Souza" });
    loadTeacherProfile.mockResolvedValue({
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Ensino Médio",
      subject: "Ciências",
      className: "",
    });
    getRoomDirectory.mockReturnValue({
      floorForRoom: () => null,
      roomOptions: ["Sala 38", "Sala 44"],
      classEntries: [
        { className: "1º EM TB", room: "Sala 38", period: "Tarde", segment: "Ensino Médio", floor: "3º piso" },
        { className: "1° EM MA", room: "Sala 44", period: "Manhã", segment: "Ensino Médio", floor: "3º piso" },
      ],
    });
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
      campusSettings: {
        sameDayBookingEnabled: true,
        sameDayBookingWindows: [{ start: "06:00", end: "18:00" }],
        reservationFreezeHours: 24,
      },
      replaceReservations: vi.fn(),
    });
    const mondayKey = formatDateKey(getMondayOfWeek(new Date()));

    render(<SpreadsheetViewPage readOnly />);

    fireEvent.click(await screen.findByTestId(
      `teacher-book-slot-${mondayKey}-Carrinho A-Manhã-07:00-07:45`,
    ));

    const classSelect = screen.getByTestId("teacher-booking-class");
    expect(within(classSelect).queryByRole("option", {
      name: "1º EM TB · Ensino Médio",
    })).not.toBeInTheDocument();
    expect(within(classSelect).getByRole("option", {
      name: "1° EM MA · EM (Ensino Médio)",
    })).toBeInTheDocument();

    fireEvent.change(classSelect, { target: { value: "Ensino Médio::1° EM MA" } });
    expect(screen.getByTestId("teacher-booking-room-0")).toHaveValue("Sala 44");
  });

  it("limits Fundamental 1 teachers to the class and rooms assigned in their profile", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T09:00:00.000Z"));
    getSession.mockReturnValue({ role: "user", name: "Ana Souza" });
    loadTeacherProfile.mockResolvedValue({
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 1",
      subject: "",
      className: "2º ano A",
    });
    getRoomDirectory.mockReturnValue({
      floorForRoom: () => null,
      roomOptions: ["Sala 08", "Sala 12", "Sala 14"],
      classEntries: [
        { className: "2º ano A", room: "Sala 12", period: "Manhã", segment: "Fundamental 1", floor: "1º piso" },
        { className: "3º ano B", room: "Sala 08", period: "Manhã", segment: "Fundamental 1", floor: "1º piso" },
        { className: "Pré II", room: "Sala 14", period: "Manhã", segment: "Educação Infantil", floor: "Subsolo" },
      ],
    });
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
      campusSettings: {
        sameDayBookingEnabled: true,
        sameDayBookingWindows: [{ start: "06:00", end: "18:00" }],
        reservationFreezeHours: 24,
      },
      replaceReservations: vi.fn(),
    });
    const mondayKey = formatDateKey(getMondayOfWeek(new Date()));

    render(<SpreadsheetViewPage readOnly />);

    fireEvent.click(await screen.findByTestId(
      `teacher-book-slot-${mondayKey}-Carrinho A-Manhã-07:00-07:45`,
    ));

    const classSelect = screen.getByTestId("teacher-booking-class");
    await waitFor(() => expect(classSelect).toHaveValue("Fundamental 1::2º ano A"));
    expect(classSelect).toBeDisabled();
    expect(within(classSelect).queryByRole("option", { name: "3º ano B · Fundamental 1" })).not.toBeInTheDocument();
    expect(within(classSelect).queryByRole("option", { name: "Pré II · Educação Infantil" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("teacher-booking-room-0"))
      .getByRole("option", { name: "Sala 12" })).toBeInTheDocument();
    expect(within(screen.getByTestId("teacher-booking-room-0"))
      .queryByRole("option", { name: "Sala 08" })).not.toBeInTheDocument();
  });

  it("keeps the teacher spreadsheet mounted while polling for updates", async () => {
    getSession.mockReturnValue({ role: "user", name: "Ana Souza" });
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    let finishInitialLoad: (items: Reservation[]) => void = () => undefined;
    loadTeacherReservations.mockImplementationOnce(
      () => new Promise<Reservation[]>((resolve) => { finishInitialLoad = resolve; }),
    );
    loadTeacherReservations.mockImplementation(() => new Promise<Reservation[]>(() => undefined));
    vi.useFakeTimers();
    const { unmount } = render(<SpreadsheetViewPage readOnly />);

    await act(async () => {
      finishInitialLoad([{
        id: 41,
        teacher: "Ana Souza",
        segment: "Fundamental 2",
        subject: "",
        className: "2º ano A",
        room: "",
        period: "Manhã",
        date: monday,
        start: "08:00",
        end: "08:45",
        cart: "Carrinho A",
        status: "Aguardando",
        kind: "Aula",
        quantity: 1,
      }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    const spreadsheet = screen.getByTestId("quick-week-grid");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(loadTeacherReservations).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Carregando a visão rápida da planilha...")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-week-grid")).toBe(spreadsheet);

    unmount();
    vi.useRealTimers();
  });

  it("opens quick access by default and restores the last selected mode", async () => {
    const { unmount } = render(<SpreadsheetViewPage />);
    const quickTab = screen.getByRole("tab", { name: /acesso rápido/i });
    const completeTab = screen.getByRole("tab", { name: /acesso completo/i });

    expect(quickTab).toHaveAttribute("aria-selected", "true");
    expect(completeTab).toHaveAttribute("aria-selected", "false");
    const quickWeekScroll = screen.getByTestId("quick-week-scroll-container");
    const quickWeekTopScroll = screen.getByTestId("quick-week-top-scroll-container");
    expect(quickWeekTopScroll).toHaveAttribute("role", "region");
    expect(quickWeekTopScroll).toHaveAttribute("tabindex", "0");
    expect(quickWeekTopScroll.className).toContain("overflow-x-auto");
    expect(quickWeekTopScroll).toHaveAttribute(
      "aria-label",
      "Barra superior de rolagem da planilha semanal",
    );
    expect(quickWeekScroll).toHaveAttribute("role", "region");
    expect(quickWeekScroll).toHaveAttribute("tabindex", "0");
    expect(quickWeekScroll.className).toContain("overflow-x-auto");
    expect(quickWeekScroll.className).toContain("min-w-0");
    expect(quickWeekScroll).toContainElement(screen.getByTestId("quick-week-grid"));
    expect(screen.getByTestId("quick-week-grid").className)
      .toContain("min-w-[3800px]");
    expect(screen.getAllByTestId("quick-day-grid")[0].className)
      .toContain("min-w-[740px]");
    expect(screen.getAllByTestId("quick-time-grid")[0].className)
      .toContain("grid-cols-[96px_minmax(0,1fr)]");

    const weekdayIndex = (new Date().getDay() + 6) % 7;
    const initialFocusLeft = weekdayIndex < 5 ? weekdayIndex * 760 : 0;
    await waitFor(() => expect(quickWeekScroll.scrollLeft).toBe(initialFocusLeft));
    quickWeekTopScroll.scrollLeft = 320;
    fireEvent.scroll(quickWeekTopScroll);
    await waitFor(() => expect(quickWeekScroll.scrollLeft).toBe(320));

    quickWeekScroll.scrollLeft = 640;
    fireEvent.scroll(quickWeekScroll);
    await waitFor(() => expect(quickWeekTopScroll.scrollLeft).toBe(640));

    fireEvent.click(completeTab);
    expect(completeTab).toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem("controle-carrinhos-view-mode")).toBe("complete");
    const reserveTab = screen.getByRole("tab", { name: "Reserva" });
    fireEvent.click(reserveTab);
    expect(reserveTab).toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem("controle-carrinhos-view-mode")).toBe("reserve");
    unmount();

    render(<SpreadsheetViewPage />);
    expect(screen.getByRole("tab", { name: "Reserva" }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "Planilha de Chromebooks de reserva" }))
      .toBeInTheDocument();
  });

  it("shows teacher reserve requests and reserve Chromebooks in the dedicated tab", () => {
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    getCampusData.mockReturnValue({
      reservations: [
        {
          id: 101,
          teacher: "Ana Souza",
          segment: "Fundamental 1",
          subject: "Reserva",
          className: "3º ano B",
          room: "Sala 12",
          period: "Manhã",
          date: monday,
          start: "08:00",
          end: "08:45",
          cart: "Reservas",
          status: "Aguardando",
          kind: "Reserva",
          quantity: 2,
        },
        {
          id: 102,
          teacher: "Bruna Lima",
          segment: "Fundamental 2",
          subject: "Ciências",
          className: "7º ano A",
          room: "Sala 14",
          period: "Manhã",
          date: monday,
          start: "08:15",
          end: "08:45",
          cart: "Carrinho A",
          status: "Aguardando",
          kind: "Aula",
          quantity: 1,
        },
      ],
      movements: [],
      carts: [
        {
          name: "Carrinho B",
          unavailable: false,
          unavailableUnits: [],
          reservedUnits: ["B49", "B50"],
        },
      ],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));

    expect(screen.getByRole("heading", { name: "Chromebooks separados para reserva" })).toBeVisible();
    expect(screen.getByTestId("reserve-unit-B49")).toBeInTheDocument();
    expect(screen.getByTestId("reserve-unit-B50")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeVisible();
    expect(screen.getByText("3º ano B")).toBeVisible();
    expect(screen.getByText("Sala 12")).toBeVisible();
    expect(screen.getByText("2")).toBeVisible();
    expect(screen.queryByText("Bruna Lima")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reserve-unit-B49"));
    expect(screen.getByTestId("reserve-unit-B49")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("reserve-unit-spreadsheet")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Reservas do Chromebook B49" }))
      .not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("reserve-unit-B49"));
    expect(screen.getByTestId("reserve-unit-B49")).toHaveAttribute("aria-pressed", "false");
  });

  it("counts manually assigned reserve Chromebooks as a teacher request", () => {
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49", "B50", "B51"],
        reserveAssignments: {
          B49: { teacher: "Ana Souza", date: monday, start: "09:45", personType: "Professor" },
          B50: { teacher: "Ana Souza", date: monday, start: "09:45", personType: "Professor" },
          B51: {
            teacher: "Mauricio",
            date: monday,
            personType: "Funcionário/Autorizado",
          },
        },
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));

    const manualRequest = screen.getByTestId("reserve-manual-request-row");
    expect(manualRequest).toHaveTextContent("Ana Souza");
    expect(manualRequest).toHaveTextContent("B49, B50");
    expect(manualRequest).toHaveTextContent("2");
    expect(manualRequest).toHaveTextContent("Atribuição manual");
    expect(manualRequest).toHaveTextContent("Horário: 09:45");
    expect(manualRequest).not.toHaveTextContent("Mauricio");
    expect(screen.queryByText(
      "Nenhum professor solicitou Chromebooks de reserva nesta semana.",
    )).not.toBeInTheDocument();
  });

  it("uses a manual assignment on the matching reservation instead of duplicating its row", () => {
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    getCampusData.mockReturnValue({
      reservations: [{
        id: 201,
        teacher: "Ana Souza",
        segment: "Fundamental 1",
        subject: "Reserva",
        className: "3º ano B",
        room: "Sala 12",
        period: "Manhã",
        date: monday,
        start: "08:00",
        end: "08:45",
        cart: "Reservas",
        status: "Aguardando",
        kind: "Reserva",
        quantity: 2,
      }],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49", "B50", "B51"],
        reserveAssignments: {
          B50: { teacher: "Ana Souza", date: monday, personType: "Professor" },
          B51: { teacher: "Ana Souza", date: monday, personType: "Professor" },
        },
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));

    const requestsTable = screen.getByRole("region", {
      name: "Solicitações de Chromebook de reserva com rolagem horizontal",
    });
    const rows = within(requestsTable).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("B50");
    expect(rows[1]).toHaveTextContent("B51");
    expect(rows[1]).not.toHaveTextContent("B49");
    expect(within(requestsTable).queryByTestId("reserve-manual-request-row"))
      .not.toBeInTheDocument();
  });

  it("lets administrators select multiple reserve units and assign a responsible person with a past date", async () => {
    const updateReserveUnitAssignments = vi.fn();
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49", "B50", "B51"],
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
      updateReserveUnitAssignments,
      rememberReserveResponsiblePerson: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));
    fireEvent.click(await screen.findByTestId("reserve-unit-B49"));
    fireEvent.click(screen.getByTestId("reserve-unit-B50"), { ctrlKey: true });

    expect(screen.getByText(/B49, B50/)).toBeInTheDocument();
    expect(screen.getByLabelText("Data de atribuição dos Chromebooks"))
      .toHaveValue(formatDateKey(new Date()));
    expect(screen.getByLabelText("Horário de atribuição dos Chromebooks"))
      .toHaveAttribute("type", "time");
    fireEvent.change(screen.getByLabelText("Nome do responsável pelos Chromebooks"), {
      target: { value: "  Ana   Souza " },
    });
    fireEvent.change(screen.getByLabelText("Data de atribuição dos Chromebooks"), {
      target: { value: "2020-05-04" },
    });
    fireEvent.change(screen.getByLabelText("Horário de atribuição dos Chromebooks"), {
      target: { value: "09:15" },
    });
    fireEvent.click(screen.getByTestId("button-assign-reserve-units"));

    expect(updateReserveUnitAssignments).toHaveBeenCalledWith(
      ["B49", "B50"],
      {
        teacher: "Ana Souza",
        date: "2020-05-04",
        start: "09:15",
        personType: "Professor",
      },
    );
  });

  it("supports selecting reserve Chromebooks by dragging across the unit list", async () => {
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49", "B50", "B51"],
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
      updateReserveUnitAssignments: vi.fn(),
      rememberReserveResponsiblePerson: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));
    const firstUnit = await screen.findByTestId("reserve-unit-B49");
    const secondUnit = screen.getByTestId("reserve-unit-B50");
    const thirdUnit = screen.getByTestId("reserve-unit-B51");
    const unitList = screen.getByLabelText("Unidades de Chromebook de reserva");

    fireEvent.mouseDown(firstUnit);
    fireEvent.mouseEnter(secondUnit);
    fireEvent.mouseEnter(thirdUnit);
    expect(firstUnit).toHaveAttribute("aria-pressed", "true");
    expect(secondUnit).toHaveAttribute("aria-pressed", "true");
    expect(thirdUnit).toHaveAttribute("aria-pressed", "true");

    fireEvent.mouseEnter(secondUnit);
    expect(firstUnit).toHaveAttribute("aria-pressed", "true");
    expect(secondUnit).toHaveAttribute("aria-pressed", "true");
    expect(thirdUnit).toHaveAttribute("aria-pressed", "false");
    fireEvent.mouseUp(unitList);
    fireEvent.click(firstUnit);

    expect(screen.getByText(/B49, B50/)).toBeInTheDocument();
  });

  it("keeps assigned reserve units out of the selection list while editing their responsibility", async () => {
    const updateReserveUnitAssignments = vi.fn();
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49", "B50"],
        reserveAssignments: {
          B49: { teacher: "Ana Souza", date: "2026-10-12", start: "10:30" },
        },
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
      updateReserveUnitAssignments,
      rememberReserveResponsiblePerson: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));

    expect(screen.queryByTestId("reserve-unit-B49")).not.toBeInTheDocument();
    expect(screen.getByTestId("reserve-unit-B50")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ana Souza" })).toBeInTheDocument();
    expect(screen.getByTestId("reserve-assignment-B49")).toHaveTextContent("Horário: 10:30");
    fireEvent.click(screen.getByTestId("button-edit-reserve-assignment-B49"));
    fireEvent.change(screen.getByLabelText("Responsável pelo Chromebook B49"), {
      target: { value: "Bruna Lima" },
    });
    fireEvent.change(screen.getByLabelText("Data do Chromebook B49"), {
      target: { value: "2020-05-04" },
    });
    fireEvent.change(screen.getByLabelText("Horário do Chromebook B49"), {
      target: { value: "11:00" },
    });
    fireEvent.click(screen.getByTestId("button-save-reserve-assignment-B49"));

    expect(updateReserveUnitAssignments).toHaveBeenCalledWith(
      ["B49"],
      {
        teacher: "Bruna Lima",
        date: "2020-05-04",
        start: "11:00",
        personType: "Funcionário/Autorizado",
      },
    );
    fireEvent.click(screen.getByTestId("button-delete-reserve-assignment-B49"));
    expect(updateReserveUnitAssignments).toHaveBeenLastCalledWith(["B49"], null);
  });

  it("groups assigned Chromebooks by responsible person in separate sections", () => {
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B51", "B52", "C48", "C49"],
        reserveAssignments: {
          B51: { teacher: "Mauricio", date: "2026-11-17", personType: "Funcionário/Autorizado" },
          B52: { teacher: "Mauricio", date: "2026-11-17", personType: "Funcionário/Autorizado" },
          C48: { teacher: "Ana Souza", date: "2026-11-16", personType: "Professor" },
          C49: { teacher: "Ana Souza", date: "2026-11-17", personType: "Professor" },
        },
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
      updateReserveUnitAssignments: vi.fn(),
      rememberReserveResponsiblePerson: vi.fn(),
      teacherAccounts: [{ id: "1", name: "Ana Souza" }],
      campusSettings: {
        reserveResponsiblePeople: [
          { name: "Mauricio", personType: "Funcionário/Autorizado" },
        ],
      },
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));

    const mauricioGroup = screen.getByTestId("reserve-assignment-group-mauricio");
    expect(mauricioGroup).toHaveTextContent("B51");
    expect(mauricioGroup).toHaveTextContent("B52");
    expect(mauricioGroup).not.toHaveTextContent("Ana Souza");
    expect(screen.getByTestId("reserve-assignment-group-ana-souza")).toHaveTextContent("C48");
    expect(screen.getByTestId("reserve-assignment-group-ana-souza")).toHaveTextContent("C49");
  });

  it("suggests registered teachers and remembered responsible people", async () => {
    const updateReserveUnitAssignments = vi.fn();
    const rememberReserveResponsiblePerson = vi.fn();
    loadTeacherAccountSuggestions.mockResolvedValue([{
      id: "1",
      name: "Ana Souza",
      email: "ana@example.com",
      segment: "Fundamental 1",
      subject: "",
      className: "",
      mustSetPassword: false,
    }]);
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49"],
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
      updateReserveUnitAssignments,
      rememberReserveResponsiblePerson,
      teacherAccounts: [],
      campusSettings: {
        reserveResponsiblePeople: [
          { name: "Mauricio", personType: "Funcionário/Autorizado" },
        ],
      },
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));
    fireEvent.click(await screen.findByTestId("reserve-unit-B49"));

    const nameInput = screen.getByLabelText("Nome do responsável pelos Chromebooks");
    expect(nameInput).toHaveAttribute("role", "combobox");
    fireEvent.change(nameInput, { target: { value: "Pessoa sem cadastro" } });
    expect(screen.getByLabelText("Categoria do responsável")).toHaveValue("Professor");
    fireEvent.change(nameInput, { target: { value: "AS" } });
    fireEvent.click(await screen.findByRole("option", { name: "Ana Souza" }));
    expect(nameInput).toHaveValue("Ana Souza");
    expect(screen.getByLabelText("Categoria do responsável")).toHaveValue("Professor");
    fireEvent.click(screen.getByTestId("button-assign-reserve-units"));

    expect(updateReserveUnitAssignments).toHaveBeenCalledWith(
      ["B49"],
      expect.objectContaining({ teacher: "Ana Souza", personType: "Professor" }),
    );
    expect(rememberReserveResponsiblePerson).toHaveBeenCalledWith("Ana Souza", "Professor");
  });

  it("returns every Chromebook in a responsible person's group", () => {
    const updateReserveUnitAssignments = vi.fn();
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B51", "B52"],
        reserveAssignments: {
          B51: { teacher: "Ana Souza", date: "2026-11-17", personType: "Professor" },
          B52: { teacher: "Ana Souza", date: "2026-11-17", personType: "Professor" },
        },
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
      updateReserveUnitAssignments,
      rememberReserveResponsiblePerson: vi.fn(),
      teacherAccounts: [{ id: "1", name: "Ana Souza" }],
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));
    const returnButton = screen.getByTestId("button-return-reserve-group-ana-souza");
    expect(returnButton).toHaveTextContent("Todos devolvido");
    expect(screen.getByTestId("button-delete-reserve-assignment-B51")).toHaveTextContent("Devolvido");
    fireEvent.click(returnButton);

    expect(updateReserveUnitAssignments).toHaveBeenCalledWith(["B51", "B52"], null);
  });

  it("clears deselected unit highlighting and offers a cancel-selection button", async () => {
    getCampusData.mockReturnValue({
      reservations: [],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49", "B50"],
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
      updateReserveUnitAssignments: vi.fn(),
      rememberReserveResponsiblePerson: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));
    const firstUnit = await screen.findByTestId("reserve-unit-B49");
    const secondUnit = screen.getByTestId("reserve-unit-B50");
    fireEvent.click(firstUnit);
    fireEvent.click(secondUnit, { ctrlKey: true });
    expect(firstUnit).toHaveAttribute("aria-pressed", "true");
    expect(secondUnit).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(firstUnit, { ctrlKey: true });
    expect(firstUnit).toHaveAttribute("aria-pressed", "false");
    expect(secondUnit).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar seleção" }));
    expect(secondUnit).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("button-assign-reserve-units")).not.toBeInTheDocument();

    fireEvent.click(firstUnit);
    fireEvent.click(secondUnit, { ctrlKey: true });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(firstUnit).toHaveAttribute("aria-pressed", "false");
    expect(secondUnit).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("button-assign-reserve-units")).not.toBeInTheDocument();
  });

  it("lets administrators edit a professor reserve request in the spreadsheet", async () => {
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    const replaceReservations = vi.fn();
    getCampusData.mockReturnValue({
      reservations: [{
        id: 103,
        teacher: "Ana Souza",
        segment: "Fundamental 1",
        subject: "Reserva",
        className: "3º ano B",
        room: "Sala 12",
        period: "Manhã",
        date: monday,
        start: "08:00",
        end: "08:45",
        cart: "Reservas",
        status: "Aguardando",
        kind: "Reserva",
        quantity: 1,
      }],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49", "B50"],
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations,
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));
    fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Professor da reserva 103"), {
      target: { value: "  Ana   Lima " },
    });
    fireEvent.change(screen.getByLabelText("Quantidade da reserva 103"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(saveSharedReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        teacher: "Ana Lima",
        quantity: 2,
        cart: "Reservas",
        kind: "Reserva",
      }),
      103,
    ));
    expect(replaceReservations).toHaveBeenCalledWith([]);
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

  it("fills quick-access class and room in either direction without guessing ambiguous matches", async () => {
    getRoomDirectory.mockReturnValue({
      floorForRoom: () => null,
      roomOptions: ["Sala 12", "Sala 14", "Sala 15", "Sala 18", "Sala 19"],
      classEntries: [
        { className: "3º ano B", room: "Sala 12", period: "Manhã", segment: "Fundamental 1", floor: "Térreo" },
        { className: "4º ano A", room: "Sala 14", period: "Manhã", segment: "Fundamental 1", floor: "Térreo" },
        { className: "5º ano A", room: "Sala 15", period: "Manhã", segment: "Fundamental 1", floor: "Térreo" },
        { className: "6º ano A", room: "Sala 15", period: "Manhã", segment: "Fundamental 1", floor: "Térreo" },
        { className: "7º ano A", room: "Sala 18", period: "Manhã", segment: "Fundamental 1", floor: "Térreo" },
        { className: "7º ano A", room: "Sala 19", period: "Manhã", segment: "Fundamental 1", floor: "Térreo" },
      ],
    });
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
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click((await screen.findAllByRole("button", {
      name: "Reservar horário 07:00 para Carrinho A",
    }))[0]);

    const classInput = screen.getByLabelText("Ano ou série");
    const roomInput = screen.getByLabelText("Sala");
    fireEvent.change(classInput, { target: { value: "3º ano B" } });
    expect(roomInput).toHaveValue("Sala 12");
    expect(screen.getByTestId("quick-book-segment")).toHaveTextContent("F1");

    fireEvent.change(roomInput, { target: { value: "Sala 14" } });
    expect(classInput).toHaveValue("4º ano A");

    fireEvent.change(roomInput, { target: { value: "Sala 15" } });
    expect(classInput).toHaveValue("");

    fireEvent.change(classInput, { target: { value: "7º ano A" } });
    expect(roomInput).toHaveValue("");
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
    fireEvent.change(screen.getByLabelText("Nome do professor"), {
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
    expect(screen.queryByLabelText("Nome do professor")).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "Ana Souza",
      initials: "AS",
      segment: "Fundamental 1" as const,
      className: "3º ano B",
      room: "Sala 12",
    },
    {
      name: "Maria Lima",
      initials: "ML",
      segment: "Educação Infantil" as const,
      className: "Maternal",
      room: "Sala 03",
    },
    {
      name: "Carla Reis",
      initials: "CR",
      segment: "Contraturno" as const,
      className: "Contraturno",
      room: "Sala 20",
    },
  ])("suggests $name by initials and fills their registered class and room", async ({
    name,
    initials,
    segment,
    className,
    room,
  }) => {
    loadTeacherAccountSuggestions.mockResolvedValue([{
      id: name,
      name,
      email: `${initials.toLowerCase()}@escola.com.br`,
      segment,
      subject: "",
      className: segment === "Contraturno" ? "" : className,
      mustSetPassword: false,
    }]);
    getRoomDirectory.mockReturnValue({
      floorForRoom: () => null,
      roomOptions: [room],
      classEntries: [{
        className,
        room,
        period: "Manhã",
        segment,
        floor: "Térreo",
      }],
    });
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
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click((await screen.findAllByRole("button", {
      name: "Reservar horário 07:00 para Carrinho A",
    }))[0]);
    fireEvent.change(screen.getByLabelText("Nome do professor"), {
      target: { value: initials },
    });
    fireEvent.click(await screen.findByRole("option", { name }));

    expect(screen.getByLabelText("Ano ou série")).toHaveValue(className);
    expect(screen.getByLabelText("Sala")).toHaveValue(room);
  });

  it("uses a teacher's Fundamental 2 and Ensino Médio profile to auto-fill the chosen room", async () => {
    loadTeacherAccountSuggestions.mockResolvedValue([{
      id: "ana",
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Ensino Médio",
      additionalSegments: ["Fundamental 2"],
      subject: "Ciências",
      className: "",
      mustSetPassword: false,
    }]);
    getRoomDirectory.mockReturnValue({
      floorForRoom: () => null,
      roomOptions: ["Sala 08", "Sala 10", "Sala 12"],
      classEntries: [
        { className: "6º ano B", room: "Sala 08", period: "Manhã", segment: "Fundamental 2", floor: "1º piso" },
        { className: "2º EM B", room: "Sala 10", period: "Manhã", segment: "Ensino Médio", floor: "2º piso" },
        { className: "3º ano B", room: "Sala 12", period: "Manhã", segment: "Fundamental 1", floor: "1º piso" },
      ],
    });
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
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);
    fireEvent.click((await screen.findAllByRole("button", {
      name: "Reservar horário 07:00 para Carrinho A",
    }))[0]);
    fireEvent.change(screen.getByLabelText("Nome do professor"), {
      target: { value: "AS" },
    });
    fireEvent.click(await screen.findByRole("option", { name: "Ana Souza" }));

    const classInput = screen.getByLabelText("Ano ou série");
    const roomInput = screen.getByLabelText("Sala");
    fireEvent.change(classInput, { target: { value: "6º ano B" } });
    expect(roomInput).toHaveValue("Sala 08");
    fireEvent.change(classInput, { target: { value: "2º EM B" } });
    expect(roomInput).toHaveValue("Sala 10");
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
    getSession.mockReturnValue({ role: "operator", name: "Operador" });
    const monday = formatDateKey(getMondayOfWeek(new Date()));
    getCampusData.mockReturnValue({
      reservations: [{
        id: 104,
        teacher: "Ana Souza",
        segment: "Fundamental 1",
        subject: "Reserva",
        className: "3º ano B",
        room: "Sala 12",
        period: "Manhã",
        date: monday,
        start: "08:00",
        end: "08:45",
        cart: "Reservas",
        status: "Aguardando",
        kind: "Reserva",
        quantity: 1,
      }],
      movements: [],
      carts: [{
        name: "Carrinho B",
        unavailable: false,
        unavailableUnits: [],
        reservedUnits: ["B49"],
      }],
      cartSchedules: {},
      movementSettings: { allowCartATransitionScheduling: false },
      replaceReservations: vi.fn(),
    });

    render(<SpreadsheetViewPage />);

    expect(screen.queryByRole("button", { name: /reservar horário/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Reserva" }));
    expect(screen.getByText("Ana Souza")).toBeVisible();
    expect(screen.queryByTestId("button-edit-reserve-104")).not.toBeInTheDocument();
  });
});
