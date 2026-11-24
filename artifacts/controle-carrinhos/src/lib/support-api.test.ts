import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSupportTicket,
  loadSupportTickets,
  updateSupportTicket,
} from "./support-api";

describe("support API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads support tickets from the authenticated API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: "1",
        senderRole: "user",
        senderName: "Ana Souza",
        category: "Bug",
        title: "Tela não abre",
        message: "A planilha não abre no celular.",
        status: "Pendente",
        adminResponse: null,
        respondedBy: null,
        respondedAt: null,
        createdAt: "2026-11-23T12:00:00.000Z",
      },
    ]), { status: 200 })));

    await expect(loadSupportTickets()).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("/api/support/tickets", {
      cache: "no-store",
      credentials: "same-origin",
    });
  });

  it("creates a support ticket", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "2" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await createSupportTicket({
      category: "Sugestão",
      title: "Adicionar filtro",
      message: "Gostaria de filtrar os chamados por situação.",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/support/tickets", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "Sugestão",
        title: "Adicionar filtro",
        message: "Gostaria de filtrar os chamados por situação.",
      }),
    });
  });

  it("allows the administrator to respond and resolve a ticket", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await updateSupportTicket("2", {
      status: "Resolvido",
      adminResponse: "A alteração foi aplicada.",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/support/tickets/2", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "Resolvido",
        adminResponse: "A alteração foi aplicada.",
      }),
    });
  });
});
