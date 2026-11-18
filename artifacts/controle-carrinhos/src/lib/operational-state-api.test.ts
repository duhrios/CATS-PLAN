import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadSharedOperationalState,
  mergeOperationalStateWithLocalChanges,
  saveSharedOperationalState,
} from "./operational-state-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared operational state API", () => {
  it("preserves a Wi-Fi point deletion made while shared state is loading", () => {
    const wifiPointsKey = "controle-carrinhos-wifi-points";
    const original = {
      [wifiPointsKey]: [
        { id: "point-1", name: "Original 1" },
        { id: "point-2", name: "Original 2" },
      ],
      "controle-carrinhos-carts": [{ id: "cart-local" }],
    };
    const localAfterRequest = {
      [wifiPointsKey]: [
        { id: "point-2", name: "Original 2" },
        { id: "point-3", name: "Local addition" },
      ],
      "controle-carrinhos-carts": [{ id: "cart-local" }],
    };
    const remote = {
      [wifiPointsKey]: [
        { id: "point-1", name: "Remote 1" },
        { id: "point-2", name: "Remote 2" },
        { id: "point-4", name: "Remote addition" },
      ],
      "controle-carrinhos-carts": [{ id: "cart-remote" }],
    };

    const result = mergeOperationalStateWithLocalChanges(
      original,
      localAfterRequest,
      remote,
    );

    expect(result.hasLocalChanges).toBe(true);
    expect(result.state[wifiPointsKey]).toEqual([
      { id: "point-2", name: "Remote 2" },
      { id: "point-4", name: "Remote addition" },
      { id: "point-3", name: "Local addition" },
    ]);
    expect(result.state["controle-carrinhos-carts"]).toEqual([{ id: "cart-remote" }]);
  });

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
