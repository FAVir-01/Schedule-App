import { DEFAULT_REPEAT_CONFIG } from '../constants/app';
import { getDateKey, normalizeDateValue, shouldTaskAppearOnDate } from './dateUtils';
import { clamp01 } from './mathUtils';
import { formatDuration, getTimerTotalSeconds, toMinutes } from './timeUtils';

const getTaskCompletionStatus = (task, date) => {
  if (!task || !date) {
    return false;
  }

  const dateKey = typeof date === 'string' ? date : getDateKey(date);
  if (!dateKey) {
    return false;
  }

  if (task.completedDates && typeof task.completedDates === 'object') {
    return Boolean(task.completedDates[dateKey]);
  }

  return false;
};

const getSubtaskCompletionStatus = (subtask, dateKey) => {
  if (!subtask) {
    return false;
  }

  if (dateKey && subtask.completedDates && typeof subtask.completedDates === 'object') {
    if (subtask.completedDates[dateKey] === true) {
      return true;
    }
    if (subtask.completedDates[dateKey] === false) {
      return false;
    }
  }

  if (dateKey) {
    return false;
  }

  return Boolean(subtask.completed);
};

const restoreDeletedTaskAtIndex = (tasks, task, index) => {
  const currentTasks = Array.isArray(tasks) ? tasks : [];
  if (!task?.id || currentTasks.some((current) => current.id === task.id)) {
    return currentTasks;
  }
  const requestedIndex = Number.isInteger(index) ? index : currentTasks.length;
  const insertionIndex = Math.max(0, Math.min(requestedIndex, currentTasks.length));
  const restored = currentTasks.slice();
  restored.splice(insertionIndex, 0, task);
  return restored;
};

const getQuantumProgressValues = (task, dateKey) => {
  if (!task || task.type !== 'quantum' || !task.quantum) {
    return { doneSeconds: 0, doneCount: 0 };
  }
  if (dateKey) {
    const progressByDate = task.quantum.progressByDate;
    if (progressByDate && typeof progressByDate === 'object' && !Array.isArray(progressByDate)) {
      const entry = progressByDate[dateKey];
      if (entry && typeof entry === 'object') {
        return {
          doneSeconds: typeof entry.doneSeconds === 'number' ? entry.doneSeconds : 0,
          doneCount: typeof entry.doneCount === 'number' ? entry.doneCount : 0,
        };
      }
    }
    return { doneSeconds: 0, doneCount: 0 };
  }

  return {
    doneSeconds: typeof task.quantum.doneSeconds === 'number' ? task.quantum.doneSeconds : 0,
    doneCount: typeof task.quantum.doneCount === 'number' ? task.quantum.doneCount : 0,
  };
};

const getQuantumProgressLabel = (task, dateKey) => {
  if (!task || task.type !== 'quantum' || !task.quantum) {
    return null;
  }
  const mode = task.quantum.mode;
  if (mode === 'timer') {
    const limitSeconds = getTimerTotalSeconds(task.quantum.timer);
    if (!limitSeconds) {
      return null;
    }
    const { doneSeconds } = getQuantumProgressValues(task, dateKey);
    return `${formatDuration(doneSeconds)}/${formatDuration(limitSeconds)}`;
  }
  if (mode === 'count') {
    const limitValue = task.quantum.count?.value ?? 0;
    if (!limitValue) {
      return null;
    }
    const unit = task.quantum.count?.unit?.trim() ?? '';
    const { doneCount } = getQuantumProgressValues(task, dateKey);
    return `${doneCount}/${limitValue}${unit ? ` ${unit}` : ''}`;
  }
  return null;
};

const normalizeTagToken = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

const getQuantumProgressPercent = (task, dateKey) => {
  if (!task || task.type !== 'quantum' || !task.quantum) {
    return 0;
  }
  const mode = task.quantum.mode;
  if (mode === 'timer') {
    const totalSeconds = getTimerTotalSeconds(task.quantum.timer);
    if (!totalSeconds) {
      return 0;
    }
    const { doneSeconds } = getQuantumProgressValues(task, dateKey);
    return clamp01(doneSeconds / totalSeconds);
  }

  if (mode === 'count') {
    const limitValue = task.quantum.count?.value ?? 0;
    if (!limitValue) {
      return 0;
    }
    const { doneCount } = getQuantumProgressValues(task, dateKey);
    return clamp01(doneCount / limitValue);
  }

  return 0;
};

const normalizeTaskBehaviorType = (type) => {
  if (!type || type === 'normal' || type === 'list') {
    return 'default';
  }
  return type;
};

