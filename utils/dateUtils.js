import { endOfMonth, endOfWeek, getWeeksInMonth, startOfMonth, startOfWeek } from 'date-fns';

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

const daysBetween = (start, end) => {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const monthsBetween = (start, end) => {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth())
  );
};

const isSameDay = (dateA, dateB) => {
  if (!dateA || !dateB) {
    return false;
  }
  return dateA.getTime() === dateB.getTime();
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

  if (isSameDay(normalizedStartDate, normalizedTargetDate)) {
    return true;
  }

  const repeat = task.repeat;
  if (!repeat) {
    return false;
  }

  if (normalizedTargetDate.getTime() < normalizedStartDate.getTime()) {
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
    if (endDate && normalizedTargetDate.getTime() > endDate.getTime()) {
      return false;
    }

    if (frequency === 'daily') {
      const diffDays = daysBetween(normalizedStartDate, normalizedTargetDate);
      return diffDays % interval === 0;
    }

    if (frequency === 'weekly') {
      const diffDays = daysBetween(normalizedStartDate, normalizedTargetDate);
      const diffWeeks = Math.floor(diffDays / 7);
      const targetWeekday = getWeekdayKeyFromDate(normalizedTargetDate);
      const allowedWeekdays = normalizeRepeatCollection(repeat.weekdays);
      const resolvedWeekdays = allowedWeekdays.length
        ? allowedWeekdays
        : [getWeekdayKeyFromDate(normalizedStartDate)];
      return diffWeeks % interval === 0 && targetWeekday ? resolvedWeekdays.includes(targetWeekday) : false;
    }

    if (frequency === 'monthly') {
      const diffMonths = monthsBetween(normalizedStartDate, normalizedTargetDate);
      const selectedDays = normalizeRepeatCollection(repeat.monthDays);
      const resolvedDays = selectedDays.length ? selectedDays : [normalizedStartDate.getDate()];
      return diffMonths % interval === 0 && resolvedDays.includes(normalizedTargetDate.getDate());
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
      return normalizedTargetDate.getDay() === normalizedStartDate.getDay();
    case 'monthly':
      return normalizedTargetDate.getDate() === normalizedStartDate.getDate();
    case 'weekend': {
      const day = normalizedTargetDate.getDay();
      return day === 0 || day === 6;
    }
    case 'weekdays': {
      const day = normalizedTargetDate.getDay();
      return day >= 1 && day <= 5;
    }
    case 'custom': {
      const weekdays = Array.isArray(repeat.weekdays) ? repeat.weekdays : [];
      if (!weekdays.length) {
        return false;
      }
      const weekdayKey = getWeekdayKeyFromDate(normalizedTargetDate);
      return weekdayKey ? weekdays.includes(weekdayKey) : false;
    }
    case 'interval': {
      const interval = repeat.interval ?? 1;
      if (!interval || interval <= 0) {
        return false;
      }
      const diff = Math.floor((normalizedTargetDate - normalizedStartDate) / (1000 * 60 * 60 * 24));
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
