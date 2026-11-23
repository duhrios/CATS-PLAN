import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLoginPage } from "./access";

const { getRememberedAdminName, loginWithCredentials, rememberAdminName, setLocation } = vi.hoisted(() => ({
  getRememberedAdminName: vi.fn(() => ""),
  loginWithCredentials: vi.fn(),
  rememberAdminName: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({
  changeInitialAdminPassword: vi.fn(),
  endAuthSession: vi.fn(),
  getAuthenticatedSession: vi.fn(),
  getRememberedAdminName,
  loginWithCredentials,
  rememberAdminName,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/admin/login", setLocation],
}));

describe("administrator login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRememberedAdminName.mockReturnValue("");
    loginWithCredentials.mockResolvedValue({
      name: "Administradora",
      mustChangePassword: false,
    });
  });

  it("remembers the login when requested and lets the browser manage the password", async () => {
    render(<AdminLoginPage />);

    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Administradora" },
    });
    fireEvent.change(screen.getByLabelText("Senha administrativa"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(screen.getByRole("checkbox", {
      name: "Lembrar meu login neste dispositivo",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(rememberAdminName).toHaveBeenCalledWith("Administradora", true);
      expect(setLocation).toHaveBeenCalledWith("/admin");
    });
    expect(loginWithCredentials).toHaveBeenCalledWith(
      "admin",
      "Administradora",
      "senha-segura",
    );
    expect(screen.getByLabelText("Senha administrativa")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  it("prefills a previously remembered login", () => {
    getRememberedAdminName.mockReturnValue("Diretora");

    render(<AdminLoginPage />);

    expect(screen.getByLabelText("Nome")).toHaveValue("Diretora");
    expect(screen.getByRole("checkbox", {
      name: "Lembrar meu login neste dispositivo",
    })).toBeChecked();
  });
});
