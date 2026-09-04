// Agendamento versionado.
//
// `repeat` e `time` dizem QUANDO a tarefa acontece — e mudam com o tempo.
// Guardados soltos no objeto da tarefa, uma edição reescrevia o passado:
// trocar "diário" por "3x por semana" em novembro mudava quais dias de outubro
// contavam como agendados, e gráfico, taxa de conclusão e sequência mudavam
// retroativamente sem nada ter acontecido de fato.
//
// A tarefa passa a guardar uma lista de versões ordenada por `effectiveFrom`.
// Cada data é avaliada pela versão vigente naquele dia: o passado congela e só
// o futuro muda. A fase da recorrência ("a cada 3 dias") é ancorada no
// `effectiveFrom` da própria versão, não na data de início da tarefa — mudar o
// agendamento re-faseia dali para frente, sem tocar no que já passou.
//
// `task.repeat` e `task.time` continuam existindo como ESPELHO da versão
// atual: é o que o editor, as notificações e os rótulos leem, e é o que mantém
// backups antigos legíveis. O espelho é sempre derivado por
// `withScheduleMirror` — nada mais deve escrever nesses dois campos.
//
// Módulo puro (sem React/React Native) para ser exercitado por
// `scripts/test-domain-rules.js`.

import {
  getCalendarDayOrdinal,
  getDateKey,
  getWeekdayKeyFromDate,
  normalizeDateValue,
} from '../utils/dateUtils';
import { resolveTimeForRepeatDate } from '../utils/taskTimeUtils';

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

const normalizeRepeatInterval = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

// Serialização determinística: comparar versões com JSON.stringify direto
// acusaria mudança só porque a ordem das chaves do objeto mudou.
const stableStringify = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
};

// Aceita tanto os formatos legados (`option`) quanto o atual
// (`frequency`/`enabled`), porque tarefas gravadas antes destas mudanças
// continuam no dispositivo do usuário.
const resolveRepeatRules = (repeat, { isQuantum = false } = {}) => {
  let source = repeat;
  if (!source || typeof source !== 'object') {
    source = { frequency: 'daily', option: 'daily', interval: 1, enabled: true };
  }
  // Regra legada preservada: meta quantum gravada com `option: 'off'` sempre
  // repetiu diariamente na prática.
  if (isQuantum && source.option === 'off') {
    source = {
      ...source,
      option: 'daily',
      frequency: source.frequency || 'daily',
      enabled: true,
    };
  }

  const rawFrequency = source.frequency || source.option || 'daily';
  const endDate = source.endDate ? normalizeDateValue(source.endDate) : null;

  return {
    repeatsAfterStart: source.option !== 'off' && source.enabled !== false,
    frequency: rawFrequency === 'interval' ? 'daily' : rawFrequency,
    interval: normalizeRepeatInterval(source.interval),
    allowedWeekdays: normalizeRepeatCollection(source.weekdays),
    selectedMonthDays: normalizeRepeatCollection(source.monthDays),
    endTime: endDate ? endDate.getTime() : null,
    endKey: endDate ? getDateKey(endDate) : null,
  };
};

export const toScheduleKey = (value) => {
  const normalized = normalizeDateValue(value);
  return normalized ? getDateKey(normalized) : null;
};

export const getTaskStartKey = (task) => toScheduleKey(task?.dateKey ?? task?.date);

export const createScheduleVersion = ({ effectiveFrom, repeat = null, time = null }) => ({
  effectiveFrom,
  repeat: repeat ?? null,
  time: time ?? null,
});

// Sempre devolve uma lista válida e ordenada, migrando a tarefa legada (sem
// `schedule`) para uma única versão que vale desde o início — o que faz o
// comportamento continuar idêntico ao de antes desta mudança.
export const normalizeTaskSchedule = (task) => {
  const startKey = getTaskStartKey(task);
  if (!startKey) {
    return [];
  }

  const fallback = [
    createScheduleVersion({
      effectiveFrom: startKey,
      repeat: task?.repeat ?? null,
      time: task?.time ?? null,
    }),
  ];

  const rawVersions = Array.isArray(task?.schedule) ? task.schedule : null;
  if (!rawVersions || rawVersions.length === 0) {
    return fallback;
  }

  const byKey = new Map();
  rawVersions.forEach((version) => {
    const key = toScheduleKey(version?.effectiveFrom);
    if (!key) {
      return;
    }
    byKey.set(
      key,
      createScheduleVersion({
        effectiveFrom: key,
        repeat: version?.repeat ?? null,
        time: version?.time ?? null,
      })
    );
  });

  // Versões anteriores ao início da tarefa não descrevem nenhum dia real.
  const sorted = Array.from(byKey.values())
    .filter((version) => version.effectiveFrom >= startKey)
    .sort((a, b) =>
      a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0
    );
  if (sorted.length === 0) {
    return fallback;
  }
  // A primeira versão vale desde o início: se ela começasse depois, os
  // primeiros dias da tarefa ficariam sem agendamento nenhum.
  if (sorted[0].effectiveFrom !== startKey) {
    sorted[0] = { ...sorted[0], effectiveFrom: startKey };
  }
  return sorted;
};

