import { getDateKeyFromOccurrenceKey } from '../utils/taskTimeUtils';
import { getTimerTotalSeconds } from '../utils/timeUtils';

// Closed intervals retain the definition AND its progress. Current progress
// stays on the task, so existing backups and completion counters still work.
const snapshot = (task) => Object.fromEntries(
  ['title', 'type', 'color', 'emoji', 'customImage', 'tag', 'tagLabel', 'subtasks', 'quantum', 'definitionRecord']
    .map((key) => [key, task[key] ?? null])
);

export const getTaskForDate = (task, rawKey) => {
  const key = getDateKeyFromOccurrenceKey(rawKey);
  const version = task?.definitionHistory?.find((item) => key && key < item.until);
  return version ? { ...task, ...version.definition } : task;
};

export const updateTaskForDate = (task, key, update) => {
  const resolved = getTaskForDate(task, key);
  const updated = update(resolved);
  if (resolved === task) return updated;
  const day = getDateKeyFromOccurrenceKey(key);
  const index = task.definitionHistory.findIndex((item) => day < item.until);
  return {
    ...task,
    completedDates: updated.completedDates,
    definitionHistory: task.definitionHistory.map((item, i) => i === index
      ? { ...item, definition: snapshot(updated) } : item),
  };
};

export const getHistoricalSubtask = (task, subtaskId) => {
  const candidates = [...(task?.definitionHistory ?? []).map((item) => item.definition), task];
  const matches = candidates.flatMap((item) => item?.subtasks ?? []).filter((item) => String(item.id) === String(subtaskId));
  if (!matches.length) return undefined;
  const keys = new Set(matches.flatMap((item) => Object.keys(item.completedDates ?? {})));
  return { ...matches[matches.length - 1], completedDates: Object.fromEntries([...keys].map((key) => [key,
    getTaskForDate(task, key)?.subtasks?.find((item) => String(item.id) === String(subtaskId))?.completedDates?.[key] === true,
  ])) };
};

const measure = (task) => {
  if (task.type === 'quantum' && task.quantum?.mode === 'timer') {
    return { unit: 'seconds', value: getTimerTotalSeconds(task.quantum.timer) };
  }
  if (task.type === 'quantum' && task.quantum?.mode === 'count') {
    return { unit: `count:${(task.quantum.count?.unit ?? '').trim().toLowerCase()}`, value: Number(task.quantum.count?.value) || 0 };
  }
  return { unit: task.type === 'reminder' ? 'reminder' : 'subtasks', value: task.subtasks?.length ?? 0 };
};

// Derive the day's change from saved definitions, including edits made before
// this indicator existed. Same-day edits compare the original and final goal.
export const getTaskDefinitionChangeLabel = (task, rawKey, language = 'en') => {
  const key = getDateKeyFromOccurrenceKey(rawKey);
  const previous = task?.definitionHistory?.find((item) => item.until === key)?.definition;
  if (!previous) return null;
  const before = measure(previous);
  const after = measure(getTaskForDate(task, key));
  if (before.unit !== after.unit || before.value === after.value) return null;
  const isSubtasks = after.unit === 'subtasks';
  const label = isSubtasks
    ? (language === 'pt' ? 'Subtarefas' : 'Subtasks')
    : (language === 'pt' ? 'Meta' : 'Goal');
  const unit = after.unit === 'seconds' ? ' min' : after.unit.startsWith('count:')
    ? (after.unit.slice(6) ? ` ${after.unit.slice(6)}` : '') : '';
  const divisor = after.unit === 'seconds' ? 60 : 1;
  return `${label}: ${before.value / divisor} → ${after.value / divisor}${unit}`;
};

export const preserveTaskDefinitionOnEdit = (previous, next, todayKey) => {
  const history = previous.definitionHistory ?? [];
  const definitionHistory = history.some((item) => item.until === todayKey)
    ? history : [...history, { until: todayKey, definition: snapshot(previous) }];
  const current = measure(next);
  const prior = measure(previous);
  if (next.type === 'quantum' && previous.type === 'quantum' && current.unit === prior.unit && current.value !== prior.value) {
    const progressByDate = { ...(previous.quantum.progressByDate ?? {}) };
    const completedDates = { ...next.completedDates };
    const field = next.quantum.mode === 'timer' ? 'doneSeconds' : 'doneCount';
    const keys = new Set([...Object.keys(progressByDate), ...Object.keys(previous.completedDates ?? {})]);
    keys.forEach((key) => {
      if (getDateKeyFromOccurrenceKey(key) < todayKey) return;
      const value = Math.max(Number(progressByDate[key]?.[field]) || 0, previous.completedDates?.[key] ? prior.value : 0);
      progressByDate[key] = { ...progressByDate[key], [field]: value };
      if (value >= current.value) completedDates[key] = true;
      else delete completedDates[key];
    });
    next = { ...next, completedDates, quantum: { ...next.quantum, progressByDate } };
  }
  const previousMeasures = [...history.map((item) => measure(item.definition)), measure(previous)]
    .filter((item) => item.unit === current.unit);
  const best = Math.max(0, ...previousMeasures.map((item) => item.value),
    ...(previous.definitionRecords ?? []).filter((item) => item.unit === current.unit).map((item) => item.value));
  const record = best > 0 && current.value > best ? {
    dateKey: todayKey, previous: best, value: current.value, unit: current.unit,
    improvement: Math.round(((current.value - best) / best) * 1000) / 10,
  } : null;
  return {
    ...next,
    definitionHistory,
    definitionRecords: record ? [...(previous.definitionRecords ?? []), record] : previous.definitionRecords ?? [],
    // Never discard completed past occurrences when a goal or type changes.
    completedDates: {
      ...Object.fromEntries(Object.entries(previous.completedDates ?? {}).filter(([key]) => getDateKeyFromOccurrenceKey(key) < todayKey)),
      ...next.completedDates,
    },
    definitionRecord: record ?? (JSON.stringify(current) === JSON.stringify(measure(previous)) ? previous.definitionRecord : null),
  };
};
