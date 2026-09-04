// Modelo do editor de tarefas.
//
// Todo o estado do formulário vive num único rascunho imutável. Não existe
// espelho `pending` por campo: os painéis editam o rascunho direto e cancelar
// restaura o snapshot tirado na abertura do painel.
//
// Este módulo é puro (sem React e sem React Native) para que as regras possam
// ser exercitadas por `scripts/test-domain-rules.js` sem renderizar a tela.

import { getWeekdayKeyFromDate, isValidDateRange, normalizeDateValue } from '../utils/dateUtils';
import { getTimerParts } from '../utils/timeUtils';

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const EDITOR_COLORS = ['#FFCF70', '#F7A6A1', '#B39DD6', '#79C3FF', '#A8E6CF', '#FDE2A6'];

// Ícone do hábito: o usuário escolhe uma foto ou o sistema sorteia um emoji
// desta lista curada (temas comuns de hábitos/rotina).
export const CURATED_EMOJIS = [
  '🏃', '🚶', '🏋️', '🤸', '🏊', '🚴', '🧗', '🧘', '⚽', '🏀', '🎾', '🥊',
  '📚', '📖', '📝', '✏️', '🎓', '🧠', '💡', '🧪',
  '💻', '🎧', '🎨', '🎸', '🎹', '🥁', '🎤', '🎬', '🎮',
  '🥗', '🍎', '🥑', '🥕', '🍳', '💧', '☕', '🍵',
  '🛏️', '🌙', '🚿', '🪥', '🧹', '🪴', '🐶', '🐱',
  '☀️', '🌈', '🔥', '⭐', '✨', '🌊', '🌸', '🍀',
  '💰', '🎯', '🏆', '🥇', '💪', '🙏', '❤️', '😊',
];

export const DEFAULT_EMOJI = CURATED_EMOJIS[0];

export const TASK_TYPES = ['default', 'quantum', 'reminder'];
export const QUANTUM_MODES = ['timer', 'count'];
export const QUANTUM_ANIMATIONS = ['default', 'water'];
export const REPEAT_FREQUENCIES = ['daily', 'weekly', 'monthly'];

// Chave -> deslocamento em minutos em relação ao horário da tarefa.
export const REMINDER_OFFSETS = {
  none: null,
  at_time: 0,
  '5m': -5,
  '15m': -15,
  '30m': -30,
  '1h': -60,
};

export const REMINDER_KEYS = Object.keys(REMINDER_OFFSETS);

export const TITLE_MAX_LENGTH = 50;
// Nota livre da tarefa. O limite existe para o campo não virar um diário
// dentro do card: entradas datadas já têm lugar próprio nas reflexões.
export const NOTES_MAX_LENGTH = 500;
export const REPEAT_INTERVAL_MAX = 99;
export const QUANTUM_TIMER_HOURS_MAX = 99;
export const QUANTUM_TIMER_MINUTES_MAX = 59;
export const QUANTUM_COUNT_MAX = 9999;

const DEFAULT_POINT_TIME = { hour: 9, minute: 0, meridiem: 'AM' };
const DEFAULT_PERIOD_TIME = {
  start: { hour: 9, minute: 0, meridiem: 'AM' },
  end: { hour: 10, minute: 0, meridiem: 'AM' },
};

export const pickRandomEmoji = (current = null) => {
  if (CURATED_EMOJIS.length < 2) {
    return CURATED_EMOJIS[0];
  }
  let next = current;
  while (next === current) {
    next = CURATED_EMOJIS[Math.floor(Math.random() * CURATED_EMOJIS.length)];
  }
  return next;
};

const startOfDay = (value) => normalizeDateValue(value) ?? normalizeDateValue(new Date());

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

// Guarda dígitos como texto porque a fonte da verdade é um TextInput: apagar o
// campo inteiro precisa ser representável sem virar 0 na hora.
const digitsOnly = (value, { max, fallback = '' } = {}) => {
  const raw = `${value ?? ''}`.replace(/[^0-9]/g, '');
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return `${typeof max === 'number' ? Math.min(parsed, max) : parsed}`;
};

