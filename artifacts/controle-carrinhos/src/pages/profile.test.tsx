import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherLoginPage, TeacherProfilePage } from "./profile";

const {
  checkFirstAccess,
  completeRegistration,
  createAccounts,
  loadAccounts,
  loadProfile,
  login,
  saveProfile,
  setLocation,
  updateTeacher,
} = vi.hoisted(() => ({
  checkFirstAccess: vi.fn(),
  completeRegistration: vi.fn(),
  createAccounts: vi.fn(),
  loadAccounts: vi.fn(),
  loadProfile: vi.fn(),
  login: vi.fn(),
  saveProfile: vi.fn(),
  setLocation: vi.fn(),
  updateTeacher: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
  useLocation: () => ["/login", setLocation],
}));

vi.mock("@/lib/campus-data", () => ({
  segments: ["Educação Infantil", "Fundamental 1", "Fundamental 2", "Ensino Médio"],
  useCampusData: () => ({
    teacher: { name: "", email: "", segment: "Fundamental 2", subject: "" },
    updateTeacher,
  }),
}));

vi.mock("@/lib/auth-session", () => ({
  changeTeacherPassword: vi.fn(),
  endAuthSession: vi.fn(),
  getAuthenticatedSession: vi.fn(() => null),
  loginWithCredentials: login,
}));

vi.mock("@/lib/teacher-accounts", () => ({
  checkTeacherFirstAccess: checkFirstAccess,
  completeTeacherRegistration: completeRegistration,
  createTeacherAccounts: createAccounts,
  deleteTeacherAccount: vi.fn(),
  loadTeacherAccounts: loadAccounts,
}));

vi.mock("@/lib/teacher-profile", () => ({
  loadTeacherProfile: loadProfile,
  saveTeacherProfile: saveProfile,
}));

vi.mock("@/lib/room-directory", () => ({
  useRoomDirectory: () => ({
    classEntries: [
      { className: "2º ano A", segment: "Fundamental 1" },
      { className: "Pré II", segment: "Educação Infantil" },
      { className: "8º ano A", segment: "Fundamental 2" },
    ],
    roomCatalogLoading: false,
  }),
}));

describe("Teacher first access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    checkFirstAccess.mockResolvedValue(undefined);
    completeRegistration.mockResolvedValue({ id: "12", name: "Ana Souza" });
    login.mockResolvedValue({ name: "Ana Souza" });
    loadProfile.mockResolvedValue({
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 1",
      subject: "",
      className: "",
    });

    describe("Bulk teacher account import", () => {
      beforeEach(() => {
        vi.clearAllMocks();
        createAccounts.mockResolvedValue([]);
        loadAccounts.mockResolvedValue([]);
      });

      it("creates accounts from emails without asking for segment or subject", async () => {
        render(<TeacherProfilePage admin />);

        fireEvent.click(screen.getByRole("button", { name: /importar e-mails em lote/i }));
        expect(screen.queryByLabelText("Segmento")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Matéria")).not.toBeInTheDocument();
        expect(screen.getByText(/cada professor preencherá seu segmento, matéria e turma/i)).toBeInTheDocument();

        fireEvent.change(screen.getByTestId("textarea-bulk-teacher-emails"), {
          target: { value: "ana@escola.com.br\nana@rede.com.br" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Criar acessos" }));

        await waitFor(() => {
          expect(createAccounts).toHaveBeenCalledWith([
            {
              name: "Ana",
              email: "ana@escola.com.br",
              segment: "Fundamental 1",
              subject: "",
            },
            {
              name: "Ana",
              email: "ana@rede.com.br",
              segment: "Fundamental 1",
              subject: "",
            },
          ]);
        });
      });
    });
    saveProfile.mockImplementation(async (profile) => profile);
  });

  it("checks the email before showing password fields, then creates access and signs in", async () => {
    render(<TeacherLoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /primeiro acesso/i }));
    expect(screen.getByLabelText(/e-mail cadastrado/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/crie uma senha/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/e-mail cadastrado/i), {
      target: { value: "ana@escola.com.br" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(checkFirstAccess).toHaveBeenCalledWith("ana@escola.com.br");
      expect(screen.getByLabelText(/crie uma senha/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/crie uma senha/i), {
      target: { value: "senha-segura" },
    });
    fireEvent.change(screen.getByLabelText(/confirme a senha/i), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar acesso" }));

    await waitFor(() => {
      expect(completeRegistration).toHaveBeenCalledWith("ana@escola.com.br", "senha-segura");
      expect(login).toHaveBeenCalledWith("user", "ana@escola.com.br", "senha-segura");
      expect(updateTeacher).toHaveBeenCalledWith({
        name: "Ana Souza",
        email: "ana@escola.com.br",
        segment: "Fundamental 2",
        subject: "",
        className: "",
      });
      expect(setLocation).toHaveBeenCalledWith("/usuario/perfil");
    });
  });

  describe("Teacher profile registration", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      loadProfile.mockResolvedValue({
        name: "Ana Souza",
        email: "ana@escola.com.br",
        segment: "Fundamental 1",
        subject: "",
        className: "",
      });
      saveProfile.mockImplementation(async (profile) => profile);
    });

    it("offers only TI-registered classes for Fundamental 1 and saves the selection", async () => {
      render(<TeacherProfilePage />);

      const classroom = await screen.findByTestId("select-teacher-class");
      expect(classroom.tagName).toBe("SELECT");
      expect(screen.getByRole("option", { name: "2º ano A" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "8º ano A" })).not.toBeInTheDocument();

      fireEvent.change(classroom, { target: { value: "2º ano A" } });
      fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));

      await waitFor(() => {
        expect(saveProfile).toHaveBeenCalledWith({
          name: "Ana Souza",
          email: "ana@escola.com.br",
          segment: "Fundamental 1",
          subject: "",
          className: "2º ano A",
        });
        expect(updateTeacher).toHaveBeenCalledWith(expect.objectContaining({
          className: "2º ano A",
        }));
      });
    });

    it("offers the TI-registered early education classes for Educação Infantil", async () => {
      loadProfile.mockResolvedValue({
        name: "Ana Souza",
        email: "ana@escola.com.br",
        segment: "Educação Infantil",
        subject: "",
        className: "",
      });
      render(<TeacherProfilePage />);

      const classroom = await screen.findByTestId("select-teacher-class");
      expect(screen.getByRole("option", { name: "Pré II" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "2º ano A" })).not.toBeInTheDocument();
      expect(classroom).toBeEnabled();
    });
  });

  it("does not show password inputs for an unregistered email and directs them to TI/admin", async () => {
    checkFirstAccess.mockRejectedValue(new Error(
      "Este e-mail não está cadastrado para acesso. Entre em contato com o TI para solicitar seu cadastro.",
    ));
    render(<TeacherLoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /primeiro acesso/i }));
    fireEvent.change(screen.getByLabelText(/e-mail cadastrado/i), {
      target: { value: "novo@escola.com.br" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Entre em contato com o TI para solicitar seu cadastro.",
    );
    expect(screen.queryByLabelText(/crie uma senha/i)).not.toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(completeRegistration).not.toHaveBeenCalled();
  });
});
