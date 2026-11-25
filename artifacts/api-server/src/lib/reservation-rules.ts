export type ReservationTimeWindow = {
  start: string;
  end: string;
};

export type ReservationPolicy = {
  sameDayBookingEnabled?: boolean;
  sameDayBookingWindows?: ReservationTimeWindow[];
  reservationFreezeHours?: number;
};

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const brazilDateTimeParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
};

export const isReservationDateInPast = (
  scheduledDate: string,
  now = new Date(),
) => scheduledDate < brazilDateTimeParts(now).date;

const validWindows = (policy: ReservationPolicy) =>
  Array.isArray(policy.sameDayBookingWindows)
    ? policy.sameDayBookingWindows.filter((window) =>
        Boolean(
          window &&
          validTime(window.start) &&
          validTime(window.end) &&
          window.start < window.end,
        ),
      )
    : [];

export const isSameDayReservationAllowed = (
  scheduledDate: string,
  startTime: string,
  endTime: string,
  policy: ReservationPolicy = {},
  now = new Date(),
) => {
  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  if (
    !policy.sameDayBookingEnabled ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) ||
    !validTime(start) ||
    !validTime(end) ||
    start >= end
  ) return false;
  const current = brazilDateTimeParts(now);
  return scheduledDate === current.date &&
    start > current.time &&
    validWindows(policy).some((window) => start >= window.start && end <= window.end);
};

export const isReservationCancellationAllowed = (
  scheduledDate: string,
  startTime: string,
  now = new Date(),
  policy: ReservationPolicy = {},
) => {
  const date = new Date(`${scheduledDate}T12:00:00Z`);
  const time = startTime.slice(0, 5);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== scheduledDate ||
    !validTime(time)
  ) return false;

  const current = brazilDateTimeParts(now);
  if (scheduledDate < current.date) return false;
  if (scheduledDate === current.date) {
    return policy.sameDayBookingEnabled === true &&
      time > current.time &&
      validWindows(policy).some((window) => time >= window.start && time < window.end);
  }

  const freezeHours = Number.isFinite(policy.reservationFreezeHours)
    ? Math.max(0, Math.min(168, policy.reservationFreezeHours ?? 24))
    : 24;
  const startsAt = new Date(`${scheduledDate}T${time}:00-03:00`);
  return startsAt.getTime() - now.getTime() >= freezeHours * 60 * 60 * 1000;
};
