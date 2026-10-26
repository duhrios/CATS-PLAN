import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationPage } from "./configuration";

const { resetData, verifySuperAdminCredentials } = vi.hoisted(() => ({
  resetData: vi.fn(),
  verifySuperAdminCredentials: vi.fn(),
}));

vi.mock("@/lib/campus-data", () => ({
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
    campusSettings: { campusName: "", coordinatorName: "", agendaLabel: "" },
    updateCampusSettings: vi.fn(),
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
});
