import { describe, expect, it } from "vitest";
import { isReservationCancellationAllowed } from "./reservation-rules";

describe("teacher reservation cancellation window", () => {
  const date = "2027-01-04";
  const start = "07:00:00";

  it("allows cancellation exactly 24 hours before the reservation", () => {
    expect(
      isReservationCancellationAllowed(
        date,
        start,
        new Date("2027-01-03T07:00:00-03:00"),
      ),
    ).toBe(true);
  });

  it("closes cancellation less than 24 hours before, on the day, and after the start", () => {
    expect(
      isReservationCancellationAllowed(
        date,
        start,
        new Date("2027-01-03T07:00:01-03:00"),
      ),
    ).toBe(false);
    expect(
      isReservationCancellationAllowed(
        date,
        start,
        new Date("2027-01-04T06:00:00-03:00"),
      ),
    ).toBe(false);
    expect(
      isReservationCancellationAllowed(
        date,
        start,
        new Date("2027-01-04T08:00:00-03:00"),
      ),
    ).toBe(false);
  });

  it("rejects malformed dates and times", () => {
    expect(
      isReservationCancellationAllowed(
        "2027-02-30",
        start,
        new Date("2027-02-01T00:00:00-03:00"),
      ),
    ).toBe(false);
    expect(
      isReservationCancellationAllowed(
        date,
        "25:00",
        new Date("2027-01-01T00:00:00-03:00"),
      ),
    ).toBe(false);
  });
});
