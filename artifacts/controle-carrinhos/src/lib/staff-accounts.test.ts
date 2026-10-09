import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStaffAccount,
  deleteStaffAccount,
  loadStaffAccounts,
  updateStaffAccount,
} from "./staff-accounts";

describe("staff account API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads validated accounts using the authenticated session cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "14", name: "Equipe TI", role: "operator", isSuperAdmin: false },
    ]), { status: 200 })));

    await expect(loadStaffAccounts()).resolves.toEqual([
      { id: "14", name: "Equipe TI", role: "operator", isSuperAdmin: false },
    ]);
    expect(fetch).toHaveBeenCalledWith("/api/auth/staff-accounts", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {},
    });
  });

  it("posts new staff accounts and reports server errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "15",
        name: "Admin TI",
        role: "admin",
        isSuperAdmin: false,
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Nome já utilizado." }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createStaffAccount("Admin TI", "senha123", "admin")).resolves.toMatchObject({
      id: "15",
      role: "admin",
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ name: "Admin TI", password: "senha123", role: "admin" }),
    });
    await expect(createStaffAccount("Admin TI", "senha123", "admin")).rejects.toThrow("Nome já utilizado.");
  });

  it("updates the staff password and parses the server-confirmed account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "14",
      name: "Eduardo TI",
      role: "operator",
      isSuperAdmin: false,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateStaffAccount("14", "Eduardo TI", "nova-senha-ti")).resolves.toEqual({
      id: "14",
      name: "Eduardo TI",
      role: "operator",
      isSuperAdmin: false,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/staff-accounts/14", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Eduardo TI", password: "nova-senha-ti" }),
    });
  });

  it("deletes a staff account and rejects malformed account responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 9 }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteStaffAccount("9")).resolves.toBeUndefined();
    await expect(loadStaffAccounts()).rejects.toThrow("O servidor retornou uma conta inválida.");
  });
});
