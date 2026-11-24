import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSharedRooms,
  mergeRoomDirectoryChanges,
  saveSharedRooms,
} from "./room-directory-api";

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
      updatedAt: "2026-11-18T13:30:00.000Z",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSharedRooms()).resolves.toEqual({
      rooms: [room],
      configured: true,
      updatedAt: "2026-11-18T13:30:00.000Z",
    });
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
      updatedAt: "2026-11-18T13:30:00.001Z",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveSharedRooms([room], "2026-11-18T13:30:00.000Z"))
      .resolves.toMatchObject({ configured: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms: [room], updatedAt: "2026-11-18T13:30:00.000Z" }),
    });
  });

  it("reports server authorization and validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Somente o TI ou a administração podem cadastrar salas e turmas.",
    }), { status: 403 })));

    await expect(saveSharedRooms([room], null)).rejects.toThrow(
      "Somente o TI ou a administração podem cadastrar salas e turmas.",
    );
  });

  it("reports concurrent room-directory edits instead of silently overwriting them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "O cadastro de salas foi alterado em outro dispositivo.",
    }), { status: 409 })));

    await expect(saveSharedRooms([room], "2026-11-18T13:30:00.000Z"))
      .rejects.toThrow("O cadastro de salas foi alterado em outro dispositivo.");
  });

  it("merges a local room deletion with rooms added remotely", () => {
    const secondRoom = { ...room, id: "room-2", number: "02" };
    const remoteRoom = { ...room, id: "room-3", number: "03" };

    expect(mergeRoomDirectoryChanges(
      [room, secondRoom],
      [secondRoom],
      [room, secondRoom, remoteRoom],
    )).toEqual([secondRoom, remoteRoom]);
  });
});
