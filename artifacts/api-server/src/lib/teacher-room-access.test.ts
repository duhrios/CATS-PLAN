import { describe, expect, it } from "vitest";
import type { CampusRoom } from "./room-directory";
import { teacherCanReserveRoom } from "./teacher-room-access";

const rooms: CampusRoom[] = [
  {
    id: "room-07",
    number: "07",
    floor: "1º piso",
    segment: "Fundamental 2",
    morningClasses: ["6° MA"],
    afternoonClasses: ["1° EM TA"],
  },
  {
    id: "room-12",
    number: "12",
    floor: "1º piso",
    segment: "Fundamental 1",
    morningClasses: ["2° MA"],
    afternoonClasses: [],
  },
  {
    id: "room-14",
    number: "14",
    floor: "Subsolo",
    segment: "Educação Infantil",
    morningClasses: ["PRÉ II MA"],
    afternoonClasses: [],
  },
];

describe("teacher room access", () => {
  it("allows only registered classes and rooms in the teacher's selected segments", () => {
    const profile = {
      segment: "Ensino Médio" as const,
      additionalSegments: ["Fundamental 2" as const],
    };

    expect(teacherCanReserveRoom( profile, rooms, {
      segment: "Fundamental 2",
      className: "6° MA",
      room: "Sala 07",
      period: "Manhã",
    })).toBe(true);
    expect(teacherCanReserveRoom(profile, rooms, {
      segment: "Ensino Médio",
      className: "1º EM TA",
      room: "07",
      period: "Tarde",
    })).toBe(true);
    expect(teacherCanReserveRoom(profile, rooms, {
      segment: "Fundamental 1",
      className: "2° MA",
      room: "Sala 12",
      period: "Manhã",
    })).toBe(false);
  });

  it("limits early education and Fundamental 1 teachers to their profile class", () => {
    const profile = {
      segment: "Fundamental 1" as const,
      className: "2° MA",
    };
    expect(teacherCanReserveRoom(profile, rooms, {
      segment: "Fundamental 1",
      className: "2° MA",
      room: "Sala 12",
      period: "Manhã",
    })).toBe(true);
    expect(teacherCanReserveRoom(profile, rooms, {
      segment: "Fundamental 1",
      className: "6° MA",
      room: "Sala 07",
      period: "Manhã",
    })).toBe(false);
    expect(teacherCanReserveRoom(profile, rooms, {
      segment: "Educação Infantil",
      className: "PRÉ II MA",
      room: "Sala 14",
      period: "Manhã",
    })).toBe(false);

    expect(teacherCanReserveRoom({
      segment: "Educação Infantil",
      className: "PRÉ II MA",
    }, rooms, {
      segment: "Educação Infantil",
      className: "PRÉ II MA",
      room: "Sala 14",
      period: "Manhã",
    })).toBe(true);
  });

  it("rejects a room that is not assigned to that class and period", () => {
    expect(teacherCanReserveRoom({
      segment: "Ensino Médio",
    }, rooms, {
      segment: "Ensino Médio",
      className: "1° EM TA",
      room: "Sala 12",
      period: "Tarde",
    })).toBe(false);
    expect(teacherCanReserveRoom({
      segment: "Ensino Médio",
    }, rooms, {
      segment: "Ensino Médio",
      className: "1° EM TA",
      room: "Sala 07",
      period: "Manhã",
    })).toBe(false);
  });
});