const getQuantumDefinitionSignature = (quantum) => {
  const mode = quantum?.mode;
  if (mode === 'timer') {
    return `timer:${getTimerTotalSeconds(quantum.timer)}`;
  }
  if (mode === 'count') {
    const value = Number.parseInt(quantum?.count?.value, 10) || 0;
    const unit = quantum?.count?.unit?.trim().toLowerCase() ?? '';
    return `count:${value}:${unit}`;
  }
  return `unknown:${mode ?? ''}`;
};

const isValidQuantumDefinition = (quantum) => {
  if (quantum?.mode === 'timer') {
    return getTimerTotalSeconds(quantum.timer) > 0;
  }
  if (quantum?.mode === 'count') {
    return (Number.parseInt(quantum?.count?.value, 10) || 0) > 0;
  }
  return false;
};

const hasTaskProgress = (task) => {
  if (!task) {
    return false;
  }
  if (
    task.completedDates &&
    typeof task.completedDates === 'object' &&
    Object.values(task.completedDates).some(Boolean)
  ) {
    return true;
  }

  const quantum = task.quantum;
  if (!quantum) {
    return false;
  }
  if ((quantum.doneSeconds ?? 0) > 0 || (quantum.doneCount ?? 0) > 0) {
    return true;
  }
  const progressByDate = quantum.progressByDate;
  return Boolean(
    progressByDate &&
      typeof progressByDate === 'object' &&
      !Array.isArray(progressByDate) &&
      Object.values(progressByDate).some(
        (entry) => (entry?.doneSeconds ?? 0) > 0 || (entry?.doneCount ?? 0) > 0
      )
  );
};

const shouldResetTaskProgress = (existingTask, nextType, nextQuantum) => {
  if (!existingTask) {
    return false;
  }
  const currentType = normalizeTaskBehaviorType(existingTask.type);
  const normalizedNextType = normalizeTaskBehaviorType(nextType);
  if (currentType !== normalizedNextType) {
    return true;
  }
  if (normalizedNextType !== 'quantum') {
    return false;
  }
  return (
    getQuantumDefinitionSignature(existingTask.quantum) !==
    getQuantumDefinitionSignature(nextQuantum)
  );
};

const reconcileTaskProgressOnEdit = (existingTask, nextType, nextQuantum) => {
  const normalizedNextType = normalizeTaskBehaviorType(nextType);
  const shouldReset = shouldResetTaskProgress(existingTask, normalizedNextType, nextQuantum);
  const existingCompletedDates =
    existingTask?.completedDates && typeof existingTask.completedDates === 'object'
      ? existingTask.completedDates
      : {};

  if (normalizedNextType !== 'quantum') {
    return {
      completedDates: shouldReset ? {} : { ...existingCompletedDates },
      quantum: null,
      progressReset: shouldReset && hasTaskProgress(existingTask),
    };
  }

  if (shouldReset) {
    return {
      completedDates: {},
      quantum: {
        ...(nextQuantum ?? {}),
        progressByDate: {},
        doneSeconds: 0,
        doneCount: 0,
        lastAdjustSeconds: 0,
        lastAdjustCount: 0,
      },
      progressReset: hasTaskProgress(existingTask),
    };
  }

  const existingQuantum = existingTask?.quantum ?? {};
  const existingProgressByDate =
    existingQuantum.progressByDate &&
    typeof existingQuantum.progressByDate === 'object' &&
    !Array.isArray(existingQuantum.progressByDate)
      ? existingQuantum.progressByDate
      : {};
  return {
    completedDates: { ...existingCompletedDates },
    quantum: {
      ...existingQuantum,
      ...(nextQuantum ?? {}),
      progressByDate: { ...existingProgressByDate },
      doneSeconds: existingQuantum.doneSeconds ?? 0,
      doneCount: existingQuantum.doneCount ?? 0,
    },
    progressReset: false,
  };
};

const normalizeTaskTagKey = (task) => {
  if (!task) {
    return null;
  }
  if (task.tag && typeof task.tag === 'string') {
    const normalized = task.tag.trim();
    if (!normalized || normalized.toLowerCase() === 'none' || normalized.toLowerCase() === 'no_tag') {
      return null;
    }
    return normalized;
  }
  if (task.tagLabel && typeof task.tagLabel === 'string') {
    const label = task.tagLabel.trim();
    if (!label || label.toLowerCase() === 'no tag') {
      return null;
    }
    return normalizeTagToken(label);
  }
  return null;
};

const getTaskTagDisplayLabel = (task, localizedLabels = {}) => {
  if (!task) {
    return null;
  }
  const semanticKey = normalizeTaskTagKey(task);
  if (semanticKey && localizedLabels[semanticKey]) {
    return localizedLabels[semanticKey];
  }
  if (task.tagLabel && typeof task.tagLabel === 'string') {
    const label = task.tagLabel.trim();
    if (!label || label.toLowerCase() === 'no tag') {
      return null;
    }
    return label;
  }
  if (task.tag && typeof task.tag === 'string') {
    const normalized = task.tag.trim();
    if (!normalized || normalized.toLowerCase() === 'none' || normalized.toLowerCase() === 'no_tag') {
      return null;
    }
    return normalized
      .split('_')
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }
  return null;
};

