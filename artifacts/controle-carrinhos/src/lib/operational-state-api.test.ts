import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadSharedOperationalState,
  saveSharedOperationalState,
} from "./operational-state-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared operational state API", () => {
  it("loads state without using a cached response", async () => {
    const payload = { state: { "controle-carrinhos-carts": [] }, updatedAt: null };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSharedOperationalState()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/operational-state", {
      cache: "no-store",
      credentials: "same-origin",
    });
  });

  it("sends the revision with updates and surfaces conflicts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        state: {},
        updatedAt: "2026-10-26T10:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "Os dados operacionais foram alterados em outro dispositivo.",
      }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveSharedOperationalState({}, "2026-10-26T09:00:00.000Z");
    await expect(saveSharedOperationalState({}, "2026-10-26T09:00:00.000Z"))
      .rejects.toThrow("Os dados operacionais foram alterados em outro dispositivo.");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "PUT",
      credentials: "same-origin",
      body: JSON.stringify({ state: {}, updatedAt: "2026-10-26T09:00:00.000Z" }),
    });
  });
});
