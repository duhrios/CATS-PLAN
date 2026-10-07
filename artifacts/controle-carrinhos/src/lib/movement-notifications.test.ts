import { describe, expect, it } from "vitest";
import type { CartMovement } from "@/lib/campus-data";
import { isNewTeacherMovementRequest } from "@/lib/movement-notifications";

const movement = (overrides: Partial<CartMovement> = {}): CartMovement => ({
  reservationId: 1,
  status: "Não movido",
  updatedAt: "2026-09-28T12:00:00.000Z",
  notReceived: true,
  autoCompleted: false,
  requestCount: 1,
  ...overrides,
});

describe("teacher movement request notifications", () => {
  it("does not replay an existing request when the app initializes", () => {
    expect(isNewTeacherMovementRequest(undefined, movement())).toBe(false);
  });

  it("notifies only when an active request count increases", () => {
    expect(
      isNewTeacherMovementRequest(movement(), movement({ requestCount: 2 })),
    ).toBe(true);
    expect(
      isNewTeacherMovementRequest(movement(), movement({ requestCount: 1 })),
    ).toBe(false);
    expect(
      isNewTeacherMovementRequest(
        movement(),
        movement({ requestCount: 2, status: "Movendo" }),
      ),
    ).toBe(false);
  });

  it("does not send a completed status as a movement request", () => {
    expect(
      isNewTeacherMovementRequest(
        movement(),
        movement({ requestCount: 2, status: "Concluído" }),
      ),
    ).toBe(false);
  });
});
