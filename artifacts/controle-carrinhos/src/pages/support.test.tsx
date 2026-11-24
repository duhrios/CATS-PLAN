import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupportPage } from "./support";

const { getSession, createTicket, loadTickets, updateTicket } = vi.hoisted(() => ({
  getSession: vi.fn(),
  createTicket: vi.fn(),
  loadTickets: vi.fn(),
  updateTicket: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedSession: getSession,
}));

vi.mock("@/lib/support-api", () => ({
  createSupportTicket: createTicket,
  loadSupportTickets: loadTickets,
  updateSupportTicket: updateTicket,
}));

const ticket = {
  id: "1",
  senderRole: "user" as const,
  senderName: "Ana Souza",
  category: "Bug" as const,
  title: "Planilha não abre",
  message: "A planilha não abre no celular.",
  status: "Pendente" as const,
  adminResponse: null,
  respondedBy: null,
  respondedAt: null,
  createdAt: "2026-11-23T12:00:00.000Z",
};

describe("support page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockReturnValue({ role: "user", name: "Ana Souza" });
    loadTickets.mockResolvedValue([]);
    createTicket.mockResolvedValue(undefined);
    updateTicket.mockResolvedValue(undefined);
  });

  it("lets a teacher submit a bug report and shows only the new-ticket action", async () => {
    render(<SupportPage />);
    await screen.findByText("Você ainda não enviou solicitações ao suporte.");
    fireEvent.click(screen.getByRole("button", { name: "Novo chamado" }));
    fireEvent.change(screen.getByLabelText("Assunto"), { target: { value: "Falha na agenda" } });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "A agenda não carrega no telefone." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar chamado" }));

    await waitFor(() => expect(createTicket).toHaveBeenCalledWith({
      category: "Bug",
      title: "Falha na agenda",
      message: "A agenda não carrega no telefone.",
    }));
    expect(screen.queryByRole("button", { name: "Responder" })).not.toBeInTheDocument();
  });

  it("lets an administrator read and respond to a teacher report", async () => {
    getSession.mockReturnValue({ role: "admin", name: "Administrador" });
    loadTickets.mockResolvedValue([ticket]);
    render(<SupportPage admin />);

    expect(await screen.findByText("Planilha não abre")).toBeInTheDocument();
    expect(screen.getByText(/Ana Souza/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.change(screen.getByLabelText("Resposta"), {
      target: { value: "A falha foi corrigida." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar resposta" }));

    await waitFor(() => expect(updateTicket).toHaveBeenCalledWith("1", {
      status: "Respondido",
      adminResponse: "A falha foi corrigida.",
    }));
  });
});
