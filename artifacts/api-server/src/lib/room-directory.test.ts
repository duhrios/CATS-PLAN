import { describe, expect, it, vi } from "vitest";
import {
  nextRoomDirectoryTimestamp,
  roomDirectoryVersionMatches,
} from "./room-directory";

vi.mock("@workspace/db", () => ({ db: {} }));

describe("room directory concurrency", () => {
  it("only accepts the current room-directory revision", () => {
    const current = new Date("2026-11-18T13:30:00.000Z");

    expect(roomDirectoryVersionMatches(current, current.toISOString())).toBe(true);
    expect(roomDirectoryVersionMatches(current, "2026-11-18T13:29:00.000Z")).toBe(false);
    expect(roomDirectoryVersionMatches(null, null)).toBe(true);
    expect(roomDirectoryVersionMatches(null, current.toISOString())).toBe(false);
  });

  it("advances the revision when consecutive writes share a millisecond", () => {
    const current = new Date("2026-11-18T13:30:00.000Z");

    expect(nextRoomDirectoryTimestamp(current, current.getTime()).getTime())
      .toBe(current.getTime() + 1);
  });
});
