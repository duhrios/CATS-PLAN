import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLoginPage } from "./access";

const { forgetAdminCredentials, getRememberedAdminCredentials, loginWithCredentials, rememberAdminCredentials, setLocation } = vi.hoisted(() => ({
  forgetAdminCredentials: vi.fn(),
  getRememberedAdminCredentials: vi.fn(() => ({ name: "", password: "" })),
  loginWithCredentials: vi.fn(),
  rememberAdminCredentials: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({
  changeInitialAdminPassword: vi.fn(),
  endAuthSession: vi.fn(),
  forgetAdminCredentials,
  getAuthenticatedSession: vi.fn(),
  getRememberedAdminCredentials,
  loginWithCredentials,
  rememberAdminCredentials,
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
    getRememberedAdminCredentials.mockReturnValue({ name: "", password: "" });
    loginWithCredentials.mockResolvedValue({
      name: "Administradora",
      mustChangePassword: false,
    });
  });

  it("remembers the login and password when requested", async () => {
    render(<AdminLoginPage />);

    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Administradora" },
    });
    fireEvent.change(screen.getByLabelText("Senha administrativa"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(screen.getByRole("checkbox", {
      name: "Lembrar meu login e senha neste dispositivo",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(rememberAdminCredentials).toHaveBeenCalledWith(
        "Administradora",
        "senha-segura",
        true,
      );
      expect(setLocation).toHaveBeenCalledWith("/admin");
    });
    expect(loginWithCredentials).toHaveBeenCalledWith(
      "admin",
      "Administradora",
      "senha-segura",
    );
  });

  it("prefills previously remembered credentials", () => {
    getRememberedAdminCredentials.mockReturnValue({
      name: "Diretora",
      password: "senha-salva",
    });

    render(<AdminLoginPage />);

    expect(screen.getByLabelText("Nome")).toHaveValue("Diretora");
    expect(screen.getByLabelText("Senha administrativa")).toHaveValue("senha-salva");
    expect(screen.getByRole("checkbox", {
      name: "Lembrar meu login e senha neste dispositivo",
    })).toBeChecked();
  });

  it("clears remembered credentials when the option is unchecked", () => {
    render(<AdminLoginPage />);

    fireEvent.click(screen.getByRole("checkbox", {
      name: "Lembrar meu login e senha neste dispositivo",
    }));
    fireEvent.click(screen.getByRole("checkbox", {
      name: "Lembrar meu login e senha neste dispositivo",
    }));

    expect(forgetAdminCredentials).toHaveBeenCalledOnce();
  });
});
