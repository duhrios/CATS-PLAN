import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTeacherProfile, saveTeacherProfile } from "./teacher-profile";

const refreshSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-session", () => ({
  refreshAuthenticatedSession: refreshSession,
}));

describe("teacher profile API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshSession.mockResolvedValue({ role: "user" });
  });

  it("loads the authenticated teacher's profile", async () => {
    const profile = {
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 1",
      subject: "",
      className: "2º ano A",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadTeacherProfile()).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/teacher-profile", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("saves profile data and refreshes the authenticated session", async () => {
    const profile = {
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 1" as const,
      subject: "",
      className: "2º ano A",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 })));

    await expect(saveTeacherProfile(profile)).resolves.toEqual(profile);
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it("surfaces server validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Selecione uma turma cadastrada pelo TI na sala.",
    }), { status: 400 })));

    await expect(saveTeacherProfile({
      name: "Ana Souza",
      email: "ana@escola.com.br",
      segment: "Fundamental 1",
      subject: "",
      className: "",
    })).rejects.toThrow("Selecione uma turma cadastrada pelo TI na sala.");
  });
});
