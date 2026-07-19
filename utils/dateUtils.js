import {
  endOfMonth,
  endOfWeek,
  getWeeksInMonth,
  isBefore,
  isSameDay as isSameDayDateFns,
  startOfDay,
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

const normalizeRepeatCollection = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (value instanceof Set) {
    return Array.from(value);
  }
  return [];
};

const normalizeRepeatInterval = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
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

const createTaskScheduleMatcher = (
  task,
  { targetDatesAreNormalized = false } = {}
) => {
  if (!task || typeof task !== 'object') {
    return () => false;
  }

  const normalizedStartDate = normalizeDateValue(task.dateKey ?? task.date);
  if (!normalizedStartDate) {
    return () => false;
  }

  const startDay = startOfDay(normalizedStartDate);
  const configuredEndDate = normalizeDateValue(task.repeat?.endDate);
  const startTime = startDay.getTime();
  const configuredEndTime = configuredEndDate?.getTime() ?? null;
  const startDayOrdinal = getCalendarDayOrdinal(startDay);
  const isQuantumTask = task.type === 'quantum';
  let repeat = task.repeat;
  if (!repeat) {
    repeat = {
      frequency: 'daily',
      option: 'daily',
      interval: 1,
      enabled: true,
    };
  }
  if (isQuantumTask && repeat.option === 'off') {
    repeat = {
      ...repeat,
      option: 'daily',
      frequency: repeat.frequency || 'daily',
      enabled: true,
    };
  }
  const repeatsAfterStart = repeat.option !== 'off' && repeat.enabled !== false;
  const rawFrequency = repeat.frequency || repeat.option || 'daily';
  const frequency = rawFrequency === 'interval' ? 'daily' : rawFrequency;
  const interval = normalizeRepeatInterval(repeat.interval);
  const allowedWeekdays = normalizeRepeatCollection(repeat.weekdays);
  const selectedMonthDays = normalizeRepeatCollection(repeat.monthDays);

  return (targetDate) => {
    const normalizedTargetDate = targetDatesAreNormalized
      ? targetDate
      : normalizeDateValue(targetDate);
    if (!normalizedTargetDate) {
      return false;
    }

    const targetDay = targetDatesAreNormalized
      ? normalizedTargetDate
      : startOfDay(normalizedTargetDate);
    if (!(targetDay instanceof Date) || Number.isNaN(targetDay.getTime())) {
      return false;
    }
    const targetTime = targetDay.getTime();
    if (configuredEndTime != null && configuredEndTime < targetTime) {
      return false;
    }

    if (startTime === targetTime) {
      return true;
    }

    if (targetTime < startTime || !repeatsAfterStart) {
      return false;
    }

    switch (frequency) {
      case 'daily':
      case 'interval': {
        const diffDays = getCalendarDayOrdinal(targetDay) - startDayOrdinal;
        return diffDays % interval === 0;
      }
      case 'weekly': {
        const diffDays = getCalendarDayOrdinal(targetDay) - startDayOrdinal;
        const diffWeeks = Math.floor(diffDays / 7);
        if (diffWeeks % interval !== 0) {
          return false;
        }
        const targetWeekday = getWeekdayKeyFromDate(targetDay);
        if (allowedWeekdays.length > 0) {
          return targetWeekday ? allowedWeekdays.includes(targetWeekday) : false;
        }
        return targetDay.getDay() === startDay.getDay();
      }
      case 'monthly': {
        const diffMonths =
          (targetDay.getFullYear() - startDay.getFullYear()) * 12 +
          targetDay.getMonth() -
          startDay.getMonth();
        if (diffMonths % interval !== 0) {
          return false;
        }
        if (selectedMonthDays.length > 0) {
          return selectedMonthDays.includes(targetDay.getDate());
        }
        return targetDay.getDate() === startDay.getDate();
      }
      case 'weekend': {
        const day = targetDay.getDay();
        return day === 0 || day === 6;
      }
      case 'weekdays': {
        const day = targetDay.getDay();
        return day >= 1 && day <= 5;
      }
      default:
        return false;
    }
  };
};

const taskScheduleMatcherCache = new WeakMap();

const shouldTaskAppearOnDate = (task, targetDate) => {
  if (!task || typeof task !== 'object' || !targetDate) {
    return false;
  }
  let matcher = taskScheduleMatcherCache.get(task);
  if (!matcher) {
    matcher = createTaskScheduleMatcher(task);
    taskScheduleMatcherCache.set(task, matcher);
  }
  return matcher(targetDate);
};

export {
  calculateWeeksInMonth,
  createCenteredWeekDates,
  createTaskScheduleMatcher,
  getDateKey,
  getMonthId,
  getMonthStart,
  getWeekdayKeyFromDate,
  isSameDay,
  isValidDateRange,
  normalizeDateValue,
  shouldTaskAppearOnDate,
};
