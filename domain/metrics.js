import { getCalendarDayOrdinal, getDateKey, normalizeDateValue } from '../utils/dateUtils';

export const METRIC_CALCULATIONS = ['total', 'dailyAverage', 'activeDayAverage'];
export const METRIC_PERIODS = ['month', 'previousMonth', 'week', 'year', 'all'];
export const METRIC_DISPLAYS = ['number', 'bars'];
export const createMetricId = () => `metric-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const parseMetricValue = (value) => {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
};

const label = (value) => typeof value === 'string' ? value.trim().slice(0, 120) : '';
const id = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const array = (value) => Array.isArray(value) ? value : [];
const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && normalizeDateValue(value) !== null;
export const metricRuleKey = (rule) => JSON.stringify([id(rule.taskId), rule.subtaskId == null ? null : id(rule.subtaskId)]);

// Only definitions are persisted. Results are derived from completion state, so
// reopening the screen, rechecking or undoing cannot increment a counter twice.
export const normalizeMetrics = (input) => {
  const sourceIds = new Set();
  const sources = array(input?.sources).flatMap((source) => {
    const sourceId = id(source?.id);
    const name = label(source?.name);
    if (!sourceId || !name || sourceIds.has(sourceId)) return [];
    sourceIds.add(sourceId);
    const ruleKeys = new Set();
    const rules = array(source.rules).flatMap((rule) => {
      const taskId = id(rule?.taskId);
      const value = parseMetricValue(rule?.value);
      if (!taskId || value === null) return [];
      const normalized = {
        taskId, subtaskId: rule.subtaskId == null ? null : id(rule.subtaskId), value,
        taskTitle: label(rule.taskTitle), subtaskTitle: label(rule.subtaskTitle),
      };
      const key = metricRuleKey(normalized);
      if (ruleKeys.has(key)) return [];
      ruleKeys.add(key);
      return [normalized];
    });
    return [{ id: sourceId, name, unit: label(source.unit), rules }];
  });
  const widgetIds = new Set();
  const widgets = array(input?.widgets).flatMap((widget) => {
    const widgetId = id(widget?.id);
    if (!widgetId || !label(widget?.title) || widgetIds.has(widgetId) || !sourceIds.has(id(widget.sourceId))) return [];
    widgetIds.add(widgetId);
    return [{
      id: widgetId, title: label(widget.title), sourceId: id(widget.sourceId),
      calculation: METRIC_CALCULATIONS.includes(widget.calculation) ? widget.calculation : 'total',
      period: METRIC_PERIODS.includes(widget.period) ? widget.period : 'month',
      display: METRIC_DISPLAYS.includes(widget.display) ? widget.display : 'number',
    }];
  });
  return { sources, widgets };
};

export const collectMetricRecords = (source, tasks, history = []) => {
  const taskMap = new Map(array(tasks).filter(Boolean).map((task) => [id(task.id), task]));
  const records = [];
  const missingRules = [];
  const seen = new Set();
  for (const rule of array(source?.rules)) {
    const key = metricRuleKey(rule);
    if (seen.has(key)) continue;
    seen.add(key);
    const task = taskMap.get(id(rule.taskId));
    const element = rule.subtaskId == null ? task : array(task?.subtasks).find((item) => id(item.id) === id(rule.subtaskId));
    let dates = element?.completedDates ?? {};
    if (!element) {
      missingRules.push(rule);
      dates = {};
      // A removed source can still contribute its recorded past. History is
      // newest first; use the latest state per occurrence, not the click count.
      const resolved = new Set();
      const type = rule.subtaskId == null ? 'task_completion_toggled' : 'subtask_completion_toggled';
      for (const event of array(history)) {
        const details = event?.details;
        if (event?.type !== type || id(details?.taskId) !== id(rule.taskId)
          || (rule.subtaskId != null && id(details?.subtaskId) !== id(rule.subtaskId))
          || !validDay(details?.dateKey) || resolved.has(details.dateKey)) continue;
        resolved.add(details.dateKey);
        dates[details.dateKey] = details.completed === true;
      }
    }
    for (const [dateKey, completed] of Object.entries(dates)) {
      if (completed === true && validDay(dateKey)) records.push({ dateKey, value: rule.value, ruleKey: key });
    }
  }
  return { records, missingRules };
};

const calculate = (records, start, end, calculation) => {
  const total = records.reduce((sum, record) => sum + record.value, 0);
  const activeDays = new Set(records.map((record) => record.dateKey)).size;
  const days = Math.max(1, getCalendarDayOrdinal(end) - getCalendarDayOrdinal(start) + 1);
  const divisor = calculation === 'dailyAverage' ? days : calculation === 'activeDayAverage' ? activeDays : 1;
  return { value: divisor ? total / divisor : 0, total, activeDays, days, completions: records.length };
};

export const evaluateMetric = (source, widget, tasks, { today = new Date(), history = [] } = {}) => {
  const now = normalizeDateValue(today) ?? normalizeDateValue(new Date());
  const todayKey = getDateKey(now);
  const collected = collectMetricRecords(source, tasks, history);
  const available = collected.records.filter((record) => record.dateKey <= todayKey);
  let start = new Date(now);
  let end = new Date(now);
  switch (widget.period) {
    case 'previousMonth': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break;
    case 'week': start.setDate(now.getDate() - (now.getDay() + 6) % 7); break;
    case 'year': start = new Date(now.getFullYear(), 0, 1); break;
    case 'all': {
      const first = available.reduce((earliest, record) => record.dateKey < earliest ? record.dateKey : earliest, todayKey);
      start = normalizeDateValue(first);
      break;
    }
    default: start.setDate(1);
  }
  const startKey = getDateKey(start);
  const endKey = getDateKey(end);
  const records = available.filter((record) => record.dateKey >= startKey && record.dateKey <= endKey);
  const monthly = widget.period === 'year' || widget.period === 'all';
  const groups = new Map();
  records.forEach((record) => {
    const key = monthly ? record.dateKey.slice(0, 7) : record.dateKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const buckets = [];
  const cursor = new Date(start);
  if (monthly) cursor.setDate(1);
  while (cursor <= end) {
    const bucketStart = new Date(Math.max(cursor.getTime(), start.getTime()));
    const next = new Date(cursor);
    if (monthly) next.setMonth(next.getMonth() + 1); else next.setDate(next.getDate() + 1);
    const bucketEnd = new Date(next);
    bucketEnd.setDate(bucketEnd.getDate() - 1);
    const key = monthly ? getDateKey(cursor).slice(0, 7) : getDateKey(cursor);
    buckets.push({ key, dateKey: getDateKey(cursor), ...calculate(groups.get(key) ?? [], bucketStart, new Date(Math.min(bucketEnd.getTime(), end.getTime())), widget.calculation) });
    cursor.setTime(next.getTime());
  }
  return {
    ...calculate(records, start, end, widget.calculation), startKey, endKey, buckets,
    monthly, missingRules: collected.missingRules,
  };
};
