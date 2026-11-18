const dayMs = 24 * 60 * 60 * 1000;

export const isReservationCancellationAllowed = (
  scheduledDate: string,
  startTime: string,
  now = new Date(),
) => {
  const date = new Date(`${scheduledDate}T12:00:00Z`);
  const time = startTime.slice(0, 5);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== scheduledDate ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    return false;
  }
  const startsAt = new Date(`${scheduledDate}T${time}:00-03:00`);
  return startsAt.getTime() - now.getTime() >= dayMs;
};
