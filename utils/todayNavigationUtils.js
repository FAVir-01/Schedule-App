import { normalizeDateValue } from './dateUtils';

const getCalendarDayOrdinal = (date) =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);

const createCenteredDateWindow = (centerDate, radius = 6) => {
  const normalizedCenter = normalizeDateValue(centerDate);
  if (!normalizedCenter || !Number.isInteger(radius) || radius < 0) {
    return [];
  }

  return Array.from({ length: radius * 2 + 1 }, (_, index) => {
    const date = new Date(normalizedCenter);
    date.setDate(normalizedCenter.getDate() + index - radius);
    return date;
  });
};

const getCalendarDayOffset = (fromDate, toDate) => {
  const normalizedFrom = normalizeDateValue(fromDate);
  const normalizedTo = normalizeDateValue(toDate);
  if (!normalizedFrom || !normalizedTo) {
    return 0;
  }

  return getCalendarDayOrdinal(normalizedTo) - getCalendarDayOrdinal(normalizedFrom);
};

export { createCenteredDateWindow, getCalendarDayOffset };
