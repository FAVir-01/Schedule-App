import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { normalizeDateValue } from './dateUtils';

const PERIOD_GOAL_TYPES = ['weekly', 'monthly'];
const MAX_PERIOD_GOAL_TARGET = 999;

const normalizePeriodGoal = (value) => {
  if (!value || value.enabled === false || !PERIOD_GOAL_TYPES.includes(value.period)) {
    return null;
  }

  const target = Number.parseInt(value.target, 10);
  if (!Number.isFinite(target) || target < 1 || target > MAX_PERIOD_GOAL_TARGET) {
    return null;
  }

  return {
    period: value.period,
    target,
  };
};

const getPeriodBounds = (period, referenceDate) => {
  const normalizedReference = normalizeDateValue(referenceDate) ?? normalizeDateValue(new Date());
  const currentStart = period === 'weekly'
    ? startOfWeek(normalizedReference, { weekStartsOn: 1 })
    : startOfMonth(normalizedReference);
  const previousStart = period === 'weekly'
    ? addDays(currentStart, -7)
    : startOfMonth(addMonths(currentStart, -1));
  const elapsedDays = differenceInCalendarDays(normalizedReference, currentStart);
  const previousPeriodEnd = period === 'weekly'
    ? addDays(previousStart, 6)
    : endOfMonth(previousStart);
  const samePointInPreviousPeriod = addDays(previousStart, elapsedDays);
  const previousEnd = samePointInPreviousPeriod < previousPeriodEnd
    ? samePointInPreviousPeriod
    : previousPeriodEnd;

  return {
    currentStart,
    currentEnd: normalizedReference,
    previousStart,
    previousEnd,
  };
};

const countTaskCompletionsBetween = (task, startDate, endDate) => {
  if (!task || !startDate || !endDate || startDate > endDate) {
    return 0;
  }

  return Object.entries(task.completedDates ?? {}).reduce((total, [dateKey, completed]) => {
    if (completed !== true) {
      return total;
    }
    const date = normalizeDateValue(dateKey);
    return date && date >= startDate && date <= endDate ? total + 1 : total;
  }, 0);
};

const calculatePeriodGoalProgress = ({ task, referenceDate = new Date() }) => {
  const goal = normalizePeriodGoal(task?.periodGoal);
  if (!goal) {
    return null;
  }

  const bounds = getPeriodBounds(goal.period, referenceDate);
  const completed = countTaskCompletionsBetween(
    task,
    bounds.currentStart,
    bounds.currentEnd
  );
  const previousCompleted = countTaskCompletionsBetween(
    task,
    bounds.previousStart,
    bounds.previousEnd
  );

  return {
    ...goal,
    ...bounds,
    completed,
    previousCompleted,
    delta: completed - previousCompleted,
    remaining: Math.max(0, goal.target - completed),
    percentage: Math.min(100, Math.round((completed / goal.target) * 100)),
    reached: completed >= goal.target,
  };
};

export {
  MAX_PERIOD_GOAL_TARGET,
  PERIOD_GOAL_TYPES,
  calculatePeriodGoalProgress,
  countTaskCompletionsBetween,
  getPeriodBounds,
  normalizePeriodGoal,
};