export const parseDigits = (value) => {
  const parsed = Number.parseInt(`${value ?? ''}`.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeTimeValue = (time) => {
  const rawHour = Number.parseInt(time?.hour, 10);
  const rawMinute = Number.parseInt(time?.minute, 10);
  const hour = Number.isFinite(rawHour) ? rawHour : DEFAULT_POINT_TIME.hour;
  const minute = Number.isFinite(rawMinute) ? rawMinute : DEFAULT_POINT_TIME.minute;
  return {
    // O modelo persistido usa relógio de 12h com meridiem; a exibição em 24h é
    // feita na renderização (pt-BR), não no armazenamento.
    hour: Math.min(12, Math.max(1, hour === 0 ? 12 : hour)),
    minute: Math.min(59, Math.max(0, minute)),
    meridiem: time?.meridiem === 'PM' ? 'PM' : 'AM',
  };
};

export const timeToMinutes = (time) => {
  const { hour, minute, meridiem } = normalizeTimeValue(time);
  const hour24 = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
  return hour24 * 60 + minute;
};

export const minutesToTime = (totalMinutes) => {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, minute, meridiem };
};

// Um período com fim antes do início não é rejeitado: o fim é empurrado para
// depois do início, porque descartar a escolha do usuário no meio do ajuste do
// seletor é mais confuso do que corrigi-la.
export const ensureValidPeriod = (period) => {
  const start = normalizeTimeValue(period?.start ?? DEFAULT_PERIOD_TIME.start);
  const end = normalizeTimeValue(period?.end ?? DEFAULT_PERIOD_TIME.end);
  if (timeToMinutes(end) > timeToMinutes(start)) {
    return { start, end };
  }
  return { start, end: minutesToTime(timeToMinutes(start) + 60) };
};

// O editor trabalha com uma lista de títulos (texto puro): é o que o painel
// desenha e o que `convertSubtasks`, no App, espera receber de volta para
// reconciliar com as subtarefas já gravadas (que são objetos com id e
// histórico). Uma tarefa em edição chega com esses objetos, então a conversão
// para título acontece aqui — antes, os objetos vazavam direto para a tela.
const normalizeSubtasks = (subtasks) => {
  if (!Array.isArray(subtasks)) {
    return [];
  }
  return subtasks
    .map((subtask) => (typeof subtask === 'string' ? subtask : `${subtask?.title ?? ''}`).trim())
    .filter((title) => title.length > 0);
};

// A nota é editada no card de detalhe, não no editor: aqui ela só precisa
// sobreviver ao ciclo tarefa -> rascunho -> tarefa sem ser apagada por uma
// edição que não mexeu nela.
export const normalizeNotes = (value) =>
  `${value ?? ''}`.slice(0, NOTES_MAX_LENGTH).trim();

const sortedUnique = (values) => Array.from(new Set(values)).sort((a, b) => a - b);

const sortedWeekdays = (keys) =>
  WEEKDAY_KEYS.filter((key) => keys.includes(key));

export const createEmptyDraft = ({ today = new Date(), emoji } = {}) => {
  const startDate = startOfDay(today);
  return {
    title: '',
    color: EDITOR_COLORS[0],
    emoji: emoji ?? pickRandomEmoji(),
    customImage: null,
    startDate,
    repeat: {
      enabled: false,
      frequency: 'daily',
      interval: 1,
      weekdays: [getWeekdayKeyFromDate(startDate)],
      monthDays: [startDate.getDate()],
      hasEndDate: false,
      endDate: null,
    },
    time: {
      specified: false,
      mode: 'point',
      point: { ...DEFAULT_POINT_TIME },
      period: {
        start: { ...DEFAULT_PERIOD_TIME.start },
        end: { ...DEFAULT_PERIOD_TIME.end },
      },
    },
    reminder: 'none',
    tag: 'none',
    type: 'default',
    quantum: {
      mode: 'timer',
      animation: 'default',
      timerHours: '0',
      timerMinutes: '0',
      countValue: '1',
      countUnit: '',
    },
    subtasks: [],
    notes: '',
  };
};

// Migração de dados antigos.
//
// Formatos legados ainda chegam aqui porque tarefas gravadas antes destas
// mudanças continuam no dispositivo do usuário:
//   - repetição descrita por `option` ('off' | 'daily' | 'weekly' | 'weekend' |
//     'monthly' | 'custom') em vez de `frequency`/`enabled`;
//   - `quantum.animation` gravado com o typo 'defaut';
//   - timer gravado como `minutes`/`seconds` significando horas/minutos
//     (tratado por `getTimerParts`).
const draftRepeatFromTask = (task, startDate) => {
  const defaults = {
    enabled: false,
    frequency: 'daily',
    interval: 1,
    weekdays: [getWeekdayKeyFromDate(startDate)],
    monthDays: [startDate.getDate()],
    hasEndDate: false,
    endDate: null,
  };
  const repeat = task?.repeat;
  if (!repeat || typeof repeat !== 'object') {
    return defaults;
  }

  const hasModernShape = 'enabled' in repeat || 'frequency' in repeat;
  if (!hasModernShape && repeat.option) {
    const option = repeat.option;
    const frequency =
      option === 'monthly'
        ? 'monthly'
        : option === 'weekly' || option === 'weekend' || option === 'custom'
        ? 'weekly'
        : 'daily';
    let weekdays = defaults.weekdays;
    if (option === 'weekend') {
      weekdays = ['sun', 'sat'];
    } else if (repeat.weekdays?.length) {
      weekdays = sortedWeekdays(repeat.weekdays);
    }
    return { ...defaults, enabled: option !== 'off', frequency, weekdays };
  }

  const frequency = oneOf(repeat.frequency, REPEAT_FREQUENCIES, 'daily');
  const parsedInterval = Number.parseInt(repeat.interval, 10);
  const endDate = repeat.endDate ? normalizeDateValue(repeat.endDate) : null;
  const hasUsableEndDate = Boolean(endDate);

  return {
    enabled: Boolean(repeat.enabled),
    frequency,
    interval:
      Number.isFinite(parsedInterval) && parsedInterval > 0
        ? Math.min(REPEAT_INTERVAL_MAX, parsedInterval)
        : 1,
    weekdays: repeat.weekdays?.length ? sortedWeekdays(repeat.weekdays) : defaults.weekdays,
    monthDays: repeat.monthDays?.length ? sortedUnique(repeat.monthDays) : defaults.monthDays,
    hasEndDate: hasUsableEndDate,
    // Uma data final anterior ao início é dado inconsistente: colapsa no
    // início em vez de manter uma tarefa que nunca apareceria.
    endDate: hasUsableEndDate
      ? (isValidDateRange(startDate, endDate) ? endDate : startDate)
      : null,
  };
};

export const draftFromTask = (task, { today = new Date() } = {}) => {
  const base = createEmptyDraft({ today });
  if (!task || typeof task !== 'object') {
    return base;
  }

  const startDate = startOfDay(task.startDate ?? task.date ?? today);
  const timerParts = getTimerParts(task.quantum?.timer);
  const rawAnimation = task.quantum?.animation === 'defaut' ? 'default' : task.quantum?.animation;

  return {
    ...base,
    title: `${task.title ?? ''}`.slice(0, TITLE_MAX_LENGTH),
    color: task.color ?? base.color,
    emoji: task.emoji ?? DEFAULT_EMOJI,
    customImage: task.customImage ?? null,
    startDate,
    repeat: draftRepeatFromTask(task, startDate),
    time: {
      specified: Boolean(task.time?.specified),
      mode: task.time?.mode === 'period' ? 'period' : 'point',
      point: normalizeTimeValue(task.time?.point ?? DEFAULT_POINT_TIME),
      period: ensureValidPeriod(task.time?.period ?? DEFAULT_PERIOD_TIME),
    },
    reminder: oneOf(task.reminder, REMINDER_KEYS, 'none'),
    tag: task.tag ?? 'none',
    type: oneOf(task.type, TASK_TYPES, 'default'),
    quantum: {
      mode: oneOf(task.quantum?.mode, QUANTUM_MODES, 'timer'),
      animation: oneOf(rawAnimation, QUANTUM_ANIMATIONS, 'default'),
      timerHours: `${timerParts.hours}`,
      timerMinutes: `${timerParts.minutes}`,
      countValue: `${task.quantum?.count?.value ?? 1}`,
      countUnit: `${task.quantum?.count?.unit ?? ''}`,
    },
    subtasks: normalizeSubtasks(task.subtasks),
    notes: `${task.notes ?? ''}`.slice(0, NOTES_MAX_LENGTH),
  };
};

// Payload já normalizado para o App persistir. A tela não devolve campo pela
// metade: quem consome só precisa atribuir id e gravar.
export const draftToTask = (draft, { tagOptions = [] } = {}) => {
  const isQuantum = draft.type === 'quantum';
  const tagOption = tagOptions.find((option) => option.key === draft.tag);

  return {
    title: draft.title.trim(),
    color: draft.color,
    emoji: draft.emoji,
    customImage: draft.customImage ?? null,
    startDate: draft.startDate,
    repeat: {
      enabled: draft.repeat.enabled,
      frequency: draft.repeat.frequency,
      interval: draft.repeat.interval,
      weekdays: [...draft.repeat.weekdays],
      monthDays: [...draft.repeat.monthDays],
      endDate:
        draft.repeat.enabled && draft.repeat.hasEndDate && draft.repeat.endDate
          ? draft.repeat.endDate.toISOString()
          : null,
    },
    time: {
      specified: draft.time.specified,
      mode: draft.time.mode,
      point: draft.time.point,
      period: draft.time.period,
    },
    reminder: draft.reminder,
    tag: draft.tag,
    // Rótulos de tags padrão são resolvidos pelo idioma atual na exibição;
    // persistir o texto traduzido congelaria a tarefa no idioma da criação.
    tagLabel: tagOption?.isCustom ? tagOption.label : undefined,
    type: draft.type,
    quantum: isQuantum
      ? {
          mode: draft.quantum.mode,
          animation: draft.quantum.animation,
          timer: {
            hours: parseDigits(draft.quantum.timerHours),
            minutesPart: parseDigits(draft.quantum.timerMinutes),
          },
          count: {
            value: parseDigits(draft.quantum.countValue),
            unit: draft.quantum.countUnit.trim(),
          },
        }
      : null,
    subtasks: normalizeSubtasks(draft.subtasks),
    notes: normalizeNotes(draft.notes),
  };
};

// Erros por campo, para o formulário destacar a linha certa em vez de abrir um
// alerta genérico que não diz onde está o problema.
export const validateDraft = (draft) => {
  const errors = [];

  if (!draft.title.trim()) {
    errors.push({ field: 'title', code: 'titleRequired' });
  }

  if (draft.reminder !== 'none' && !draft.time.specified) {
    errors.push({ field: 'reminder', code: 'reminderNeedsTime' });
  }

  if (draft.repeat.enabled) {
    if (draft.repeat.frequency === 'weekly' && draft.repeat.weekdays.length === 0) {
      errors.push({ field: 'repeat', code: 'weekdayRequired' });
    }
    if (draft.repeat.frequency === 'monthly' && draft.repeat.monthDays.length === 0) {
      errors.push({ field: 'repeat', code: 'monthDayRequired' });
    }
    if (
      draft.repeat.hasEndDate &&
      (!draft.repeat.endDate || !isValidDateRange(draft.startDate, draft.repeat.endDate))
    ) {
      errors.push({ field: 'repeat', code: 'invalidEndDate' });
    }
  }

  if (draft.type === 'quantum') {
    if (draft.quantum.mode === 'timer') {
      const total = parseDigits(draft.quantum.timerHours) * 60 + parseDigits(draft.quantum.timerMinutes);
      if (total <= 0) {
        errors.push({ field: 'quantum', code: 'invalidTimerTarget' });
      }
    } else if (parseDigits(draft.quantum.countValue) <= 0) {
      errors.push({ field: 'quantum', code: 'invalidCountTarget' });
    }
  }

  return errors;
};

export const getDraftError = (errors, field) => errors.find((error) => error.field === field) ?? null;

// Invariantes que antes viviam espalhadas pelos `handleApply*`: aplicadas num
// lugar só, toda vez que o rascunho muda.
const withInvariants = (draft) => {
  const repeat = { ...draft.repeat };

  if (repeat.frequency === 'weekly' && repeat.weekdays.length === 0) {
    repeat.weekdays = [getWeekdayKeyFromDate(draft.startDate)];
  }
  if (repeat.frequency === 'monthly' && repeat.monthDays.length === 0) {
    repeat.monthDays = [draft.startDate.getDate()];
  }
  if (repeat.hasEndDate && repeat.endDate && !isValidDateRange(draft.startDate, repeat.endDate)) {
    repeat.endDate = draft.startDate;
  }
  if (!repeat.hasEndDate) {
    repeat.endDate = null;
  }

  // A configuração quantum continua no rascunho mesmo em outros tipos: é
  // estado de edição, e apagá-la ao trocar de tipo perderia o que o usuário
  // acabou de digitar se ele voltar atrás. `draftToTask` é que decide não
  // persistir quantum fora do tipo 'quantum'.
  //
  // Lembrete sem horário também não é corrigido aqui: `validateDraft` marca o
  // campo e o formulário mostra o erro na linha, o que explica o problema em
  // vez de desfazer a escolha em silêncio.
  return { ...draft, repeat };
};

export const taskDraftReducer = (draft, action) => {
  switch (action.type) {
    case 'hydrate':
      return withInvariants(action.draft);

    case 'patch':
      return withInvariants({ ...draft, ...action.value });

    case 'setTitle':
      return { ...draft, title: `${action.value ?? ''}`.slice(0, TITLE_MAX_LENGTH) };

    case 'setStartDate': {
      const startDate = startOfDay(action.value);
      return withInvariants({ ...draft, startDate });
    }

    case 'patchRepeat': {
      const value = { ...action.value };
      if ('interval' in value) {
        const parsed = Number.parseInt(value.interval, 10);
        value.interval = Number.isFinite(parsed)
          ? Math.min(REPEAT_INTERVAL_MAX, Math.max(1, parsed))
          : 1;
      }
      if ('endDate' in value && value.endDate) {
        value.endDate = startOfDay(value.endDate);
      }
      return withInvariants({ ...draft, repeat: { ...draft.repeat, ...value } });
    }

    case 'toggleWeekday': {
      const has = draft.repeat.weekdays.includes(action.value);
      const weekdays = has
        ? draft.repeat.weekdays.filter((key) => key !== action.value)
        : sortedWeekdays([...draft.repeat.weekdays, action.value]);
      // Sem invariantes: esvaziar a lista é um estado intermediário legítimo
      // enquanto o usuário troca de dia, e `validateDraft` cobre o resto.
      return { ...draft, repeat: { ...draft.repeat, weekdays } };
    }

    case 'toggleMonthDay': {
      const has = draft.repeat.monthDays.includes(action.value);
      const monthDays = has
        ? draft.repeat.monthDays.filter((day) => day !== action.value)
        : sortedUnique([...draft.repeat.monthDays, action.value]);
      return { ...draft, repeat: { ...draft.repeat, monthDays } };
    }

    case 'patchTime': {
      const time = { ...draft.time, ...action.value };
      if (action.value?.point) {
        time.point = normalizeTimeValue(action.value.point);
      }
      if (action.value?.period) {
        time.period = ensureValidPeriod(action.value.period);
      }
      return withInvariants({ ...draft, time });
    }

    case 'patchQuantum': {
      const value = { ...action.value };
      if ('timerHours' in value) {
        value.timerHours = digitsOnly(value.timerHours, { max: QUANTUM_TIMER_HOURS_MAX });
      }
      if ('timerMinutes' in value) {
        value.timerMinutes = digitsOnly(value.timerMinutes, { max: QUANTUM_TIMER_MINUTES_MAX });
      }
      if ('countValue' in value) {
        value.countValue = digitsOnly(value.countValue, { max: QUANTUM_COUNT_MAX });
      }
      return { ...draft, quantum: { ...draft.quantum, ...value } };
    }

    case 'setSubtasks': {
      // O painel de subtarefas atualiza por função (`onChange(prev => ...)`),
      // como um setState.
      const next =
        typeof action.value === 'function' ? action.value(draft.subtasks) : action.value;
      return { ...draft, subtasks: Array.isArray(next) ? next : draft.subtasks };
    }

    default:
      return draft;
  }
};
