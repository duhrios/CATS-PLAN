import type { CampusRoom } from "./room-directory";

type TeacherSegment =
  | "Educação Infantil"
  | "Fundamental 1"
  | "Fundamental 2"
  | "Ensino Médio"
  | "Contraturno";

export type TeacherRoomProfile = {
  segment: TeacherSegment;
  additionalSegments?: TeacherSegment[];
  className?: string;
};

export type TeacherRoomSelection = {
  segment: TeacherSegment;
  className: string;
  room: string;
  period: "Manhã" | "Tarde";
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

const segmentForClass = (className: string, fallback: TeacherSegment): TeacherSegment => {
  const normalized = className.trim().toLocaleUpperCase("pt-BR");
  if (normalized === "CONTRATURNO") return "Contraturno";
  if (/^(PR[EÉ]|MAT\.?)(\s|$)/.test(normalized)) return "Educação Infantil";
  if (/^(INT[-\s]|[1-3]\s*°?\s*EM\b)/.test(normalized)) return "Ensino Médio";
  const grade = normalized.match(/^([1-9])\s*°/);
  if (grade) return Number(grade[1]) <= 5 ? "Fundamental 1" : "Fundamental 2";
  return fallback;
};

export const teacherCanReserveRoom = (
  profile: TeacherRoomProfile,
  rooms: CampusRoom[],
  selection: TeacherRoomSelection,
) => {
  const allowedSegments = new Set([
    profile.segment,
    ...(profile.additionalSegments ?? []),
  ]);
  if (!allowedSegments.has(selection.segment)) return false;
  if (
    (profile.segment === "Educação Infantil" || profile.segment === "Fundamental 1") &&
    profile.segment === selection.segment &&
    normalize(profile.className ?? "") !== normalize(selection.className)
  ) {
    return false;
  }

  const selectedRoom = normalize(selection.room).replace(/^sala\s*/, "");
  return rooms.some((room) => {
    if (normalize(room.number).replace(/^sala\s*/, "") !== selectedRoom) return false;
    const classes = selection.period === "Manhã" ? room.morningClasses : room.afternoonClasses;
    return classes.some((className) =>
      normalize(className) === normalize(selection.className) &&
      segmentForClass(className, room.segment as TeacherSegment) === selection.segment,
    );
  });
};
