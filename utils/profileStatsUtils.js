import { differenceInCalendarDays } from 'date-fns';
import {
  createTaskScheduleMatcher,
  getDateKey,
  normalizeDateValue,
} from './dateUtils';
import {
  getTaskCompletionStatus,
  shouldCountTaskTowardsCompletion,
} from './taskUtils';

export const MAX_PROFILE_STREAK_DAYS = 730;
export const MAX_CHART_SERIES_DAYS = MAX_PROFILE_STREAK_DAYS + 6;

const normalizeDayCount = (value, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.min(parsed, maximum);
};

const createDateRangeEndingAt = (endDate, dayCount) => {
  const dates = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - offset);
    dates.push(date);
  }
  return dates;
};

const findEarliestProfileDate = ({ tasks, history, today, includeHistory }) => {
  let earliest = today;
  let hasCandidate = false;

  const consider = (value) => {
    const normalized = normalizeDateValue(value);
    if (!normalized) {
      return;
    }
    if (!hasCandidate || normalized < earliest) {
      earliest = normalized;
    }
    hasCandidate = true;
  };

  if (includeHistory && Array.isArray(history)) {
    history.forEach((entry) => consider(entry?.timestamp));
  }
  tasks.forEach((task) => consider(task?.date ?? task?.dateKey));

  if (!hasCandidate || earliest > today) {
    return today;
  }
  return earliest;
};

export const calculateProfileStats = ({
  tasks,
  history,
  selectedTask = null,
  today = new Date(),
  maximumStreakDays = MAX_PROFILE_STREAK_DAYS,
}) => {
  const normalizedToday = normalizeDateValue(today) ?? normalizeDateValue(new Date());
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const statsTasks = selectedTask ? [selectedTask] : allTasks;
  const committedHabits = allTasks.length;
  const startDate = findEarliestProfileDate({
    tasks: statsTasks,
    history,
    today: normalizedToday,
    includeHistory: !selectedTask,
  });
  const totalDays = Math.max(
    0,
    differenceInCalendarDays(normalizedToday, startDate) + 1
  );
  const completions = selectedTask
    ? Object.values(selectedTask.completedDates ?? {}).filter(
        (isCompleted) => isCompleted === true
      ).length
    : 0;
  const scorableTasks = statsTasks.filter(shouldCountTaskTowardsCompletion);

  if (!scorableTasks.length || totalDays === 0) {
    return {
      totalDays,
      committedHabits,
      completions,
      currentStreak: 0,
      bestStreak: 0,
      evaluatedDays: 0,
      isStreakRangeLimited: false,
    };
  }

  const evaluatedDays = normalizeDayCount(
    Math.min(totalDays, maximumStreakDays),
    MAX_PROFILE_STREAK_DAYS
  );
  const dates = createDateRangeEndingAt(normalizedToday, evaluatedDays);
  const scheduledTasks = scorableTasks.map((task) => ({
    task,
    matchesDate: createTaskScheduleMatcher(task, {
      targetDatesAreNormalized: true,
    }),
  }));
  let currentStreak = 0;
  let bestStreak = 0;

  dates.forEach((date) => {
    let hasScheduledTask = false;
    let isComplete = true;

    for (const scheduledTask of scheduledTasks) {
      if (!scheduledTask.matchesDate(date)) {
        continue;
      }
      hasScheduledTask = true;
      if (!getTaskCompletionStatus(scheduledTask.task, date)) {
        isComplete = false;
        break;
      }
    }

    if (!hasScheduledTask) {
      return;
    }
    if (isComplete) {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else if (date.getTime() !== normalizedToday.getTime()) {
      currentStreak = 0;
    }
  });

  return {
    totalDays,
    committedHabits,
    completions,
    currentStreak,
    bestStreak,
    evaluatedDays,
    isStreakRangeLimited: totalDays > evaluatedDays,
  };
};

export const buildDailyCompletionSeries = ({
  tasks,
  selectedTask = null,
  endDate = new Date(),
  days,
}) => {
  const normalizedEndDate = normalizeDateValue(endDate) ?? normalizeDateValue(new Date());
  const dayCount = normalizeDayCount(days, MAX_CHART_SERIES_DAYS);
  const dates = createDateRangeEndingAt(normalizedEndDate, dayCount);
  const dateKeys = dates.map(getDateKey);
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const statsTasks = selectedTask
    ? [selectedTask]
    : allTasks.filter(shouldCountTaskTowardsCompletion);
  const completedByDate = Array(dayCount).fill(0);
  const totalByDate = Array(dayCount).fill(0);

  statsTasks.forEach((task) => {
    const matchesDate = createTaskScheduleMatcher(task, {
      targetDatesAreNormalized: true,
    });
    dates.forEach((date, index) => {
      if (!matchesDate(date)) {
        return;
      }
      totalByDate[index] += 1;
      if (getTaskCompletionStatus(task, dateKeys[index])) {
        completedByDate[index] += 1;
      }
    });
  });

  return {
    dates,
    entries: dates.map((_, index) => ({
      completed: completedByDate[index],
      total: totalByDate[index],
    })),
  };
};
