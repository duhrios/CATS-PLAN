import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReservationNotifications } from "./reservation-notifications";

const mocks = vi.hoisted(() => ({
  useCampusData: vi.fn(),
  useNotificationSettings: vi.fn(),
  getAuthenticatedRole: vi.fn(),
  onAuthenticatedSessionChange: vi.fn(() => () => {}),
  toast: vi.fn(),
  showBrowserNotification: vi.fn(async () => true),
  playOperatorAlert: vi.fn(() => vi.fn()),
  readOperatorSettings: vi.fn(() => ({
    volume: 70,
    vibration: true,
    tone: "custom",
    customToneUrl: "data:audio/mpeg;base64,",
    alarmDurationSeconds: 30,
  })),
}));

vi.mock("@/lib/campus-data", () => ({
  reservationChangeEventName: "campus-reservation-change",
  reservationChangeStorageKey: "campus-reservation-change-storage",
  useCampusData: mocks.useCampusData,
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedRole: mocks.getAuthenticatedRole,
  onAuthenticatedSessionChange: mocks.onAuthenticatedSessionChange,
}));

vi.mock("@/lib/notification-settings", () => ({
  useNotificationSettings: mocks.useNotificationSettings,
}));

vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

vi.mock("@/lib/browser-notifications", () => ({
  openSyncChannel: () => null,
  showBrowserNotification: mocks.showBrowserNotification,
}));

vi.mock("@/lib/operator-audio", () => ({
  playOperatorAlert: mocks.playOperatorAlert,
}));

vi.mock("@/pages/operator", () => ({
  readOperatorSettings: mocks.readOperatorSettings,
}));

const reservation = {
  id: 501,
  teacher: "Ana Souza",
  segment: "Fundamental 2",
  subject: "Ciências",
  className: "7º ano A",
  room: "Sala 12",
  period: "Manhã",
  date: "2026-11-25",
  start: "10:30",
  end: "11:15",
  cart: "Carrinho A",
  status: "Aguardando",
  kind: "Aula",
  quantity: 1,
};

const settings = {
  ti: {
    "reservation-created": true,
    "reservation-scheduled": true,
    "movement-request": true,
    "movement-audio": true,
    push: true,
  },
  teachers: { push: true },
};

describe("scheduled reservation notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 25, 10, 30, 30));
    window.sessionStorage.clear();
    mocks.getAuthenticatedRole.mockReturnValue("admin");
    mocks.onAuthenticatedSessionChange.mockReturnValue(() => {});
    mocks.useCampusData.mockReturnValue({
      reservations: [reservation],
      movementSettings: { alertRepeat: 4 },
    });
    mocks.useNotificationSettings.mockReturnValue({
      settings,
      loading: false,
      error: "",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a scheduled alert and plays the configured tone when settings finish loading", () => {
    mocks.useNotificationSettings.mockReturnValue({
      settings,
      loading: true,
      error: "",
    });
    const view = render(<ReservationNotifications />);

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.playOperatorAlert).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);

    mocks.useNotificationSettings.mockReturnValue({
      settings,
      loading: false,
      error: "",
    });
    view.rerender(<ReservationNotifications />);

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reserva no horário agendado",
      description: expect.stringContaining("Ana Souza"),
    }));
    expect(mocks.showBrowserNotification).toHaveBeenCalledWith(
      "Reserva no horário agendado",
      expect.stringContaining("Sala 12"),
      "/reservas",
    );
    expect(mocks.playOperatorAlert).toHaveBeenCalledWith(
      mocks.readOperatorSettings(),
      4,
    );
    expect(window.sessionStorage.length).toBe(1);
  });

  it("does not consume scheduled alerts for teachers or after the scheduled minute", () => {
    mocks.getAuthenticatedRole.mockReturnValue("user");
    render(<ReservationNotifications />);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);

    vi.setSystemTime(new Date(2026, 10, 25, 10, 31, 0));
    mocks.getAuthenticatedRole.mockReturnValue("operator");
    render(<ReservationNotifications />);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.playOperatorAlert).not.toHaveBeenCalled();
  });
});
