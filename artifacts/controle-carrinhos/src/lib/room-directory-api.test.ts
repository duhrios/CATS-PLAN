import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSharedRooms, saveSharedRooms } from "./room-directory-api";

const room = {
  id: "room-1",
  number: "01",
  floor: "Térreo",
  segment: "Fundamental 1" as const,
  morningClasses: ["2º ano A"],
  afternoonClasses: [],
};

describe("shared room directory API", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("loads the TI-configured room catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      rooms: [room],
      configured: true,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSharedRooms()).resolves.toEqual({ rooms: [room], configured: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("saves room and class changes for all teachers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      rooms: [room],
      configured: true,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveSharedRooms([room])).resolves.toMatchObject({ configured: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms: [room] }),
    });
  });

  it("reports server authorization and validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Somente o TI ou a administração podem cadastrar salas e turmas.",
    }), { status: 403 })));

    await expect(saveSharedRooms([room])).rejects.toThrow(
      "Somente o TI ou a administração podem cadastrar salas e turmas.",
    );
  });
});
