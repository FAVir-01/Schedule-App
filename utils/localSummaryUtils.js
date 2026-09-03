import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { createTaskScheduleMatcher } from '../domain/taskSchedule';
import {
  getDateKey,
  normalizeDateValue,
} from './dateUtils';
import {
  getTaskCompletionStatus,
  shouldCountTaskTowardsCompletion,
} from './taskUtils';

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

  return {
    currentStart,
    currentEnd: normalizedReference,
    previousStart,
    previousEnd: samePointInPreviousPeriod < previousPeriodEnd
      ? samePointInPreviousPeriod
      : previousPeriodEnd,
  };
};

const summarizeRange = ({ preparedTasks, dayMoods, startDate, endDate }) => {
  const dates = startDate <= endDate
    ? eachDayOfInterval({ start: startDate, end: endDate })
    : [];
  const taskTotals = new Map(
    preparedTasks.map(({ task }) => [
      task.id,
      { taskId: task.id, title: task.title ?? '', scheduled: 0, completed: 0 },
    ])
  );
  let planned = 0;
  let completed = 0;
  const daily = dates.map((date) => {
    let dailyPlanned = 0;
    let dailyCompleted = 0;
    preparedTasks.forEach(({ task, matchesDate }) => {
      if (!matchesDate(date)) {
        return;
      }
      dailyPlanned += 1;
      planned += 1;
      const taskTotal = taskTotals.get(task.id);
      taskTotal.scheduled += 1;
      if (getTaskCompletionStatus(task, date)) {
        dailyCompleted += 1;
        completed += 1;
        taskTotal.completed += 1;
      }
    });
    return {
      date,
      planned: dailyPlanned,
      completed: dailyCompleted,
      rate: dailyPlanned > 0 ? (dailyCompleted / dailyPlanned) * 100 : null,
    };
  });

  const reflectionTotals = dates.reduce(
    (totals, date) => {
      const reflection = dayMoods?.[getDateKey(date)];
      if (!reflection) {
        return totals;
      }
      totals.reflections += 1;
      if (Number.isFinite(Number(reflection.level))) {
        const level = Number(reflection.level);
        if (level >= 1 && level <= 5) {
          totals.moodCount += 1;
          totals.moodTotal += level;
        }
      }
      if (`${reflection.note ?? ''}`.trim()) {
        totals.notes += 1;
      }
      if (reflection.photo) {
        totals.photos += 1;
      }
      return totals;
    },
    { reflections: 0, moodCount: 0, moodTotal: 0, notes: 0, photos: 0 }
  );

  const taskSummaries = Array.from(taskTotals.values()).filter(
    (task) => task.scheduled > 0
  );
  const noCompletionTasks = taskSummaries
    .filter((task) => task.completed === 0)
    .sort((a, b) => b.scheduled - a.scheduled || a.title.localeCompare(b.title));
  const mostCompletedTask = taskSummaries
    .filter((task) => task.completed > 0)
    .sort((a, b) => b.completed - a.completed || b.scheduled - a.scheduled || a.title.localeCompare(b.title))[0]
    ?? null;
  const bestDay = daily
    .filter((day) => day.planned > 0)
    .sort((a, b) => b.rate - a.rate || b.completed - a.completed || a.date - b.date)[0]
    ?? null;

  return {
    startDate,
    endDate,
    dayCount: dates.length,
    planned,
    completed,
    rate: planned > 0 ? (completed / planned) * 100 : null,
    daily,
    taskSummaries,
    noCompletionTasks,
    mostCompletedTask,
    bestDay,
    reflections: reflectionTotals.reflections,
    moods: reflectionTotals.moodCount,
    averageMood: reflectionTotals.moodCount > 0
      ? reflectionTotals.moodTotal / reflectionTotals.moodCount
      : null,
    notes: reflectionTotals.notes,
    photos: reflectionTotals.photos,
  };
};

const buildLocalPeriodSummary = ({
  tasks,
  dayMoods,
  period = 'weekly',
  referenceDate = new Date(),
}) => {
  const normalizedPeriod = period === 'monthly' ? 'monthly' : 'weekly';
  const bounds = getPeriodBounds(normalizedPeriod, referenceDate);
  const preparedTasks = (Array.isArray(tasks) ? tasks : [])
    .filter(shouldCountTaskTowardsCompletion)
    .map((task) => ({
      task,
      matchesDate: createTaskScheduleMatcher(task, {
        targetDatesAreNormalized: true,
      }),
    }));
  const current = summarizeRange({
    preparedTasks,
    dayMoods,
    startDate: bounds.currentStart,
    endDate: bounds.currentEnd,
  });
  const previous = summarizeRange({
    preparedTasks,
    dayMoods,
    startDate: bounds.previousStart,
    endDate: bounds.previousEnd,
  });

  return {
    period: normalizedPeriod,
    current,
    previous,
    rateDelta:
      current.rate != null && previous.rate != null
        ? current.rate - previous.rate
        : null,
    completedDelta: current.completed - previous.completed,
  };
};

export { buildLocalPeriodSummary, summarizeRange };
