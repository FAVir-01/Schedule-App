import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import { createTaskScheduleMatcher } from './taskSchedule';

export const RECENT_ACTIVITY_MONTHS = 3;

const startOfRecentPeriod = (today, monthCount) => {
  const start = new Date(today);
  start.setDate(1);
  start.setMonth(start.getMonth() - (monthCount - 1));
  return start;
};

const startOfMondayWeek = (date) => {
  const start = new Date(date);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
};

const endOfSundayWeek = (date) => {
  const end = new Date(date);
  const daysUntilSunday = (7 - end.getDay()) % 7;
  end.setDate(end.getDate() + daysUntilSunday);
  return end;
};

// Modelo puro da grade usada no detalhe da tarefa. A faixa usa os três meses
// de calendário mais recentes, mas as colunas continuam sendo semanas como no
// Anki. A semana começa na segunda-feira, portanto a ordem é M T W T F S S.
export const buildRecentTaskActivity = (
  task,
  { today = new Date(), monthCount = RECENT_ACTIVITY_MONTHS } = {}
) => {
  const end = normalizeDateValue(today) ?? normalizeDateValue(new Date());
  const safeMonthCount = Math.max(1, Math.min(12, Math.trunc(monthCount) || 1));
  const periodStart = startOfRecentPeriod(end, safeMonthCount);
  const gridStart = startOfMondayWeek(periodStart);
  const gridEnd = endOfSundayWeek(end);
  const todayKey = getDateKey(end);
  const periodStartKey = getDateKey(periodStart);
  const isScheduled = createTaskScheduleMatcher(task, { targetDatesAreNormalized: true });
  const columns = [];
  let completed = 0;
  let scheduled = 0;

  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const days = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = new Date(cursor);
      const key = getDateKey(date);
      const isOutsidePeriod = key < periodStartKey || key > todayKey;
      const onSchedule = !isOutsidePeriod && isScheduled(date);
      const isCompleted = onSchedule && Boolean(task?.completedDates?.[key]);
      // Hoje ainda pode ser cumprido. Ele só entra no denominador se já foi
      // concluído, evitando transformar uma ocorrência aberta em falha.
      const isEvaluated = onSchedule && (key < todayKey || isCompleted);

      if (isEvaluated) {
        scheduled += 1;
        if (isCompleted) {
          completed += 1;
        }
      }

      days.push({
        date,
        key,
        onSchedule,
        isCompleted,
        isEvaluated,
        isOutsidePeriod,
        isToday: key === todayKey,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    columns.push({ key: days[0].key, days });
  }

  return {
    columns,
    completed,
    scheduled,
    missed: scheduled - completed,
    successRate: scheduled > 0 ? Math.round((completed / scheduled) * 100) : null,
    periodStartKey,
    periodEndKey: todayKey,
  };
};
