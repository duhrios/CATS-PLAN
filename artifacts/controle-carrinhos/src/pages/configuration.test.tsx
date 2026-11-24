import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationPage } from "./configuration";

const { resetData, updateCampusSettings, verifySuperAdminCredentials } = vi.hoisted(() => ({
  resetData: vi.fn(),
  updateCampusSettings: vi.fn(),
  verifySuperAdminCredentials: vi.fn(),
}));

vi.mock("@/lib/campus-data", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/campus-data")>(),
  buildCartSchedule: vi.fn(),
  segments: [],
  useCampusData: () => ({
    resetData,
    movementSettings: {
      alertIntervalMinutes: 1,
      alertRepeat: 1,
      earlyWarningEnabled: false,
      earlyWarningMinutes: 1,
      autoComplete: false,
      allowCartATransitionScheduling: false,
    },
    updateMovementSettings: vi.fn(),
    campusSettings: {
      campusName: "",
      coordinatorName: "",
      agendaLabel: "",
      reservationsEnabled: true,
      reservationLimit: 10,
      sameDayBookingEnabled: false,
      sameDayBookingWindows: [{ start: "12:00", end: "13:00" }],
      reservationFreezeHours: 24,
      reserveUnits: [],
    },
    updateCampusSettings,
    reservations: [],
    replaceReservations: vi.fn(),
    carts: [],
  }),
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedSession: () => ({
    role: "admin",
    name: "Administrador comum",
    isSuperAdmin: false,
  }),
  verifySuperAdminCredentials,
}));

vi.mock("@/lib/teacher-spreadsheet", () => ({
  loadTeacherSpreadsheetEnabled: vi.fn().mockResolvedValue(true),
  saveTeacherSpreadsheetEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/reservations-api", () => ({
  loadSharedReservations: vi.fn(),
  replaceSharedReservations: vi.fn(),
}));

vi.mock("@/components/admin-notifications", () => ({
  AdminNotifications: () => null,
}));

describe("configuration data maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  const openProfilesAction = () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Maximizar Manutenção de dados" }),
    );
    const row = screen.getByText("Apagar todos os perfis").closest<HTMLDivElement>("div.flex.items-center.justify-between");
    if (!row) throw new Error("Ação de manutenção não encontrada.");
    fireEvent.click(within(row).getByRole("button", { name: /executar/i }));
  };

  const submitCredentials = () => {
    fireEvent.change(screen.getByLabelText("Usuário do superadministrador"), {
      target: { value: "Administrador Raiz" },
    });
    fireEvent.change(screen.getByLabelText("Senha do superadministrador"), {
      target: { value: "senha-super-admin" },
    });
    const submitButton = screen.getByRole("button", { name: /confirmar e executar/i });
    const form = submitButton.closest("form");
    if (!form) throw new Error("Formulário de autorização não encontrado.");
    fireEvent.submit(form);
  };

  it("does not run maintenance when superadministrator verification fails", async () => {
    verifySuperAdminCredentials.mockRejectedValueOnce(new Error("Credenciais inválidas."));
    render(<ConfigurationPage />);

    openProfilesAction();
    submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciais inválidas.");
    expect(resetData).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("runs maintenance only after valid superadministrator credentials and confirmation", async () => {
    verifySuperAdminCredentials.mockResolvedValueOnce(undefined);
    render(<ConfigurationPage />);

    openProfilesAction();
    submitCredentials();

    await waitFor(() => expect(resetData).toHaveBeenCalledWith("profiles"));
    expect(verifySuperAdminCredentials).toHaveBeenCalledWith(
      "Administrador Raiz",
      "senha-super-admin",
    );
    expect(window.confirm).toHaveBeenCalled();
  });

  it("lets administrators enable same-day scheduling and configure released intervals", async () => {
    render(<ConfigurationPage />);
    await waitFor(() =>
      expect(screen.getByTestId("toggle-teacher-spreadsheet")).toBeChecked(),
    );

    fireEvent.click(screen.getByTestId("toggle-same-day-booking"));
    expect(updateCampusSettings).toHaveBeenCalledWith(expect.objectContaining({
      sameDayBookingEnabled: true,
      sameDayBookingWindows: [{ start: "12:00", end: "13:00" }],
    }));

    fireEvent.change(screen.getByTestId("same-day-window-start-0"), {
      target: { value: "11:00" },
    });
    expect(updateCampusSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      sameDayBookingWindows: [{ start: "11:00", end: "13:00" }],
    }));

    fireEvent.change(screen.getByTestId("input-reservation-freeze-hours"), {
      target: { value: "4" },
    });
    expect(updateCampusSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      reservationFreezeHours: 4,
    }));
  });

  it("lays out configuration sections compactly without stretching collapsed cards", async () => {
    render(<ConfigurationPage />);
    await waitFor(() =>
      expect(screen.getByTestId("toggle-teacher-spreadsheet")).toBeChecked(),
    );

    const sectionToggle = screen.getByRole("button", {
      name: "Maximizar Acesso do professor à planilha",
    });
    const sectionsGrid = sectionToggle.closest(".grid");

    expect(sectionsGrid).toHaveClass("items-start", "lg:grid-cols-2");
    expect(screen.getByRole("button", {
      name: "Maximizar Manutenção de dados",
    })).toHaveAttribute("aria-expanded", "false");
  });
});
