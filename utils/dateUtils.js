import {
  endOfMonth,
  endOfWeek,
  getWeeksInMonth,
  isBefore,
  isSameDay as isSameDayDateFns,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const getCalendarDayOrdinal = (date) =>
  Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      MILLISECONDS_PER_DAY
  );

const getDateKey = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthStart = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  normalized.setDate(1);
  return normalized;
};

const getMonthId = (date) => {
  const normalized = getMonthStart(date);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
};

const calculateWeeksInMonth = (date) => {
  try {
    if (typeof getWeeksInMonth === 'function') {
      return getWeeksInMonth(date, { weekStartsOn: 0 });
    }
  } catch (error) {
    // Fallback to manual calculation below
  }

  const start = startOfWeek(startOfMonth(date));
  const end = endOfWeek(endOfMonth(date));
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  return Math.round(days / 7);
};

const normalizeDateValue = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const createCenteredWeekDates = (centerDate) => {
  const normalizedCenter = normalizeDateValue(centerDate);
  if (!normalizedCenter) {
    return [];
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(normalizedCenter);
    date.setDate(normalizedCenter.getDate() + index - 3);
    return date;
  });
};

const isSameDay = (dateA, dateB) => {
  if (!dateA || !dateB) {
    return false;
  }
  return isSameDayDateFns(dateA, dateB);
};

const isValidDateRange = (startDate, endDate) => {
  const normalizedStart = normalizeDateValue(startDate);
  const normalizedEnd = normalizeDateValue(endDate);
  if (!normalizedStart || !normalizedEnd) {
    return false;
  }
  return !isBefore(normalizedEnd, normalizedStart);
};

const getWeekdayKeyFromDate = (date) => {
  const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return WEEKDAY_KEYS[date.getDay()] ?? null;
};

// As regras de recorrência moram em `domain/taskSchedule.js`: elas dependem do
// agendamento versionado da tarefa, não só de datas.
export {
  calculateWeeksInMonth,
  createCenteredWeekDates,
  getCalendarDayOrdinal,
  getDateKey,
  getMonthId,
  getMonthStart,
  getWeekdayKeyFromDate,
  isSameDay,
  isValidDateRange,
  normalizeDateValue,
};
