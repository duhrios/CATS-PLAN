import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  establishSession,
  hashPassword,
  isAllowedOrigin,
  readAuthSession,
  requireSameOrigin,
  requireSession,
  verifyPassword,
} from "./auth";

vi.mock("@workspace/db", () => ({ db: {} }));

const makeResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  cookie: vi.fn(),
});

describe("API authentication safeguards", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-session-secret-that-is-at-least-32-bytes-long");
    vi.stubEnv("APP_BASE_URL", "https://school.example");
    vi.stubEnv("CORS_ORIGINS", "");
    vi.stubEnv("NODE_ENV", "production");
  });

  it("verifies scrypt passwords and rejects malformed or incorrect hashes", () => {
    const encoded = hashPassword("correct-horse-battery");

    expect(verifyPassword("correct-horse-battery", encoded)).toBe(true);
    expect(verifyPassword("incorrect-password", encoded)).toBe(false);
    expect(verifyPassword("anything", "plain-text-password")).toBe(false);
  });

  it("signs a session cookie and reads back the authenticated identity", () => {
    const response = makeResponse();
    const expiresAt = establishSession(response as unknown as Response, {
      role: "operator",
      name: "Equipe TI",
      isSuperAdmin: false,
      mustChangePassword: false,
    });
    const [cookieName, token, cookieOptions] = response.cookie.mock.calls[0];
    const request = {
      cookies: { [cookieName]: token },
    } as unknown as Request;

    expect(cookieName).toBe("cc_session");
    expect(cookieOptions).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api",
    });
    expect(readAuthSession(request)).toMatchObject({
      role: "operator",
      name: "Equipe TI",
      mustChangePassword: false,
      expiresAt,
    });
  });

  it("rejects expired and tampered sessions", () => {
    const response = makeResponse();
    establishSession(response as unknown as Response, {
      role: "user",
      name: "Docente",
      accountId: 15,
      isSuperAdmin: false,
      mustChangePassword: false,
    });
    const [cookieName, token] = response.cookie.mock.calls[0];
    const [body, signature] = String(token).split(".");
    const request = {
      cookies: {
        [cookieName]: `${body}.${signature.slice(0, -1)}x`,
      },
    } as unknown as Request;

    expect(readAuthSession(request)).toBeNull();
    expect(readAuthSession({ cookies: {} } as unknown as Request)).toBeNull();
  });

  it("requires an authenticated session and blocks unauthenticated requests", () => {
    const response = makeResponse();
    const next = vi.fn();

    requireSession(
      { cookies: {} } as unknown as Request,
      response as unknown as Response,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: "Autenticação necessária.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows same-origin requests only from configured origins", () => {
    expect(isAllowedOrigin("https://school.example")).toBe(true);
    expect(isAllowedOrigin("https://attacker.example")).toBe(false);
    expect(isAllowedOrigin(undefined)).toBe(false);

    const response = makeResponse();
    const next = vi.fn();
    requireSameOrigin(
      { get: () => "https://attacker.example" } as unknown as Request,
      response as unknown as Response,
      next,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
