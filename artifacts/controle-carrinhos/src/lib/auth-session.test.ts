import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeInitialAdminPassword,
  endAuthSession,
  getAuthenticatedRole,
  getRememberedOperatorName,
  loginWithCredentials,
  refreshAuthenticatedSession,
  rememberOperatorName,
} from "@/lib/auth-session";

describe("server-validated sessions", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await endAuthSession();
    vi.mocked(fetch).mockReset();
  });

  it("does not trust a role or session forged in localStorage", () => {
    window.localStorage.setItem("controle-carrinhos-role", "admin");
    window.localStorage.setItem(
      "controle-carrinhos-auth-session",
      JSON.stringify({ role: "admin", expiresAt: null }),
    );

    expect(getAuthenticatedRole()).toBeNull();
  });

  it("accepts only the role returned by a successful server login", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      role: "admin",
      name: "Administrador",
      isSuperAdmin: true,
      mustChangePassword: true,
      expiresAt: Date.now() + 60_000,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const session = await loginWithCredentials("admin", "Administrador", "secret");

    expect(session.role).toBe("admin");
    expect(session.mustChangePassword).toBe(true);
    expect(getAuthenticatedRole()).toBe("admin");
    expect(window.localStorage.getItem("controle-carrinhos-role")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
    }));
  });

  it("clears the in-memory role when the server reports an expired session", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        role: "operator",
        name: "TI",
        isSuperAdmin: false,
        mustChangePassword: false,
        expiresAt: Date.now() + 60_000,
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await loginWithCredentials("operator", "TI", "secret");

    expect(await refreshAuthenticatedSession()).toBeNull();
    expect(getAuthenticatedRole()).toBeNull();
  });

  it("remembers only the requested username and keeps it after sign out", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    rememberOperatorName("TI manhã", true);
    await endAuthSession();

    expect(getRememberedOperatorName()).toBe("TI manhã");
    expect(window.localStorage.getItem("controle-carrinhos-auth-session")).toBeNull();
  });

  it("replaces a forced initial-password session after the server confirms the change", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      role: "admin",
      name: "Administrador",
      isSuperAdmin: true,
      mustChangePassword: false,
      expiresAt: Date.now() + 60_000,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const session = await changeInitialAdminPassword("a-secure-new-password");

    expect(session.mustChangePassword).toBe(false);
    expect(getAuthenticatedRole()).toBe("admin");
    expect(fetch).toHaveBeenCalledWith("/api/auth/initial-password", expect.objectContaining({
      method: "PUT",
      credentials: "same-origin",
    }));
  });

  it("removes a remembered username when requested", () => {
    rememberOperatorName("TI manhã", true);
    rememberOperatorName("TI manhã", false);

    expect(getRememberedOperatorName()).toBe("");
  });
});