export const getCurrentScheduleVersion = (task) => {
  const schedule = normalizeTaskSchedule(task);
  return schedule.length > 0 ? schedule[schedule.length - 1] : null;
};

export const getScheduleVersionForKey = (task, dateKey) => {
  const key = toScheduleKey(dateKey);
  const schedule = normalizeTaskSchedule(task);
  if (!key || schedule.length === 0) {
    return null;
  }
  let match = null;
  for (let index = schedule.length - 1; index >= 0; index -= 1) {
    if (schedule[index].effectiveFrom <= key) {
      match = schedule[index];
      break;
    }
  }
  return match;
};

export const getTaskTimeForDate = (task, targetDate) => {
  const version = getScheduleVersionForKey(task, targetDate);
  const time = version?.time ?? task?.time ?? null;
  const repeat = version?.repeat ?? task?.repeat ?? null;
  return resolveTimeForRepeatDate(time, repeat, targetDate);
};

export const getScheduleSignature = (version, { isQuantum = false } = {}) => {
  const rules = resolveRepeatRules(version?.repeat, { isQuantum });
  return stableStringify({
    repeats: rules.repeatsAfterStart,
    frequency: rules.frequency,
    interval: rules.interval,
    weekdays: [...rules.allowedWeekdays].sort(),
    monthDays: [...rules.selectedMonthDays].sort((a, b) => a - b),
    endKey: rules.endKey,
    time: version?.time ?? null,
  });
};

// Nova versão valendo a partir de `effectiveFrom`. Versões daquela data em
// diante são substituídas: reeditar duas vezes no mesmo dia não deixa lixo.
export const appendScheduleVersion = (task, { effectiveFrom, repeat, time }) => {
  const schedule = normalizeTaskSchedule(task);
  if (schedule.length === 0) {
    return schedule;
  }
  const requestedKey = toScheduleKey(effectiveFrom);
  const startKey = schedule[0].effectiveFrom;
  // Antes do início não existe passado para proteger: a edição substitui a
  // primeira versão em vez de criar uma nova.
  const key = !requestedKey || requestedKey < startKey ? startKey : requestedKey;
  const next = createScheduleVersion({ effectiveFrom: key, repeat, time });
  const kept = schedule.filter((version) => version.effectiveFrom < key);

  if (kept.length === 0) {
    return [next];
  }
  const isQuantum = task?.type === 'quantum';
  const previous = kept[kept.length - 1];
  const previousRules = resolveRepeatRules(previous.repeat, { isQuantum });
  // Salvar sem mexer no agendamento não deve criar versão. A exceção é a
  // tarefa avulsa: ali o `effectiveFrom` É a ocorrência, então uma data nova
  // com a mesma configuração continua sendo uma mudança real.
  if (
    previousRules.repeatsAfterStart &&
    getScheduleSignature(previous, { isQuantum }) === getScheduleSignature(next, { isQuantum })
  ) {
    return kept;
  }
  return [...kept, next];
};

// Mover a data de início redefine quando a tarefa começa, então as versões
// anteriores deixam de descrever qualquer dia real e são descartadas.
export const restartScheduleAt = ({ effectiveFrom, repeat, time }) => {
  const key = toScheduleKey(effectiveFrom);
  return key ? [createScheduleVersion({ effectiveFrom: key, repeat, time })] : [];
};

// Ponto único que sincroniza o espelho `repeat`/`time` com a versão atual.
export const withScheduleMirror = (task) => {
  if (!task || typeof task !== 'object') {
    return task;
  }
  const schedule = normalizeTaskSchedule(task);
  if (schedule.length === 0) {
    return task;
  }
  const current = schedule[schedule.length - 1];
  return {
    ...task,
    schedule,
    dateKey: schedule[0].effectiveFrom,
    repeat: current.repeat ?? task.repeat ?? null,
    time: current.time ?? task.time ?? null,
  };
};

