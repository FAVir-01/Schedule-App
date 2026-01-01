import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  endOfWeek,
  getWeeksInMonth,
  isBefore,
  isSameDay as isSameDayDateFns,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

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
    date.setHours(0, 0, 0, 0);
    return date;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    const date = new Date(year, month - 1, day);
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

const isSameDay = (dateA, dateB) => {
  if (!dateA || !dateB) {
    return false;
  }
  return isSameDayDateFns(dateA, dateB);
};

const getWeekdayKeyFromDate = (date) => {
  const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return WEEKDAY_KEYS[date.getDay()] ?? null;
};

const shouldTaskAppearOnDate = (task, targetDate) => {
  if (!task || !targetDate) {
    return false;
  }

  const normalizedTargetDate = normalizeDateValue(targetDate);
  const normalizedStartDate = normalizeDateValue(task.date ?? task.dateKey);

  if (!normalizedTargetDate || !normalizedStartDate) {
    return false;
  }

  const targetDay = startOfDay(normalizedTargetDate);
  const startDay = startOfDay(normalizedStartDate);

  if (isSameDay(startDay, targetDay)) {
    return true;
  }

  const repeat = task.repeat;
  if (!repeat) {
    return false;
  }

  if (isBefore(targetDay, startDay)) {
    return false;
  }

  const hasModernRepeat =
    typeof repeat.enabled === 'boolean' ||
    (typeof repeat.frequency === 'string' && repeat.frequency.trim() !== '');

  if (hasModernRepeat) {
    if (!repeat.enabled) {
      return false;
    }

    const frequency = repeat.frequency ?? 'daily';
    const interval = repeat.interval ?? 1;
    if (!interval || interval <= 0) {
      return false;
    }

    const endDate = normalizeDateValue(repeat.endDate);
    if (endDate && isBefore(endDate, targetDay)) {
      return false;
    }

    if (frequency === 'daily') {
      const diffDays = differenceInCalendarDays(targetDay, startDay);
      return diffDays % interval === 0;
    }

    if (frequency === 'weekly') {
      const diffDays = differenceInCalendarDays(targetDay, startDay);
      const diffWeeks = Math.floor(diffDays / 7);
      const targetWeekday = getWeekdayKeyFromDate(targetDay);
      const allowedWeekdays = normalizeRepeatCollection(repeat.weekdays);
      const resolvedWeekdays = allowedWeekdays.length
        ? allowedWeekdays
        : [getWeekdayKeyFromDate(startDay)];
      return diffWeeks % interval === 0 && targetWeekday ? resolvedWeekdays.includes(targetWeekday) : false;
    }

    if (frequency === 'monthly') {
      const diffMonths = differenceInCalendarMonths(targetDay, startDay);
      const selectedDays = normalizeRepeatCollection(repeat.monthDays);
      const resolvedDays = selectedDays.length ? selectedDays : [startDay.getDate()];
      return diffMonths % interval === 0 && resolvedDays.includes(targetDay.getDate());
    }

    return false;
  }

  if (!repeat.option || repeat.option === 'off') {
    return false;
  }

  switch (repeat.option) {
    case 'daily':
      return true;
    case 'weekly':
      return targetDay.getDay() === startDay.getDay();
    case 'monthly':
      return targetDay.getDate() === startDay.getDate();
    case 'weekend': {
      const day = targetDay.getDay();
      return day === 0 || day === 6;
    }
    case 'weekdays': {
      const day = targetDay.getDay();
      return day >= 1 && day <= 5;
    }
    case 'custom': {
      const weekdays = Array.isArray(repeat.weekdays) ? repeat.weekdays : [];
      if (!weekdays.length) {
        return false;
      }
      const weekdayKey = getWeekdayKeyFromDate(targetDay);
      return weekdayKey ? weekdays.includes(weekdayKey) : false;
    }
    case 'interval': {
      const interval = repeat.interval ?? 1;
      if (!interval || interval <= 0) {
        return false;
      }
      const diff = differenceInCalendarDays(targetDay, startDay);
      return diff % interval === 0;
    }
    default:
      return false;
  }
};

export {
  calculateWeeksInMonth,
  getDateKey,
  getMonthId,
  getMonthStart,
  getWeekdayKeyFromDate,
  isSameDay,
  normalizeDateValue,
  shouldTaskAppearOnDate,
};
