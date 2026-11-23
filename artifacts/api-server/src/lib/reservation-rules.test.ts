import { describe, expect, it } from "vitest";
import {
  isReservationCancellationAllowed,
  isSameDayReservationAllowed,
} from "./reservation-rules";

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

  it("allows only same-day slots contained in configured windows", () => {
    const policy = {
      sameDayBookingEnabled: true,
      sameDayBookingWindows: [{ start: "12:00", end: "13:00" }],
    };
    const now = new Date("2027-01-04T10:00:00-03:00");

    expect(isSameDayReservationAllowed(
      "2027-01-04",
      "12:00",
      "12:45",
      policy,
      now,
    )).toBe(true);
    expect(isSameDayReservationAllowed(
      "2027-01-04",
      "11:00",
      "11:45",
      policy,
      now,
    )).toBe(false);
    expect(isSameDayReservationAllowed(
      "2027-01-04",
      "12:45",
      "13:30",
      policy,
      now,
    )).toBe(false);
  });

  it("uses the configured same-day windows and freeze hours for cancellations", () => {
    const policy = {
      sameDayBookingEnabled: true,
      sameDayBookingWindows: [{ start: "12:00", end: "13:00" }],
      reservationFreezeHours: 2,
    };

    expect(isReservationCancellationAllowed(
      "2027-01-04",
      "12:00",
      new Date("2027-01-04T10:00:00-03:00"),
      policy,
    )).toBe(true);
    expect(isReservationCancellationAllowed(
      "2027-01-04",
      "12:00",
      new Date("2027-01-04T12:00:00-03:00"),
      policy,
    )).toBe(false);
    expect(isReservationCancellationAllowed(
      "2027-01-05",
      "07:00",
      new Date("2027-01-05T05:30:00-03:00"),
      policy,
    )).toBe(false);
  });
});