const getTaskTypeDisplayLabel = (task, localizedLabels = {}) => {
  if (!task) {
    return localizedLabels.default ?? null;
  }
  const semanticType = normalizeTaskBehaviorType(task.type);
  return localizedLabels[semanticType] ?? task.typeLabel ?? task.type ?? localizedLabels.default ?? null;
};

export {
  getQuantumProgressLabel,
  getQuantumProgressPercent,
  hasTaskProgress,
  isValidQuantumDefinition,
  reconcileTaskProgressOnEdit,
  getSubtaskCompletionStatus,
  getTaskCompletionStatus,
  getTaskTagDisplayLabel,
  getTaskTypeDisplayLabel,
  normalizeTaskTagKey,
  restoreDeletedTaskAtIndex,
  shouldResetTaskProgress,
};

export const isPassiveTaskType = (task) => {
  const type = task?.type;
  return type === 'reminder';
};

export const shouldCountTaskTowardsCompletion = (task) => !isPassiveTaskType(task);

export const isReminderExpiredForDate = (task, targetDate, now = new Date()) => {
  if (!task || task.type !== 'reminder') {
    return false;
  }

  const normalizedTargetDate = normalizeDateValue(targetDate);
  const normalizedNowDate = normalizeDateValue(now);

  if (!normalizedTargetDate || !normalizedNowDate) {
    return false;
  }

  if (normalizedTargetDate.getTime() < normalizedNowDate.getTime()) {
    return true;
  }

  if (normalizedTargetDate.getTime() > normalizedNowDate.getTime()) {
    return false;
  }

  if (!task.time?.specified) {
    return false;
  }

  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  if (task.time.mode === 'period' && task.time.period?.end) {
    return nowSeconds > toMinutes(task.time.period.end) * 60;
  }

  if (task.time.point) {
    return nowSeconds > toMinutes(task.time.point) * 60;
  }

  return false;
};

// Sequência de ocorrências consecutivas concluídas, respeitando a repetição:
// dias em que a tarefa não está agendada não quebram a sequência, e o dia de
// hoje ainda incompleto também não zera.
const STREAK_LOOKBACK_LIMIT_DAYS = 730;

export const getTaskStreak = (task, today = new Date()) => {
  if (!task || isPassiveTaskType(task)) {
    return 0;
  }

  const startDate = normalizeDateValue(task.dateKey ?? task.date);
  const cursor = normalizeDateValue(today);
  if (!startDate || !cursor) {
    return 0;
  }

  let streak = 0;
  for (let i = 0; i < STREAK_LOOKBACK_LIMIT_DAYS; i += 1) {
    if (cursor.getTime() < startDate.getTime()) {
      break;
    }
    if (shouldTaskAppearOnDate(task, cursor)) {
      if (getTaskCompletionStatus(task, getDateKey(cursor))) {
        streak += 1;
      } else if (i > 0) {
        break;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export const normalizeRepeatConfig = (repeatConfig) => {
  if (!repeatConfig) {
    return DEFAULT_REPEAT_CONFIG;
  }
  const { option, frequency, interval, enabled, ...rest } = repeatConfig;
  const resolvedFrequency = frequency ?? option ?? DEFAULT_REPEAT_CONFIG.frequency;
  const parsedInterval = Number.parseInt(interval, 10);
  const resolvedInterval = Number.isFinite(parsedInterval) && parsedInterval > 0
    ? parsedInterval
    : DEFAULT_REPEAT_CONFIG.interval;
  const resolvedEnabled = enabled === undefined ? true : Boolean(enabled);

  return {
    ...rest,
    enabled: resolvedEnabled,
    frequency: resolvedFrequency,
    interval: resolvedInterval,
  };
};

export const getTaskRepeatDisplayLabel = (repeatConfig, localizedLabels = {}) => {
  const normalized = normalizeRepeatConfig(repeatConfig);
  if (!normalized.enabled) {
    return localizedLabels.oneTime ?? 'One-time';
  }

  const { frequency, interval } = normalized;
  if (interval === 1) {
    return localizedLabels[frequency] ?? frequency;
  }

  const intervalTemplateKey = {
    daily: 'everyDays',
    weekly: 'everyWeeks',
    monthly: 'everyMonths',
  }[frequency];
  const template = intervalTemplateKey ? localizedLabels[intervalTemplateKey] : null;
  return template ? template.replace('{count}', String(interval)) : localizedLabels[frequency] ?? frequency;
};
