import {
  DEFAULT_REPEAT_CONFIG,
  STREAK_PAUSE_TOLERANCE_DAYS,
} from '../constants/app';
import {
  getCurrentScheduleVersion,
  getTaskTimeForDate,
  isTaskDayCompleted,
  shouldTaskAppearOnDate,
  toScheduleKey,
} from '../domain/taskSchedule';
import { getCalendarDayOrdinal, getDateKey, normalizeDateValue } from './dateUtils';
import { clamp01 } from './mathUtils';
import { formatDuration, getTimerTotalSeconds, toMinutes } from './timeUtils';
import { getDateKeyFromOccurrenceKey } from './taskTimeUtils';

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

// Estado visual do lembrete: horário encerrado não significa falta nem arquivamento.
export const isReminderTimeElapsed = (task, targetDate, now = new Date()) => {
  if (task?.type !== 'reminder') return false;
  const target = normalizeDateValue(targetDate);
  const today = normalizeDateValue(now);
  if (!target || !today) return false;
  if (target.getTime() !== today.getTime()) return target < today;
  const time = getTaskTimeForDate(task, target);
  if (!time?.specified) return false;
  const end = time.mode === 'period' ? time.period?.end : time.point;
  if (!end) return false;
  const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return seconds > toMinutes(end) * 60;
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

export const getQuantumProgressValues = (task, dateKey) => {
  if (!task || task.type !== 'quantum' || !task.quantum) {
    return { doneSeconds: 0, doneCount: 0 };
  }
  if (dateKey) {
    const progressByDate = task.quantum.progressByDate;
    const completed = Boolean(task.completedDates?.[dateKey]);
    if (progressByDate && typeof progressByDate === 'object' && !Array.isArray(progressByDate)) {
      const entry = progressByDate[dateKey];
      if (entry && typeof entry === 'object') {
        const timerLimit = task.quantum.mode === 'timer'
          ? getTimerTotalSeconds(task.quantum.timer)
          : 0;
        const countLimit = task.quantum.mode === 'count'
          ? Number(task.quantum.count?.value) || 0
          : 0;
        return {
          doneSeconds: completed
            ? Math.max(Number(entry.doneSeconds) || 0, timerLimit)
            : Number(entry.doneSeconds) || 0,
          doneCount: completed
            ? Math.max(Number(entry.doneCount) || 0, countLimit)
            : Number(entry.doneCount) || 0,
        };
      }
    }
    if (completed) {
      return {
        doneSeconds: task.quantum.mode === 'timer'
          ? getTimerTotalSeconds(task.quantum.timer)
          : 0,
        doneCount: task.quantum.mode === 'count'
          ? Number(task.quantum.count?.value) || 0
          : 0,
      };
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

const getQuantumStepLabel = (task, amount) => {
  const step = Math.max(0, Math.round(Number(amount) || 0));
  if (!step || task?.type !== 'quantum') {
    return null;
  }
  if (task.quantum?.mode === 'timer') {
    const hours = Math.floor(step / 3600);
    const minutes = Math.floor((step % 3600) / 60);
    const seconds = step % 60;
    if (hours && !minutes && !seconds) {
      return `${hours}h`;
    }
    if (hours) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes && !seconds) {
      return `${minutes}m`;
    }
    return `${step}s`;
  }
  const unit = `${task.quantum?.count?.unit ?? ''}`.trim();
  return `${step}${unit ? ` ${unit}` : ''}`;
};

const reconcileQuantumCompletionState = (quantum, completedDates) => {
  const normalizedCompletedDates =
    completedDates && typeof completedDates === 'object' && !Array.isArray(completedDates)
      ? { ...completedDates }
      : {};
  if (!quantum || (quantum.mode !== 'timer' && quantum.mode !== 'count')) {
    return { quantum, completedDates: normalizedCompletedDates };
  }

  const progressByDate =
    quantum.progressByDate &&
    typeof quantum.progressByDate === 'object' &&
    !Array.isArray(quantum.progressByDate)
      ? { ...quantum.progressByDate }
      : {};
  const limit = quantum.mode === 'timer'
    ? getTimerTotalSeconds(quantum.timer)
    : Number(quantum.count?.value) || 0;
  if (limit <= 0) {
    return {
      quantum: { ...quantum, progressByDate },
      completedDates: normalizedCompletedDates,
    };
  }

  Object.entries(normalizedCompletedDates).forEach(([dateKey, completed]) => {
    if (!completed) {
      return;
    }
    const entry = progressByDate[dateKey] ?? {};
    progressByDate[dateKey] = quantum.mode === 'timer'
      ? { ...entry, doneSeconds: Math.max(Number(entry.doneSeconds) || 0, limit) }
      : { ...entry, doneCount: Math.max(Number(entry.doneCount) || 0, limit) };
  });

  Object.entries(progressByDate).forEach(([dateKey, entry]) => {
    const value = quantum.mode === 'timer'
      ? Number(entry?.doneSeconds) || 0
      : Number(entry?.doneCount) || 0;
    if (value >= limit) {
      normalizedCompletedDates[dateKey] = true;
    }
  });

  return {
    quantum: { ...quantum, progressByDate },
    completedDates: normalizedCompletedDates,
  };
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
  getQuantumStepLabel,
  hasTaskProgress,
  isValidQuantumDefinition,
  reconcileTaskProgressOnEdit,
  getSubtaskCompletionStatus,
  getTaskCompletionStatus,
  getTaskTagDisplayLabel,
  getTaskTypeDisplayLabel,
  normalizeTaskTagKey,
  reconcileQuantumCompletionState,
  restoreDeletedTaskAtIndex,
  shouldResetTaskProgress,
};

// Arquivada = o usuário arquivou. Estado explícito, nada derivado.
export const isTaskArchived = (task) => Boolean(task?.archived);

// Vencida = a tarefa não tem mais nenhum dia pela frente. É DERIVADO da data,
// não um estado gravado. Antes as duas coisas moravam na mesma função, e era
// isso que obrigava "reativar" a falsificar a data de início da tarefa para
// escapar do próprio filtro.
//
// São dois jeitos de uma tarefa acabar, e os dois contam:
//   - avulsa: a ocorrência única já passou;
//   - repetente: a data final da repetição já passou.
export const isTaskExpired = (task, todayKey) => {
  if (!task || !todayKey) {
    return false;
  }
  const version = getCurrentScheduleVersion(task);
  if (!version) {
    return false;
  }
  const repeat = normalizeRepeatConfig(version.repeat);
  if (!repeat.enabled) {
    return version.effectiveFrom < todayKey;
  }
  const endKey = toScheduleKey(repeat.endDate);
  if (!endKey) {
    return false;
  }
  // Fim anterior ao próprio início não descreve dia nenhum: sem isso, um dado
  // antigo ou importado vira uma tarefa invisível parada na lista de ativas.
  return endKey < todayKey || endKey < version.effectiveFrom;
};

// Reativar um hábito que chegou ao fim precisa soltar a data final vencida:
// sem isso a versão nova já nasceria expirada e o botão não faria nada.
export const clearExpiredRepeatEnd = (repeat, todayKey) => {
  const normalized = normalizeRepeatConfig(repeat);
  if (!normalized.enabled || !todayKey) {
    return repeat ?? null;
  }
  const endKey = toScheduleKey(normalized.endDate);
  if (!endKey || endKey >= todayKey) {
    return repeat ?? null;
  }
  const { endDate: _expiredEndDate, ...withoutEnd } = normalized;
  return withoutEnd;
};

// Arquivadas reúne arquivamento manual e repetições cuja data de término passou.
// Passar a data/horário de uma ocorrência avulsa não arquiva a tarefa.
export const isTaskInactive = (task, todayKey) => {
  if (isTaskArchived(task)) {
    return true;
  }
  const version = getCurrentScheduleVersion(task);
  const repeat = normalizeRepeatConfig(version?.repeat);
  const endKey = toScheduleKey(repeat.endDate);
  return Boolean(repeat.enabled && endKey && todayKey && endKey < todayKey);
};

export const getTaskLastCompletionDateKey = (task) => {
  if (!task?.completedDates || typeof task.completedDates !== 'object') {
    return null;
  }
  let latest = null;
  Object.entries(task.completedDates).forEach(([occurrenceKey, completed]) => {
    // A chave pode trazer o sufixo da ocorrência; quem chama espera uma data.
    const dateKey = getDateKeyFromOccurrenceKey(occurrenceKey);
    if (completed && dateKey && (!latest || dateKey > latest)) {
      latest = dateKey;
    }
  });
  return latest;
};

// Conclusoes sao guardadas por ocorrencia em `completedDates`. O total e os
// selos sao derivados desse mesmo mapa para nao manter um contador paralelo
// que possa divergir ao desmarcar uma data ou restaurar um backup.
export const getTaskFinishedCount = (task) => {
  if (!task?.completedDates || typeof task.completedDates !== 'object') {
    return 0;
  }
  return Object.values(task.completedDates).filter(Boolean).length;
};

export const getFinishedMilestoneValue = (finishedCount) => {
  const count = Number(finishedCount);
  if (!Number.isInteger(count) || count <= 0) {
    return null;
  }
  if (count === 10) {
    return count;
  }
  return count >= 50 && count % 50 === 0 ? count : null;
};

export const getLatestFinishedMilestoneValue = (finishedCount) => {
  const count = Number(finishedCount);
  if (!Number.isInteger(count) || count < 10) {
    return null;
  }
  if (count < 50) {
    return 10;
  }
  return Math.floor(count / 50) * 50;
};

export const getTaskLatestFinishedMilestone = (task) =>
  getLatestFinishedMilestoneValue(getTaskFinishedCount(task));

// Cada marco veste uma patente, e a patente e so derivada do numero do marco:
// nada disso fica gravado na tarefa. Desmarcar uma conclusao antiga recontou o
// historico, o dia que era o centesimo virou nonagesimo nono e o dia seguinte
// assume o selo ja com a patente certa. Da 300a em diante o iridescente e teto
// permanente: os marcos continuam de 50 em 50, mas um metal novo a cada marco
// nao teria como ser legivel em 24 pixels.
export const MILESTONE_TIER_STEPS = [
  { at: 10, id: 'cardboard' },
  { at: 50, id: 'bronze' },
  { at: 100, id: 'silver' },
  { at: 150, id: 'steel' },
  { at: 200, id: 'violet' },
  { at: 250, id: 'obsidian' },
  { at: 300, id: 'iridescent' },
];

export const getMilestoneTierId = (milestone) => {
  const value = Number(milestone);
  if (!Number.isInteger(value)) {
    return null;
  }
  let tierId = null;
  MILESTONE_TIER_STEPS.forEach((step) => {
    if (value >= step.at) {
      tierId = step.id;
    }
  });
  return tierId;
};

export const getTaskMilestoneTierId = (task) =>
  getMilestoneTierId(getTaskLatestFinishedMilestone(task));

export const getTaskFinishedMilestoneForDate = (task, dateKey) => {
  if (!dateKey || !task?.completedDates || typeof task.completedDates !== 'object') {
    return null;
  }

  const completedDateKeys = Object.entries(task.completedDates)
    .filter(([, completed]) => Boolean(completed))
    .map(([key]) => key)
    .sort();
  const completionIndex = completedDateKeys.indexOf(dateKey);
  if (completionIndex < 0) {
    return null;
  }
  return getFinishedMilestoneValue(completionIndex + 1);
};

export const isPassiveTaskType = (task) => {
  const type = task?.type;
  return type === 'reminder';
};

export const shouldCountTaskTowardsCompletion = (task) => !isPassiveTaskType(task);

// Sequência é um conceito de hábito: exige algo que se repita. Tarefa avulsa
// acontece uma vez e pronto — contar sequência nela produz números que não
// querem dizer nada, do mesmo jeito que um lembrete nunca contou.
//
// Predicado SEPARADO de `shouldCountTaskTowardsCompletion` de propósito: uma
// tarefa avulsa de hoje continua valendo para o "terminei tudo hoje", para o
// relatório do dia e para o gráfico. Ela só não tem sequência.
export const shouldCountTaskTowardsStreak = (task) => {
  if (!task || isPassiveTaskType(task)) {
    return false;
  }
  return normalizeRepeatConfig(getCurrentScheduleVersion(task)?.repeat).enabled;
};

// Desde quando a tarefa está parada. São os dois jeitos de parar: guardada à
// mão (`archivedAt`) ou encerrada pela data final da repetição.
export const getTaskPausedSinceKey = (task) => {
  const archivedKey = toScheduleKey(task?.archivedAt);
  if (archivedKey) {
    return archivedKey;
  }
  const repeat = normalizeRepeatConfig(getCurrentScheduleVersion(task)?.repeat);
  return repeat.enabled ? toScheduleKey(repeat.endDate) : null;
};

// Uma pausa longa reinicia a sequência: o que veio antes dela pertence a outra
// tentativa. O intervalo entre ocorrências NÃO entra nessa conta — é por isso
// que o hábito mensal, que nunca fica guardado, não perde nada.
export const shouldResetStreakAfterPause = (
  task,
  todayKey,
  toleranceDays = STREAK_PAUSE_TOLERANCE_DAYS
) => {
  const pausedSince = normalizeDateValue(getTaskPausedSinceKey(task));
  const today = normalizeDateValue(todayKey);
  if (!pausedSince || !today) {
    return false;
  }
  return getCalendarDayOrdinal(today) - getCalendarDayOrdinal(pausedSince) >= toleranceDays;
};

// Sequência de ocorrências consecutivas concluídas, respeitando a repetição:
// dias em que a tarefa não está agendada não quebram a sequência, e o dia de
// hoje ainda incompleto também não zera.
const STREAK_LOOKBACK_LIMIT_DAYS = 730;

export const getTaskStreak = (task, today = new Date()) => {
  if (!shouldCountTaskTowardsStreak(task)) {
    return 0;
  }

  const startDate = normalizeDateValue(task.dateKey ?? task.date);
  const cursor = normalizeDateValue(today);
  if (!startDate || !cursor) {
    return 0;
  }

  // Marco deixado por uma pausa longa: a contagem não atravessa essa data.
  const resetDate = normalizeDateValue(task.streakResetAt);
  const resetTime = resetDate ? resetDate.getTime() : null;

  let streak = 0;
  for (let i = 0; i < STREAK_LOOKBACK_LIMIT_DAYS; i += 1) {
    if (cursor.getTime() < startDate.getTime()) {
      break;
    }
    if (resetTime != null && cursor.getTime() < resetTime) {
      break;
    }
    if (shouldTaskAppearOnDate(task, cursor)) {
      // Sequência conta DIAS: a segunda com duas aulas só entra quando as duas
      // foram marcadas.
      if (isTaskDayCompleted(task, cursor)) {
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