export const createTaskScheduleMatcher = (
  task,
  { targetDatesAreNormalized = false } = {}
) => {
  if (!task || typeof task !== 'object') {
    return () => false;
  }

  const schedule = normalizeTaskSchedule(task);
  if (schedule.length === 0) {
    return () => false;
  }

  const startDay = normalizeDateValue(schedule[0].effectiveFrom);
  if (!startDay) {
    return () => false;
  }
  const startTime = startDay.getTime();
  // Tarefa arquivada some da agenda a partir da data do arquivamento, mas as
  // ocorrências anteriores (histórico/calendário) continuam valendo.
  const archivedTime = task.archived
    ? normalizeDateValue(task.archivedAt)?.getTime() ?? null
    : null;
  const isQuantum = task.type === 'quantum';

  const compiled = schedule
    .map((version) => {
      const anchorDay = normalizeDateValue(version.effectiveFrom);
      if (!anchorDay) {
        return null;
      }
      return {
        anchorDay,
        anchorTime: anchorDay.getTime(),
        anchorOrdinal: getCalendarDayOrdinal(anchorDay),
        rules: resolveRepeatRules(version.repeat, { isQuantum }),
      };
    })
    .filter(Boolean);
  if (compiled.length === 0) {
    return () => false;
  }
  const onlyVersion = compiled.length === 1 ? compiled[0] : null;

  return (targetDate) => {
    const normalizedTargetDate = targetDatesAreNormalized
      ? targetDate
      : normalizeDateValue(targetDate);
    if (!normalizedTargetDate) {
      return false;
    }
    const targetDay = normalizedTargetDate;
    if (!(targetDay instanceof Date) || Number.isNaN(targetDay.getTime())) {
      return false;
    }

    const targetTime = targetDay.getTime();
    if (targetTime < startTime) {
      return false;
    }
    if (archivedTime != null && targetTime >= archivedTime) {
      return false;
    }

    // Comparação numérica em vez de chave de texto: o caminho quente roda
    // centenas de vezes por tarefa ao montar gráfico e sequência.
    let version = onlyVersion;
    if (!version) {
      for (let index = compiled.length - 1; index >= 0; index -= 1) {
        if (compiled[index].anchorTime <= targetTime) {
          version = compiled[index];
          break;
        }
      }
    }
    if (!version || version.anchorTime > targetTime) {
      return false;
    }

    const { rules, anchorDay } = version;
    if (rules.endTime != null && rules.endTime < targetTime) {
      return false;
    }
    if (targetTime === startTime) {
      return true;
    }
    if (!rules.repeatsAfterStart) {
      // Sem repetição, a versão descreve exatamente um dia: o seu próprio.
      return targetTime === version.anchorTime;
    }

    const targetOrdinal = getCalendarDayOrdinal(targetDay);
    switch (rules.frequency) {
      case 'daily':
      case 'interval': {
        const diffDays = targetOrdinal - version.anchorOrdinal;
        return diffDays % rules.interval === 0;
      }
      case 'weekly': {
        const diffDays = targetOrdinal - version.anchorOrdinal;
        const diffWeeks = Math.floor(diffDays / 7);
        if (diffWeeks % rules.interval !== 0) {
          return false;
        }
        if (rules.allowedWeekdays.length > 0) {
          const targetWeekday = getWeekdayKeyFromDate(targetDay);
          return targetWeekday ? rules.allowedWeekdays.includes(targetWeekday) : false;
        }
        return targetDay.getDay() === anchorDay.getDay();
      }
      case 'monthly': {
        const diffMonths =
          (targetDay.getFullYear() - anchorDay.getFullYear()) * 12 +
          targetDay.getMonth() -
          anchorDay.getMonth();
        if (diffMonths % rules.interval !== 0) {
          return false;
        }
        if (rules.selectedMonthDays.length > 0) {
          return rules.selectedMonthDays.includes(targetDay.getDate());
        }
        return targetDay.getDate() === anchorDay.getDate();
      }
      case 'weekend': {
        const day = targetDay.getDay();
        return day === 0 || day === 6;
      }
      case 'weekdays': {
        const day = targetDay.getDay();
        return day >= 1 && day <= 5;
      }
      default:
        return false;
    }
  };
};

const taskScheduleMatcherCache = new WeakMap();

export const shouldTaskAppearOnDate = (task, targetDate) => {
  if (!task || typeof task !== 'object' || !targetDate) {
    return false;
  }
  let matcher = taskScheduleMatcherCache.get(task);
  if (!matcher) {
    matcher = createTaskScheduleMatcher(task);
    taskScheduleMatcherCache.set(task, matcher);
  }
  return matcher(targetDate);
};
