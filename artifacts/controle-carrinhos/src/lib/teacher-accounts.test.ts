import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkTeacherFirstAccess,
  createTeacherAccounts,
  completeTeacherRegistration,
  deleteTeacherAccount,
  loadTeacherAccounts,
  sortTeacherAccounts,
} from "./teacher-accounts";

describe("teacher account API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sorts teacher accounts alphabetically by name using Portuguese collation", () => {
    const accounts = [
      { id: "3", name: "Érica Souza", email: "erica@escola.com.br", segment: "Fundamental 1" as const, subject: "", mustSetPassword: true },
      { id: "2", name: "Ana Costa", email: "ana.costa@escola.com.br", segment: "Fundamental 1" as const, subject: "", mustSetPassword: true },
      { id: "1", name: "Ana Alves", email: "ana.alves@escola.com.br", segment: "Fundamental 1" as const, subject: "", mustSetPassword: true },
    ];

    expect(sortTeacherAccounts(accounts).map(({ name }) => name)).toEqual([
      "Ana Alves",
      "Ana Costa",
      "Érica Souza",
    ]);
    expect(accounts.map(({ name }) => name)).toEqual(["Érica Souza", "Ana Costa", "Ana Alves"]);
  });

  it("loads validated teacher accounts using the authenticated session cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: "21",
        name: "Ana Souza",
        email: "ana@escola.com.br",
        segment: "Fundamental 2",
        subject: "Ciências",
        mustSetPassword: false,
      },
    ]), { status: 200 })));

    await expect(loadTeacherAccounts()).resolves.toEqual([
      {
        id: "21",
        name: "Ana Souza",
        email: "ana@escola.com.br",
        segment: "Fundamental 2",
        subject: "Ciências",
        mustSetPassword: false,
      },
    ]);
    expect(fetch).toHaveBeenCalledWith("/api/auth/teacher-accounts", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {},
    });
  });

  it("creates accounts that require the teacher to define a password", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: "22",
        name: "Bruno Lima",
        email: "bruno@escola.com.br",
        segment: "Fundamental 1",
        subject: "",
        mustSetPassword: true,
      },
    ]), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createTeacherAccounts([{
      name: "Bruno Lima",
      email: "bruno@escola.com.br",
      segment: "Fundamental 1",
      subject: "",
    }])).resolves.toEqual([{
      id: "22",
      name: "Bruno Lima",
      email: "bruno@escola.com.br",
      segment: "Fundamental 1",
      subject: "",
      mustSetPassword: true,
    }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/teacher-accounts", {
      method: "POST",
      body: JSON.stringify({
        accounts: [{
          name: "Bruno Lima",
          email: "bruno@escola.com.br",
          segment: "Fundamental 1",
          subject: "",
        }],
      }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("completes first access with email and a teacher-chosen password", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "23",
        name: "Carla Reis",
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: "24",
        name: "Invalid",
        email: "invalid@escola.com.br",
        segment: "Unknown",
        subject: "",
        mustSetPassword: false,
      }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeTeacherRegistration("carla@escola.com.br", "senha-escolhida")).resolves.toEqual({
      id: "23",
      name: "Carla Reis",
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ email: "carla@escola.com.br", password: "senha-escolhida" }),
    });
    await expect(deleteTeacherAccount("23")).resolves.toBeUndefined();
    await expect(loadTeacherAccounts()).rejects.toThrow("O servidor retornou um cadastro de professor inválido.");
  });

  it("checks whether an email has a pending first-access invitation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ eligible: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkTeacherFirstAccess("teacher@escola.com.br")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/teacher-accounts/check-first-access", {
      method: "POST",
      body: JSON.stringify({ email: "teacher@escola.com.br" }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("surfaces the API guidance when the email was not registered", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Este e-mail não está cadastrado para acesso. Entre em contato com o TI para solicitar seu cadastro.",
    }), { status: 404 })));

    await expect(checkTeacherFirstAccess("unknown@escola.com.br")).rejects.toThrow(
      "Entre em contato com o TI para solicitar seu cadastro.",
    );
  });
});
