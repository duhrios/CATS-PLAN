import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorNotifications } from "./operator-notifications";

const mocks = vi.hoisted(() => ({
  useCampusData: vi.fn(),
  useNotificationSettings: vi.fn(),
  getAuthenticatedRole: vi.fn(),
  onAuthenticatedSessionChange: vi.fn(() => () => {}),
  updateMovementStatus: vi.fn(),
}));

vi.mock("@/lib/campus-data", () => ({
  movementChangeEventName: "campus-movement-change",
  movementStorageKey: "campus-movement-storage",
  syncChannelName: "campus-sync",
  isReservationInProgress: () => true,
  useCampusData: mocks.useCampusData,
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedRole: mocks.getAuthenticatedRole,
  onAuthenticatedSessionChange: mocks.onAuthenticatedSessionChange,
}));

vi.mock("@/lib/notification-settings", () => ({
  useNotificationSettings: mocks.useNotificationSettings,
}));

vi.mock("@/lib/browser-notifications", () => ({
  openSyncChannel: () => null,
  showBrowserNotification: vi.fn(async () => true),
}));

vi.mock("@/lib/movement-notifications", () => ({
  isNewTeacherMovementRequest: () => false,
}));

const reservation = {
  id: 700,
  teacher: "Ana Souza",
  segment: "Fundamental 2",
  subject: "Ciências",
  className: "7º ano A",
  room: "Sala 12",
  period: "Manhã",
  date: "2026-11-25",
  start: "15:20",
  end: "16:05",
  cart: "Carrinho A",
  status: "Aguardando",
  kind: "Aula",
  quantity: 1,
};

describe("automatic movement completion from every staff page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 25, 15, 30, 0));
    mocks.getAuthenticatedRole.mockReturnValue("operator");
    mocks.onAuthenticatedSessionChange.mockReturnValue(() => {});
    mocks.useNotificationSettings.mockReturnValue({
      settings: { ti: { "movement-request": true } },
      loading: false,
      error: "",
    });
    mocks.useCampusData.mockReturnValue({
      reservations: [reservation],
      movements: [],
      movementSettings: {
        autoComplete: true,
        alertIntervalMinutes: 10,
      },
      updateMovementStatus: mocks.updateMovementStatus,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["operator", "admin"] as const)(
    "automatically completes a due movement for %s sessions",
    (role) => {
      mocks.getAuthenticatedRole.mockReturnValue(role);

      render(<OperatorNotifications />);

      expect(mocks.updateMovementStatus).toHaveBeenCalledWith(
        reservation.id,
        "Concluído",
        true,
      );
    },
  );

  it("leaves a due movement untouched when automatic completion is disabled", () => {
    mocks.useCampusData.mockReturnValue({
      reservations: [reservation],
      movements: [],
      movementSettings: {
        autoComplete: false,
        alertIntervalMinutes: 10,
      },
      updateMovementStatus: mocks.updateMovementStatus,
    });

    render(<OperatorNotifications />);

    expect(mocks.updateMovementStatus).not.toHaveBeenCalled();
  });
});
