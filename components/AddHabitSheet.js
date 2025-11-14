import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const SHEET_OPEN_DURATION = 300;
const SHEET_CLOSE_DURATION = 220;
const BACKDROP_MAX_OPACITY = 0.5;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

const COLORS = ['#FFCF70', '#F7A6A1', '#B39DD6', '#79C3FF', '#A8E6CF', '#FDE2A6'];
const EMOJIS = [
  // carinhas & emoções
  '😀','😁','😂','🤣','😊','🙂','🙃','😉','😍','🥰','😘','😗','😙','😚','🤗','🤩','🤔','🤨','😐','😑','😶',
  '😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','🙄','😓','😔','😕','☹️','🙁',
  '😖','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤒','🤕','🤢','🤮','🤧',
  '😇','🤠','🥳','😎','🤓','🫠','🥸','🤡','💀','👻','👽','🤖','💩',

  // gestos & mãos
  '👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👊','👏','🙌','👐','🤲','🙏','🫶','🤝','👋','✋','🖐️',
  '👉','👈','☝️','👇','👆','🫵','✍️',

  // pessoas/atividades físicas & bem-estar
  '🏃‍♂️','🏃‍♀️','🚶‍♂️','🚶‍♀️','🏋️‍♂️','🏋️‍♀️','🤸‍♂️','🤸‍♀️','🏊‍♂️','🏊‍♀️','🚴‍♂️','🚴‍♀️','🧗‍♂️','🧗‍♀️','🧘‍♂️','🧘‍♀️','🤾‍♂️','🤾‍♀️',
  '⛹️‍♂️','⛹️‍♀️','🤺','🤼‍♂️','🤼‍♀️','🤽‍♂️','🤽‍♀️','🚵‍♂️','🚵‍♀️','🧎‍♂️','🧎‍♀️','🧍‍♂️','🧍‍♀️',

  // natureza, clima, dia/noite
  '☀️','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','🌈','🌪️','🌫️','💨',
  '🌙','🌛','🌟','✨','💫','⚡','🔥','💧','💦','🌊',
  '🌱','🌿','🍃','🌵','🌷','🌼','🌻','🌸','💐','🍁','🍂','🍀',

  // comida & bebida (sem álcool)
  '🍎','🍏','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🍍','🥭','🥝','🥑','🍅','🥕','🌽','🥦','🥒','🧄','🧅',
  '🍞','🥐','🥖','🥨','🥯','🧇','🥞','🧀','🍳','🥚','🥗','🥙','🌯','🌮','🍔','🍟','🍕','🍝','🍜','🍣','🍱','🥟','🥠','🍲',
  '🍚','🍛','🍥','🍡','🍢','🍘','🍙','🍿','🍫','🍪','🍩','🧁','🎂','🍰','🍦','🍨','🍧','🍯','🍮','🍵','☕','🧋','🥤','🧃','🧉','💧','🚰',

  // objetos úteis para tarefas/hábitos
  '⏰','⏱️','⏲️','🕰️','🗓️','📅','📆','📋','🗒️','📝','📖','📚','📘','📙','📗','📓','📔',
  '🧠','💡','🔋','🔌','🔋','🪫','🔧','🛠️','🧰','🧪','🔬','⚖️','🧯','🧹','🪣','🧼','🪥','🪒','🚿','🛁',
  '💻','🖥️','⌨️','🖱️','📱','📲','🎧','📷','🎥','🎙️','📎','📌','📍','🔖','🔗','🔒','🔓','🔑','🗝️','🔔','🔕',

  // casa/locais & transporte
  '🏠','🏡','🏢','🏫','🏥','🏬','🏪','🏖️','🏕️','⛰️','🏞️','🌋','🏜️',
  '🚗','🚕','🚙','🚌','🚎','🚑','🚒','🚓','🚚','🚲','🛵','🏍️','🚆','🚄','✈️','🛫','🛬','🚀','⛵','🚤','🚢',

  // hobbies & diversão
  '🎨','🖌️','🧵','🧶','🎸','🎹','🥁','🎻','🎤','🎮','🎲','♟️','🧩','📷','🎞️','🎬','🎯','🎳','🏸','🥊','🥋',

  // animais (amostra ampla)
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
  '🐔','🐧','🦆','🦅','🦉','🦇','🐢','🐍','🦎','🐙','🪼','🐠','🐟','🐡','🐬','🦈','🐳','🐋',
  '🐝','🦋','🐞','🪲','🐜','🪳','🪰','🕷️','🕸️',

  // símbolos & status
  '✅','☑️','✔️','❌','✖️','⭕','❗','❕','⁉️','❓','❔',
  '🔴','🟠','🟡','🟢','🔵','🟣','⚪','⚫','⬜','⬛','🔺','🔻','🔸','🔹',
  '⭐','🌟','✨','💫','🎯','🏆','🎖️','🥇','🥈','🥉',
  '💬','🗨️','🗯️','🔊','🔇','📣','📢','📶',
  '💰','💸','💳','💵','💶','💷','💴','💹',

  // saúde & autocuidado
  '💊','💉','🩹','🩺','🧼','🪥','🧴','🛌','🧘','🫁','🫀','🧬',

  // os que você já tinha
  '🌟','🔥','💪','🧘','📚','🥗','🛏️','🚰','🎯','📝'
];
const DEFAULT_EMOJI = EMOJIS[0];

const WEEKDAYS = [
  { key: 'sun', label: 'S' },
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
];
const WEEKDAY_KEYS = WEEKDAYS.map((weekday) => weekday.key);
const WEEKDAY_SHORT_NAMES = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

const REMINDER_OPTIONS = [
  { key: 'none', label: 'No reminder' },
  { key: 'at_time', label: 'At time of event', offsetMinutes: 0 },
  { key: '5m', label: '5 minutes early', offsetMinutes: -5 },
  { key: '15m', label: '15 minutes early', offsetMinutes: -15 },
  { key: '30m', label: '30 minutes early', offsetMinutes: -30 },
  { key: '1h', label: '1 hour early', offsetMinutes: -60 },
];

const DEFAULT_TAG_OPTIONS = [
  { key: 'none', label: 'No tag' },
  { key: 'clean_room', label: 'Clean Room' },
  { key: 'healthy_lifestyle', label: 'Healthy Lifestyle' },
  { key: 'morning_routine', label: 'Morning Routine' },
  { key: 'relationship', label: 'Relationship' },
  { key: 'sleep_better', label: 'Sleep Better' },
  { key: 'workout', label: 'Workout' },
];

const createTagKey = (label, existingKeys) => {
  const sanitized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  const base = sanitized || 'tag';
  let candidate = base;
  let suffix = 1;
  while (existingKeys.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const HOUR_VALUES = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTE_VALUES = Array.from({ length: 60 }, (_, i) => i);
const MERIDIEM_VALUES = ['AM', 'PM'];

const formatNumber = (value) => value.toString().padStart(2, '0');

const hexToRgb = (hex) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
};

const lightenColor = (hex, amount = 0.6) => {
  const { r, g, b } = hexToRgb(hex);
  const mixChannel = (channel) => Math.round(channel + (255 - channel) * amount);
  const mixed = [mixChannel(r), mixChannel(g), mixChannel(b)];
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const formatOrdinal = (day) => {
  const remainder = day % 10;
  const tens = Math.floor(day / 10) % 10;
  if (tens === 1) {
    return `${day}th`;
  }
  if (remainder === 1) {
    return `${day}st`;
  }
  if (remainder === 2) {
    return `${day}nd`;
  }
  if (remainder === 3) {
    return `${day}rd`;
  }
  return `${day}th`;
};

const getWeekdayKeyFromDate = (date) => WEEKDAY_KEYS[date.getDay()];

function formatTime({ hour, minute, meridiem }) {
  return `${formatNumber(hour)}:${formatNumber(minute)} ${meridiem}`;
}

function formatPeriod({ start, end }) {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatDateLabel(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

function getRepeatLabel(option, weekdays, startDate) {
  switch (option) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return startDate
        ? `Every week on ${startDate.toLocaleDateString(undefined, { weekday: 'long' })}`
        : 'Weekly';
    case 'monthly':
      return startDate ? `Every month on ${formatOrdinal(startDate.getDate())}` : 'Monthly';
    case 'weekend':
      return 'Every weekend';
    case 'custom': {
      const selected = WEEKDAYS.filter(({ key }) => weekdays.has(key));
      if (!selected.length) {
        return 'Custom';
      }
      return selected.map((weekday) => WEEKDAY_SHORT_NAMES[weekday.key] || weekday.label).join(', ');
    }
    case 'off':
    default:
      return 'No repeat';
  }
}

function doesDateRepeat(date, start, repeatOption, weekdays) {
  if (!start || isBeforeDay(date, start)) {
    return false;
  }

  switch (repeatOption) {
    case 'daily':
      return true;
    case 'weekly':
      return date.getDay() === start.getDay();
    case 'monthly':
      return date.getDate() === start.getDate();
    case 'weekend':
      return date.getDay() === 0 || date.getDay() === 6;
    case 'custom':
      return weekdays?.has(getWeekdayKeyFromDate(date));
    default:
      return false;
  }
}

function getMonthMetadata(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = lastDay.getDate();
  const startWeekday = firstDay.getDay();
  return {
    year,
    month,
    days,
    startWeekday,
  };
}

function addMonths(date, offset) {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + offset);
  return result;
}

function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function normalizeDate(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isBeforeDay(dateA, dateB) {
  return normalizeDate(dateA).getTime() < normalizeDate(dateB).getTime();
}

function timeToMinutes({ hour, minute, meridiem }) {
  const normalizedHour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
  return normalizedHour * 60 + minute;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return { hour: hour12, minute, meridiem };
}

function normalizeTimeValue(time) {
  if (!time) {
    return time;
  }
  return minutesToTime(timeToMinutes(time));
}

function ensureValidPeriod(period, { allowFlipEndMeridiem = false } = {}) {
  const normalizedStart = normalizeTimeValue(period.start);
  let normalizedEnd = normalizeTimeValue(period.end);

  const startMinutes = timeToMinutes(normalizedStart);
  let endMinutes = timeToMinutes(normalizedEnd);

  if (allowFlipEndMeridiem && endMinutes < startMinutes) {
    const flippedMeridiem = normalizedEnd.meridiem === 'AM' ? 'PM' : 'AM';
    const flippedEnd = { ...normalizedEnd, meridiem: flippedMeridiem };
    const flippedMinutes = timeToMinutes(flippedEnd);
    if (flippedMinutes >= startMinutes) {
      normalizedEnd = flippedEnd;
      endMinutes = flippedMinutes;
    }
  }

  if (endMinutes < startMinutes) {
    normalizedEnd = { ...normalizedStart };
    endMinutes = startMinutes;
  }

  return {
    start: minutesToTime(startMinutes),
    end: minutesToTime(endMinutes),
  };
}

function getReminderReferenceTime(hasSpecifiedTime, timeMode, pointTime, periodTime) {
  if (!hasSpecifiedTime) {
    return null;
  }
  if (timeMode === 'period') {
    return periodTime.start;
  }
  return pointTime;
}

function getReminderHint(option, hasSpecifiedTime, timeMode, pointTime, periodTime) {
  if (option.key === 'none') {
    return null;
  }
  const reference = getReminderReferenceTime(hasSpecifiedTime, timeMode, pointTime, periodTime);
  if (!reference || typeof option.offsetMinutes !== 'number') {
    return 'No time set';
  }
  const baseMinutes = timeToMinutes(reference);
  const reminderMinutes = baseMinutes + option.offsetMinutes;
  const reminderTime = minutesToTime(reminderMinutes);
  return formatTime(reminderTime);
}

export default function AddHabitSheet({
  visible,
  onClose,
  onCreate,
  onUpdate,
  mode = 'create',
  initialHabit,
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = useMemo(() => {
    const usableHeight = height - insets.top - insets.bottom;
    return Math.min(usableHeight * 0.92, usableHeight - 24);
  }, [height, insets.bottom, insets.top]);
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedEmoji, setSelectedEmoji] = useState(DEFAULT_EMOJI);
  const [isEmojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(visible);
  const [activePanel, setActivePanel] = useState(null);
  const [startDate, setStartDate] = useState(() => normalizeDate(new Date()));
  const [repeatOption, setRepeatOption] = useState('off');
  const [selectedWeekdays, setSelectedWeekdays] = useState(() => new Set(['mon', 'tue', 'wed', 'thu', 'fri']));
  const [hasSpecifiedTime, setHasSpecifiedTime] = useState(false);
  const [timeMode, setTimeMode] = useState('point');
  const [pointTime, setPointTime] = useState({ hour: 9, minute: 0, meridiem: 'AM' });
  const [periodTime, setPeriodTime] = useState({
    start: { hour: 9, minute: 0, meridiem: 'AM' },
    end: { hour: 10, minute: 0, meridiem: 'AM' },
  });
  const [reminderOption, setReminderOption] = useState('none');
  const [tagOptions, setTagOptions] = useState(() => [...DEFAULT_TAG_OPTIONS]);
  const [selectedTag, setSelectedTag] = useState('none');
  const [subtasks, setSubtasks] = useState([]);

  const [calendarMonth, setCalendarMonth] = useState(() => new Date(startDate.getFullYear(), startDate.getMonth(), 1));
  const [pendingDate, setPendingDate] = useState(startDate);
  const [pendingRepeatOption, setPendingRepeatOption] = useState(repeatOption);
  const [pendingWeekdays, setPendingWeekdays] = useState(() => new Set(selectedWeekdays));
  const [pendingHasSpecifiedTime, setPendingHasSpecifiedTime] = useState(hasSpecifiedTime);
  const [pendingTimeMode, setPendingTimeMode] = useState(timeMode);
  const [pendingPointTime, setPendingPointTime] = useState(pointTime);
  const [pendingPeriodTime, setPendingPeriodTime] = useState(periodTime);
  const [pendingReminder, setPendingReminder] = useState(reminderOption);
  const [pendingTag, setPendingTag] = useState(selectedTag);
  const [pendingSubtasks, setPendingSubtasks] = useState([]);
  const titleInputRef = useRef(null);
  const translateY = useRef(new Animated.Value(sheetHeight || height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const sheetBackgroundColor = useMemo(() => lightenColor(selectedColor, 0.75), [selectedColor]);
  const isEditMode = mode === 'edit';
  const isCopyMode = mode === 'copy';
  const submitLabel = isEditMode ? 'Save' : 'Create';
  const accessibilityAnnouncement = isEditMode
    ? 'Edit habit'
    : isCopyMode
    ? 'Duplicate habit'
    : 'Create habit';
  const closeSheetAccessibilityLabel = isEditMode
    ? 'Close edit habit'
    : isCopyMode
    ? 'Close duplicate habit'
    : 'Close create habit';

  const handlePendingPointTimeChange = useCallback((next) => {
    setPendingPointTime((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      return normalizeTimeValue(resolved);
    });
  }, []);

  const handlePendingPeriodTimeChange = useCallback((updater) => {
    setPendingPeriodTime((prev) => {
      const resolved = typeof updater === 'function' ? updater(prev) : updater;
      const hasStartUpdate = resolved?.start != null;
      const hasEndUpdate = resolved?.end != null;
      const nextStart = hasStartUpdate ? normalizeTimeValue(resolved.start) : prev.start;
      const nextEnd = hasEndUpdate ? normalizeTimeValue(resolved.end) : prev.end;

      return ensureValidPeriod(
        {
          start: nextStart,
          end: nextEnd,
        },
        {
          allowFlipEndMeridiem: hasEndUpdate && !hasStartUpdate,
        }
      );
    });
  }, []);

  const handleClose = useCallback(() => {
    if (!visible) {
      return;
    }
    setEmojiPickerVisible(false);
    onClose?.();
  }, [onClose, visible]);

  const handleSelectEmoji = useCallback((emoji) => {
    setSelectedEmoji(emoji);
    setEmojiPickerVisible(false);
  }, []);

  const handleToggleEmojiPicker = useCallback(() => {
    setEmojiPickerVisible((prev) => !prev);
  }, []);

  const handleOpenPanel = useCallback(
    (panel) => {
      setActivePanel(panel);
      if (panel === 'date') {
        setCalendarMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
        setPendingDate(new Date(startDate));
      } else if (panel === 'repeat') {
        setPendingRepeatOption(repeatOption);
        setPendingWeekdays(new Set(selectedWeekdays));
      } else if (panel === 'time') {
        setPendingHasSpecifiedTime(hasSpecifiedTime);
        setPendingTimeMode(timeMode);
        handlePendingPointTimeChange({ ...pointTime });
        handlePendingPeriodTimeChange({
          start: { ...periodTime.start },
          end: { ...periodTime.end },
        });
      } else if (panel === 'reminder') {
        setPendingReminder(reminderOption);
      } else if (panel === 'tag') {
        setPendingTag(selectedTag);
      } else if (panel === 'subtasks') {
        setPendingSubtasks(subtasks);
      }
    },
    [
      handlePendingPeriodTimeChange,
      handlePendingPointTimeChange,
      hasSpecifiedTime,
      subtasks,
      periodTime,
      pointTime,
      reminderOption,
      repeatOption,
      selectedTag,
      selectedWeekdays,
      startDate,
      timeMode,
    ]
  );

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const handleApplyDate = useCallback(() => {
    setStartDate(pendingDate);
    if (repeatOption === 'weekly') {
      setSelectedWeekdays(new Set([getWeekdayKeyFromDate(pendingDate)]));
    }
    closePanel();
  }, [closePanel, pendingDate, repeatOption]);

  const handleApplyRepeat = useCallback(() => {
    setRepeatOption(pendingRepeatOption);
    let resolvedWeekdays;
    if (pendingRepeatOption === 'daily') {
      resolvedWeekdays = new Set(WEEKDAYS.map((weekday) => weekday.key));
    } else if (pendingRepeatOption === 'weekend') {
      resolvedWeekdays = new Set(['sat', 'sun']);
    } else if (pendingRepeatOption === 'weekly') {
      resolvedWeekdays = new Set([getWeekdayKeyFromDate(startDate)]);
    } else if (pendingRepeatOption === 'off' || pendingRepeatOption === 'monthly') {
      resolvedWeekdays = new Set();
    } else {
      const next = new Set(pendingWeekdays);
      if (next.size === 0) {
        next.add(getWeekdayKeyFromDate(startDate));
      }
      resolvedWeekdays = next;
    }
    setSelectedWeekdays(resolvedWeekdays);
    closePanel();
  }, [closePanel, pendingRepeatOption, pendingWeekdays, startDate]);

  const handleApplyTime = useCallback(() => {
    setHasSpecifiedTime(pendingHasSpecifiedTime);
    setTimeMode(pendingTimeMode);
    const normalizedPoint = normalizeTimeValue(pendingPointTime);
    const normalizedPeriod = ensureValidPeriod(pendingPeriodTime, { allowFlipEndMeridiem: true });
    setPointTime(normalizedPoint);
    setPeriodTime(normalizedPeriod);
    setPendingPointTime(normalizedPoint);
    setPendingPeriodTime(normalizedPeriod);
    closePanel();
  }, [
    closePanel,
    pendingHasSpecifiedTime,
    pendingPeriodTime,
    pendingPointTime,
    pendingTimeMode,
  ]);

  const handleApplyReminder = useCallback(() => {
    setReminderOption(pendingReminder);
    closePanel();
  }, [closePanel, pendingReminder]);

  const handleApplyTag = useCallback(() => {
    setSelectedTag(pendingTag);
    closePanel();
  }, [closePanel, pendingTag]);

  const handleCreateCustomTag = useCallback(
    (label) => {
      const trimmed = label.trim();
      if (!trimmed) {
        return { key: null, created: false };
      }
      let outcome = { key: null, created: false };
      setTagOptions((prev) => {
        const normalized = trimmed.toLowerCase();
        const existing = prev.find((option) => option.label.toLowerCase() === normalized);
        if (existing) {
          setPendingTag(existing.key);
          outcome = { key: existing.key, created: false };
          return prev;
        }
        const existingKeys = new Set(prev.map((option) => option.key));
        const key = createTagKey(trimmed, existingKeys);
        const nextOption = [...prev, { key, label: trimmed }];
        setPendingTag(key);
        outcome = { key, created: true };
        return nextOption;
      });
      return outcome;
    },
    [setPendingTag, setTagOptions]
  );

  useEffect(() => {
    if (!visible || !initialHabit) {
      return;
    }

    const resolvedStartDate = normalizeDate(
      initialHabit.startDate ? new Date(initialHabit.startDate) : new Date()
    );
    const resolvedRepeatOption = initialHabit.repeat?.option ?? 'off';
    const resolvedWeekdays = new Set(
      initialHabit.repeat?.weekdays && initialHabit.repeat.weekdays.length > 0
        ? initialHabit.repeat.weekdays
        : ['mon', 'tue', 'wed', 'thu', 'fri']
    );
    const resolvedHasSpecifiedTime = initialHabit.time?.specified ?? false;
    const resolvedTimeMode = initialHabit.time?.mode ?? 'point';
    const defaultPoint = { hour: 9, minute: 0, meridiem: 'AM' };
    const defaultPeriod = {
      start: { hour: 9, minute: 0, meridiem: 'AM' },
      end: { hour: 10, minute: 0, meridiem: 'AM' },
    };
    const resolvedPoint = normalizeTimeValue(initialHabit.time?.point ?? defaultPoint);
    const resolvedPeriod = initialHabit.time?.period
      ? {
          start: normalizeTimeValue(initialHabit.time.period.start ?? defaultPeriod.start),
          end: normalizeTimeValue(initialHabit.time.period.end ?? defaultPeriod.end),
        }
      : {
          start: normalizeTimeValue(defaultPeriod.start),
          end: normalizeTimeValue(defaultPeriod.end),
        };
    const resolvedReminder = initialHabit.reminder ?? 'none';
    const resolvedTagKey = initialHabit.tag ?? 'none';
    const resolvedSubtasks = Array.isArray(initialHabit.subtasks) ? initialHabit.subtasks : [];

    setTitle(initialHabit.title ?? '');
    setSelectedColor(initialHabit.color ?? COLORS[0]);
    setSelectedEmoji(initialHabit.emoji ?? DEFAULT_EMOJI);
    setStartDate(resolvedStartDate);
    setRepeatOption(resolvedRepeatOption);
    setSelectedWeekdays(new Set(resolvedWeekdays));
    setHasSpecifiedTime(resolvedHasSpecifiedTime);
    setTimeMode(resolvedTimeMode);
    setPointTime(resolvedPoint);
    setPeriodTime(resolvedPeriod);
    setReminderOption(resolvedReminder);
    setSelectedTag(resolvedTagKey);
    setPendingTag(resolvedTagKey);
    setSubtasks(resolvedSubtasks);

    setCalendarMonth(new Date(resolvedStartDate.getFullYear(), resolvedStartDate.getMonth(), 1));
    setPendingDate(resolvedStartDate);
    setPendingRepeatOption(resolvedRepeatOption);
    setPendingWeekdays(new Set(resolvedWeekdays));
    setPendingHasSpecifiedTime(resolvedHasSpecifiedTime);
    setPendingTimeMode(resolvedTimeMode);
    setPendingPointTime(resolvedPoint);
    setPendingPeriodTime(resolvedPeriod);
    setPendingReminder(resolvedReminder);
    setPendingSubtasks(resolvedSubtasks);

    if (initialHabit.tag && initialHabit.tagLabel) {
      setTagOptions((prev) => {
        if (prev.some((option) => option.key === initialHabit.tag)) {
          return prev;
        }
        return [...prev, { key: initialHabit.tag, label: initialHabit.tagLabel }];
      });
    }
  }, [initialHabit, visible]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      isClosingRef.current = false;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: BACKDROP_MAX_OPACITY,
          duration: SHEET_OPEN_DURATION,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 220,
          mass: 0.9,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(() => {
        titleInputRef.current?.focus();
      });
      AccessibilityInfo.announceForAccessibility(accessibilityAnnouncement);
    } else if (isMounted) {
      isClosingRef.current = true;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: SHEET_CLOSE_DURATION,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(translateY, {
          toValue: sheetHeight || height,
          duration: SHEET_CLOSE_DURATION,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(() => {
        if (isClosingRef.current) {
          setIsMounted(false);
          translateY.setValue(sheetHeight || height);
          setTitle('');
          setSelectedColor(COLORS[0]);
          setSelectedEmoji(DEFAULT_EMOJI);
          setEmojiPickerVisible(false);
          setActivePanel(null);
          setStartDate(normalizeDate(new Date()));
          setRepeatOption('off');
          setSelectedWeekdays(new Set(['mon', 'tue', 'wed', 'thu', 'fri']));
          setHasSpecifiedTime(false);
          setTimeMode('point');
          setPointTime({ hour: 9, minute: 0, meridiem: 'AM' });
          setPeriodTime({
            start: { hour: 9, minute: 0, meridiem: 'AM' },
            end: { hour: 10, minute: 0, meridiem: 'AM' },
          });
          setReminderOption('none');
          setSelectedTag('none');
          setTagOptions([...DEFAULT_TAG_OPTIONS]);
          setPendingTag('none');
          setSubtasks([]);
        }
      });
    }
  }, [
    accessibilityAnnouncement,
    backdropOpacity,
    height,
    isMounted,
    sheetHeight,
    translateY,
    visible,
  ]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const onHardwareBack = () => {
      if (activePanel) {
        closePanel();
      } else {
        handleClose();
      }
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);

    return () => {
      subscription.remove();
    };
  }, [activePanel, closePanel, handleClose, visible]);

  useEffect(() => {
    if (!isMounted) {
      translateY.setValue(sheetHeight || height);
    }
  }, [height, isMounted, sheetHeight, translateY]);

  const handleSubmit = useCallback(() => {
    if (!title.trim()) {
      return;
    }
    const selectedTagOption =
      tagOptions.find((option) => option.key === selectedTag) ?? tagOptions[0];
    const payload = {
      title: title.trim(),
      color: selectedColor,
      emoji: selectedEmoji,
      startDate,
      repeat: { option: repeatOption, weekdays: Array.from(selectedWeekdays) },
      time: {
        specified: hasSpecifiedTime,
        mode: timeMode,
        point: pointTime,
        period: periodTime,
      },
      reminder: reminderOption,
      tag: selectedTagOption.key,
      tagLabel: selectedTagOption.label,
      subtasks,
    };
    if (isEditMode) {
      onUpdate?.(payload);
    } else {
      onCreate?.(payload);
    }
    handleClose();
  }, [
    isEditMode,
    handleClose,
    hasSpecifiedTime,
    onCreate,
    onUpdate,
    periodTime,
    pointTime,
    repeatOption,
    selectedColor,
    selectedEmoji,
    selectedTag,
    selectedWeekdays,
    startDate,
    timeMode,
    title,
    reminderOption,
    subtasks,
    tagOptions,
  ]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          visible &&
          !activePanel &&
          gestureState.dy > 14 &&
          Math.abs(gestureState.dx) < 8,
        onPanResponderMove: (_, gestureState) => {
          if (!visible) {
            return;
          }
          const offset = Math.max(0, gestureState.dy);
          translateY.setValue(offset);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!visible) {
            return;
          }
          const shouldClose = gestureState.vy > 1.2 || gestureState.dy > sheetHeight * 0.25;
          if (shouldClose) {
            handleClose();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.9,
              useNativeDriver: USE_NATIVE_DRIVER,
            }).start();
          }
        },
        onPanResponderTerminate: (_, gestureState) => {
          if (!visible) {
            return;
          }
          const shouldClose = gestureState.vy > 1.2 || gestureState.dy > sheetHeight * 0.25;
          if (shouldClose) {
            handleClose();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.9,
              useNativeDriver: USE_NATIVE_DRIVER,
            }).start();
          }
        },
      }),
    [activePanel, handleClose, sheetHeight, translateY, visible]
  );

  const isSubmitDisabled = !title.trim();

  const dateLabel = useMemo(() => formatDateLabel(startDate), [startDate]);
  const repeatLabel = useMemo(
    () => getRepeatLabel(repeatOption, selectedWeekdays, startDate),
    [repeatOption, selectedWeekdays, startDate]
  );
  const normalizedPointTime = useMemo(() => normalizeTimeValue(pointTime), [pointTime]);
  const normalizedPeriodTime = useMemo(
    () => ensureValidPeriod(periodTime, { allowFlipEndMeridiem: true }),
    [periodTime]
  );
  const normalizedPendingPointTime = useMemo(
    () => normalizeTimeValue(pendingPointTime),
    [pendingPointTime]
  );
  const normalizedPendingPeriodTime = useMemo(
    () => ensureValidPeriod(pendingPeriodTime, { allowFlipEndMeridiem: true }),
    [pendingPeriodTime]
  );

  const timeValue = useMemo(() => {
    if (!hasSpecifiedTime) {
      return 'Anytime';
    }
    if (timeMode === 'point') {
      return formatTime(normalizedPointTime);
    }
    return formatPeriod(normalizedPeriodTime);
  }, [hasSpecifiedTime, normalizedPeriodTime, normalizedPointTime, timeMode]);
  const reminderOptions = useMemo(
    () =>
      REMINDER_OPTIONS.map((option) => ({
        ...option,
        hint: getReminderHint(option, hasSpecifiedTime, timeMode, pointTime, periodTime),
      })),
    [hasSpecifiedTime, periodTime, pointTime, timeMode]
  );
  const reminderLabel = useMemo(() => {
    const match = reminderOptions.find((option) => option.key === reminderOption);
    if (!match || match.key === 'none') {
      return 'No reminder';
    }
    return match.hint ?? 'No time set';
  }, [reminderOption, reminderOptions]);
  const tagLabel = useMemo(() => {
    const match = tagOptions.find((option) => option.key === selectedTag);
    return match?.label ?? 'No tag';
  }, [selectedTag, tagOptions]);

  const pendingTimeTitle = useMemo(() => {
    if (!pendingHasSpecifiedTime) {
      return 'Do it any time of the day';
    }
    if (pendingTimeMode === 'period') {
      const startLabel = formatTime(normalizedPendingPeriodTime.start);
      const endLabel = formatTime(normalizedPendingPeriodTime.end);
      return `Do it from ${startLabel} to ${endLabel} of the day`;
    }
    return `Do it at ${formatTime(normalizedPendingPointTime)} of the day`;
  }, [
    normalizedPendingPeriodTime,
    normalizedPendingPointTime,
    pendingHasSpecifiedTime,
    pendingTimeMode,
  ]);

  if (!isMounted) {
    return null;
  }

  return (
    <View pointerEvents={isMounted ? 'auto' : 'none'} style={styles.container}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        accessibilityRole="button"
        accessibilityLabel={closeSheetAccessibilityLabel}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [{ translateY }],
            height: sheetHeight,
            backgroundColor: sheetBackgroundColor,
          },
        ]}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        {...(!activePanel ? panResponder.panHandlers : {})}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled
        >
          <SafeAreaView style={[styles.safeArea, { backgroundColor: sheetBackgroundColor }]}>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={handleClose}
                hitSlop={16}
              >
                <Ionicons name="close" size={26} color="#6f7a86" />
              </Pressable>
              <Pressable
                style={[styles.createButton, isSubmitDisabled && styles.createButtonDisabled]}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSubmitDisabled }}
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                hitSlop={12}
              >
                <Text
                  style={[styles.createButtonText, isSubmitDisabled && styles.createButtonTextDisabled]}
                >
                  {submitLabel}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollViewContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={[styles.emojiButton, isEmojiPickerVisible && styles.emojiButtonActive]}
                accessibilityRole="button"
                accessibilityLabel={`Choose emoji, currently ${selectedEmoji}`}
                accessibilityHint="Opens a list of emoji options"
                onPress={handleToggleEmojiPicker}
                hitSlop={12}
              >
                <Text style={styles.emoji}>{selectedEmoji}</Text>
                <Ionicons
                  name={isEmojiPickerVisible ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#6f7a86"
                  style={styles.emojiChevron}
                />
              </Pressable>
              {isEmojiPickerVisible && (
                <View style={styles.emojiPicker}>
                  {EMOJIS.map((emoji) => {
                    const isSelected = selectedEmoji === emoji;
                    return (
                      <Pressable
                        key={emoji}
                        style={[styles.emojiOption, isSelected && styles.emojiOptionSelected]}
                        onPress={() => handleSelectEmoji(emoji)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Select emoji ${emoji}`}
                      >
                        <Text style={styles.emojiOptionText}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={(text) => setTitle(text.slice(0, 50))}
                placeholder="New Task"
                placeholderTextColor="#7f8a9a"
                style={styles.titleInput}
                accessibilityLabel="New Task"
                maxLength={50}
                returnKeyType="done"
              />
              <Text style={styles.counter}>{`${title.length}/50`}</Text>
              <View style={styles.paletteContainer}>
                {COLORS.map((color) => {
                  const isSelected = selectedColor === color;
                  return (
                    <Pressable
                      key={color}
                      style={[styles.colorDot, { backgroundColor: color }, isSelected && styles.colorDotSelected]}
                      onPress={() => setSelectedColor(color)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Select color ${color}`}
                    >
                      {isSelected && <Ionicons name="checkmark" size={18} color="#1F2742" />}
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.listContainer}>
                <SheetRow
                  icon={(
                    <View style={styles.rowIconContainer}>
                      <Ionicons name="calendar-clear-outline" size={22} color="#61708A" />
                    </View>
                  )}
                  label="Starting from"
                  value={dateLabel}
                  onPress={() => handleOpenPanel('date')}
                />
                <SheetRow
                  icon={(
                    <View style={styles.rowIconContainer}>
                      <Ionicons name="repeat-outline" size={22} color="#61708A" />
                    </View>
                  )}
                  label="Repeat"
                  value={repeatLabel}
                  onPress={() => handleOpenPanel('repeat')}
                />
                <SheetRow
                  icon={(
                    <View style={styles.rowIconContainer}>
                      <Ionicons name="time-outline" size={22} color="#61708A" />
                    </View>
                  )}
                  label="Time"
                  value={timeValue}
                  onPress={() => handleOpenPanel('time')}
                />
                <SheetRow
                  icon={(
                    <View style={styles.rowIconContainer}>
                      <Ionicons name="notifications-outline" size={22} color="#61708A" />
                    </View>
                  )}
                  label="Reminder"
                  value={reminderLabel}
                  onPress={() => handleOpenPanel('reminder')}
                />
                <SheetRow
                  icon={(
                    <View style={styles.rowIconContainer}>
                      <Ionicons name="pricetag-outline" size={22} color="#61708A" />
                    </View>
                  )}
                  label="Tag"
                  value={tagLabel}
                  onPress={() => handleOpenPanel('tag')}
                  isLast
                />
              </View>
              <SubtasksPanel value={subtasks} onChange={setSubtasks} />
            </ScrollView>
            {activePanel === 'date' && (
              <OptionOverlay
                title="Starting from"
                subtitle={formatDateLabel(pendingDate)}
                onClose={closePanel}
                onApply={handleApplyDate}
              >
                <DatePanel
                  month={calendarMonth}
                  selectedDate={pendingDate}
                  onSelectDate={setPendingDate}
                  onChangeMonth={setCalendarMonth}
                  repeatOption={repeatOption}
                  repeatWeekdays={selectedWeekdays}
                />
              </OptionOverlay>
            )}
            {activePanel === 'repeat' && (
              <OptionOverlay
                title="Set task repeat"
                onClose={closePanel}
                onApply={handleApplyRepeat}
              >
                <RepeatPanel
                  option={pendingRepeatOption}
                  weekdays={pendingWeekdays}
                  onOptionChange={setPendingRepeatOption}
                  onToggleWeekday={(weekday) => {
                    setPendingWeekdays((prev) => {
                      const next = new Set(prev);
                      if (next.has(weekday)) {
                        next.delete(weekday);
                      } else {
                        next.add(weekday);
                      }
                      return next;
                    });
                  }}
                  startDate={startDate}
                />
              </OptionOverlay>
            )}
            {activePanel === 'time' && (
              <OptionOverlay
                title={pendingTimeTitle}
                onClose={closePanel}
                onApply={handleApplyTime}
              >
                <TimePanel
                  specified={pendingHasSpecifiedTime}
                  onToggleSpecified={setPendingHasSpecifiedTime}
                  mode={pendingTimeMode}
                  onModeChange={setPendingTimeMode}
                  pointTime={pendingPointTime}
                  onPointTimeChange={handlePendingPointTimeChange}
                  periodTime={pendingPeriodTime}
                  onPeriodTimeChange={handlePendingPeriodTimeChange}
                />
              </OptionOverlay>
            )}
            {activePanel === 'reminder' && (
              <OptionOverlay
                title="Reminder"
                onClose={closePanel}
                onApply={handleApplyReminder}
              >
                <OptionList
                  options={reminderOptions}
                  selectedKey={pendingReminder}
                  onSelect={setPendingReminder}
                />
              </OptionOverlay>
            )}
            {activePanel === 'tag' && (
              <OptionOverlay
                title="Tag"
                onClose={closePanel}
                onApply={handleApplyTag}
              >
                <TagPanel
                  options={tagOptions}
                  selectedKey={pendingTag}
                  onSelect={setPendingTag}
                  onCreateTag={handleCreateCustomTag}
                />
              </OptionOverlay>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

function SheetRow({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  isLast = false,
  disabled = false,
}) {
  return (
    <Pressable
      style={[styles.row, isLast && styles.rowLast, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: false, disabled }}
    >
      <View style={styles.rowLeft}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>

      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        {showChevron && <Ionicons name="chevron-forward" size={18} color="#9aa0af" />}
      </View>
    </Pressable>
  );
}

function OptionOverlay({
  title,
  subtitle,
  onClose,
  onApply,
  children,
  applyLabel = 'Apply',
  applyDisabled,
  scrollEnabled = true,
}) {
  return (
    <View style={styles.overlayContainer}>
      <View style={styles.overlayCard}>
        <View style={styles.overlayHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onClose}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={24} color="#1F2742" />
          </Pressable>
          <View style={styles.overlayTitleContainer}>
            <Text style={styles.overlayTitle}>{title}</Text>
            {subtitle ? <Text style={styles.overlaySubtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable
            style={styles.overlayApplyButton}
            onPress={onApply}
            accessibilityRole="button"
            accessibilityState={{ disabled: applyDisabled }}
            disabled={applyDisabled}
            hitSlop={12}
          >
            <Text
              style={[styles.overlayApplyText, applyDisabled && styles.overlayApplyTextDisabled]}
            >
              {applyLabel}
            </Text>
          </Pressable>
        </View>
        {scrollEnabled ? (
          <ScrollView
            style={styles.overlayScroll}
            contentContainerStyle={styles.overlayScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.overlayScroll, styles.overlayScrollContent]}>{children}</View>
        )}
      </View>
    </View>
  );
}

function OptionList({ options, selectedKey, onSelect }) {
  return (
    <View style={styles.optionList}>
      {options.map((option, index) => {
        const isSelected = option.key === selectedKey;
        const isLast = index === options.length - 1;

        return (
          <Pressable
            key={option.key}
            style={[
              styles.optionItem,
              isLast ? styles.optionItemLast : null,
              isSelected ? styles.optionItemSelected : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option.key)}
          >
            <View style={styles.optionLabelColumn}>
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {option.label}
              </Text>
              {option.hint ? <Text style={styles.optionHint}>{option.hint}</Text> : null}
            </View>
            <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
              {isSelected && <View style={styles.radioInner} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function TagPanel({ options, selectedKey, onSelect, onCreateTag }) {
  const [newTagName, setNewTagName] = useState('');
  const trimmed = newTagName.trim();
  const isDisabled = trimmed.length === 0;

  const handleAddTag = useCallback(() => {
    if (isDisabled) {
      return;
    }
    const result = onCreateTag(trimmed);
    if (result?.key) {
      setNewTagName('');
    }
  }, [isDisabled, onCreateTag, trimmed]);

  return (
    <View style={styles.tagPanel}>
      <OptionList options={options} selectedKey={selectedKey} onSelect={onSelect} />
      <View style={styles.tagCreator}>
        <TextInput
          style={styles.tagInput}
          placeholder="Create new tag"
          placeholderTextColor="#7F8A9A"
          value={newTagName}
          onChangeText={setNewTagName}
          onSubmitEditing={handleAddTag}
          returnKeyType="done"
          maxLength={30}
          accessibilityLabel="Create new tag"
        />
        <Pressable
          style={[styles.tagAddButton, isDisabled && styles.tagAddButtonDisabled]}
          onPress={handleAddTag}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
        >
          <Text style={[styles.tagAddButtonText, isDisabled && styles.tagAddButtonTextDisabled]}>
            Add
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SubtasksPanel({ value, onChange }) {
  const [draft, setDraft] = useState('');
  const trimmedDraft = draft.trim();
  const list = Array.isArray(value) ? value : [];

  const handleAdd = useCallback(() => {
    if (!trimmedDraft) {
      return;
    }
    onChange((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.push(trimmedDraft);
      return next;
    });
    setDraft('');
  }, [onChange, trimmedDraft]);

  const handleRemove = useCallback(
    (index) => {
      onChange((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    },
    [onChange]
  );

  const handleSubmitEditing = useCallback(() => {
    handleAdd();
  }, [handleAdd]);

  const placeholder = list.length === 0 ? 'Subtasks' : 'Add subtask';

  return (
    <View style={styles.subtasksPanel}>
      <View style={styles.subtasksCard}>
        {list.length > 0 && (
          <View style={styles.subtasksList}>
            {list.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.subtaskItem}>
                <Ionicons name="ellipse-outline" size={18} color="#94A3B8" />
                <Text style={styles.subtaskText}>{item}</Text>
                <Pressable
                  onPress={() => handleRemove(index)}
                  accessibilityLabel={`Remove subtask ${item}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.subtaskRemoveButton}
                >
                  <Ionicons name="close-outline" size={20} color="#94A3B8" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <View style={styles.subtaskComposer}>
          <Ionicons name="add-circle-outline" size={22} color="#61708A" />
          <TextInput
            style={styles.subtaskComposerInput}
            placeholder={placeholder}
            placeholderTextColor="#7F8A9A"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSubmitEditing}
            returnKeyType="done"
            accessibilityLabel="Add subtask"
          />
          {trimmedDraft.length > 0 && (
            <Pressable
              onPress={handleAdd}
              accessibilityRole="button"
              accessibilityLabel="Confirm subtask"
              style={styles.subtaskComposerConfirm}
            >
              <Ionicons name="checkmark-circle" size={22} color="#1F2742" />
            </Pressable>
          )}
        </View>
      </View>
      <Text style={styles.subtasksPanelHint}>Subtasks can be set as your daily routine or checklist</Text>
    </View>
  );
}

function DatePanel({ month, selectedDate, onSelectDate, onChangeMonth, repeatOption, repeatWeekdays }) {
  const today = useMemo(() => normalizeDate(new Date()), []);
  const monthInfo = useMemo(() => getMonthMetadata(month), [month]);
  const monthLabel = useMemo(
    () =>
      month.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [month]
  );
  const previousMonth = useMemo(() => addMonths(month, -1), [month]);
  const nextMonth = useMemo(() => addMonths(month, 1), [month]);
  const previousMonthDisabled = useMemo(() => {
    const lastDayPrev = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0);
    return isBeforeDay(lastDayPrev, today);
  }, [previousMonth, today]);
  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(today.getDate() + 1);
    return normalizeDate(t);
  }, [today]);
  const nextMonday = useMemo(() => {
    const next = new Date(today);
    const offset = ((1 - next.getDay() + 7) % 7) || 7;
    next.setDate(next.getDate() + offset);
    return normalizeDate(next);
  }, [today]);
  const repeatingWeekdays = useMemo(
    () => (repeatWeekdays ? new Set(repeatWeekdays) : new Set()),
    [repeatWeekdays]
  );

  const daysMatrix = useMemo(() => {
    const totalCells = monthInfo.startWeekday + monthInfo.days;
    const filledCells = Math.ceil(totalCells / 7) * 7;
    const cells = [];
    for (let i = 0; i < monthInfo.startWeekday; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= monthInfo.days; day += 1) {
      cells.push(new Date(monthInfo.year, monthInfo.month, day));
    }
    while (cells.length < filledCells) {
      cells.push(null);
    }
    const rows = [];
    for (let index = 0; index < cells.length; index += 7) {
      rows.push(cells.slice(index, index + 7));
    }
    return rows;
  }, [monthInfo.days, monthInfo.month, monthInfo.startWeekday, monthInfo.year]);

  const handleSelectQuick = useCallback(
    (targetDate) => {
      const normalizedTarget = normalizeDate(targetDate);
      if (
        normalizedTarget.getFullYear() !== month.getFullYear() ||
        normalizedTarget.getMonth() !== month.getMonth()
      ) {
        onChangeMonth(new Date(normalizedTarget.getFullYear(), normalizedTarget.getMonth(), 1));
      }
      onSelectDate(normalizedTarget);
    },
    [month, onChangeMonth, onSelectDate]
  );

  return (
    <View>
      <View style={styles.quickSelectRow}>
        <QuickSelectButton
          label="Today"
          active={isSameDay(selectedDate, today)}
          onPress={() => handleSelectQuick(today)}
        />
        <QuickSelectButton
          label="Tomorrow"
          active={isSameDay(selectedDate, tomorrow)}
          onPress={() => handleSelectQuick(tomorrow)}
        />
        <QuickSelectButton
          label="Next Monday"
          active={isSameDay(selectedDate, nextMonday)}
          onPress={() => handleSelectQuick(nextMonday)}
        />
      </View>
      <View style={styles.calendarHeader}>
        <Pressable
          onPress={() => onChangeMonth(previousMonth)}
          disabled={previousMonthDisabled}
          hitSlop={12}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={previousMonthDisabled ? '#B8C4D6' : '#1F2742'}
          />
        </Pressable>
        <Text style={styles.calendarHeaderText}>{monthLabel}</Text>
        <Pressable onPress={() => onChangeMonth(nextMonth)} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color="#1F2742" />
        </Pressable>
      </View>
      <View style={styles.weekdayHeader}>
        {WEEKDAYS.map((weekday) => (
          <Text key={weekday.key} style={styles.weekdayLabel}>
            {weekday.label}
          </Text>
        ))}
      </View>
      {daysMatrix.map((week, rowIndex) => (
        <View key={`week-${rowIndex}`} style={styles.calendarWeekRow}>
          {week.map((date, cellIndex) => {
            if (!date) {
              return <View key={`empty-${rowIndex}-${cellIndex}`} style={styles.calendarDay} />;
            }
            const isDisabled = isBeforeDay(date, today);
            const isSelected = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, today);
            const isRepeating = doesDateRepeat(date, selectedDate, repeatOption, repeatingWeekdays);
            return (
              <Pressable
                key={date.toISOString()}
                style={[
                  styles.calendarDay,
                  isSelected && styles.calendarDaySelected,
                  isToday && styles.calendarDayToday,
                  isDisabled && styles.calendarDayDisabled,
                  !isSelected && isRepeating && styles.calendarDayRepeating,
                ]}
                onPress={() => onSelectDate(normalizeDate(date))}
                disabled={isDisabled}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isDisabled }}
              >
                <Text
                  style={[
                    styles.calendarDayText,
                    isSelected && styles.calendarDayTextSelected,
                    isDisabled && styles.calendarDayTextDisabled,
                    !isSelected && isRepeating && styles.calendarDayTextRepeating,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function QuickSelectButton({ label, active, onPress }) {
  return (
    <Pressable
      style={[styles.quickSelectButton, active && styles.quickSelectButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.quickSelectLabel, active && styles.quickSelectLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function RepeatPanel({ option, weekdays, onOptionChange, onToggleWeekday, startDate }) {
  const weeklyHint = useMemo(() => {
    if (!startDate) {
      return null;
    }
    return `(${startDate.toLocaleDateString(undefined, { weekday: 'long' })})`;
  }, [startDate]);
  const monthlyHint = useMemo(() => {
    if (!startDate) {
      return null;
    }
    return `(On ${formatOrdinal(startDate.getDate())})`;
  }, [startDate]);
  const repeatOptions = useMemo(
    () => [
      { key: 'off', label: 'No repeat' },
      { key: 'daily', label: 'Daily' },
      { key: 'weekly', label: 'Weekly', hint: weeklyHint },
      { key: 'monthly', label: 'Monthly', hint: monthlyHint },
      { key: 'weekend', label: 'Weekend (Sat, Sun)' },
      { key: 'custom', label: 'Custom' },
    ],
    [monthlyHint, weeklyHint]
  );
  return (
    <View style={styles.repeatPanel}>
      {repeatOptions.map((repeatOption, index, array) => {
        const isSelected = repeatOption.key === option;
        const isLast = index === array.length - 1;
        return (
          <Pressable
            key={repeatOption.key}
            style={[styles.optionItem, isLast && styles.optionItemLast, isSelected && styles.optionItemSelected]}
            onPress={() => onOptionChange(repeatOption.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <View style={styles.optionLabelColumn}>
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {repeatOption.label}
              </Text>
              {repeatOption.hint ? <Text style={styles.optionHint}>{repeatOption.hint}</Text> : null}
            </View>
            <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
              {isSelected && <View style={styles.radioInner} />}
            </View>
          </Pressable>
        );
      })}
      {option === 'custom' && (
        <View style={styles.weekdayToggleRow}>
          {WEEKDAYS.map((weekday) => {
            const isActive = weekdays.has(weekday.key);
            return (
              <Pressable
                key={weekday.key}
                style={[styles.weekdayToggle, isActive && styles.weekdayToggleActive]}
                onPress={() => onToggleWeekday(weekday.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[styles.weekdayToggleLabel, isActive && styles.weekdayToggleLabelActive]}
                >
                  {weekday.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TimePanel({
  specified,
  onToggleSpecified,
  mode,
  onModeChange,
  pointTime,
  onPointTimeChange,
  periodTime,
  onPeriodTimeChange,
}) {
  const hourIndex = Math.max(0, HOUR_VALUES.indexOf(pointTime.hour));
  const minuteIndex = Math.max(0, MINUTE_VALUES.indexOf(pointTime.minute));
  const meridiemIndex = Math.max(0, MERIDIEM_VALUES.indexOf(pointTime.meridiem));

  const startHourIndex = Math.max(0, HOUR_VALUES.indexOf(periodTime.start.hour));
  const startMinuteIndex = Math.max(0, MINUTE_VALUES.indexOf(periodTime.start.minute));
  const startMeridiemIndex = Math.max(0, MERIDIEM_VALUES.indexOf(periodTime.start.meridiem));
  const endHourIndex = Math.max(0, HOUR_VALUES.indexOf(periodTime.end.hour));
  const endMinuteIndex = Math.max(0, MINUTE_VALUES.indexOf(periodTime.end.minute));
  const endMeridiemIndex = Math.max(0, MERIDIEM_VALUES.indexOf(periodTime.end.meridiem));

  return (
    <View style={styles.timePanel}>
      <View style={styles.specifiedRow}>
        <View style={styles.specifiedLabelGroup}>
          <View style={styles.specifiedIconContainer}>
            <Ionicons name="time-outline" size={22} color="#1F2742" />
          </View>
          <View>
            <Text style={styles.specifiedTitle}>Specified time</Text>
            <Text style={styles.specifiedSubtitle}>Set a specific time to do it</Text>
          </View>
        </View>
        <Switch
          value={specified}
          onValueChange={onToggleSpecified}
          trackColor={{ false: '#C8D4E6', true: '#A3B7D7' }}
          thumbColor={specified ? '#1F2742' : Platform.OS === 'android' ? '#f4f3f4' : undefined}
        />
      </View>
      {specified && (
        <>
          <View style={styles.segmentedControl}>
            <SegmentedControlButton
              label="Point time"
              active={mode === 'point'}
              onPress={() => onModeChange('point')}
            />
            <SegmentedControlButton
              label="Time period"
              active={mode === 'period'}
              onPress={() => onModeChange('period')}
            />
          </View>
          {mode === 'point' ? (
            <View style={styles.wheelGroup}>
              <View style={styles.wheelLabelsRow}>
                <Text style={styles.wheelLabel}>Hour</Text>
                <Text style={styles.wheelLabel}>Min</Text>
                <Text style={styles.wheelLabel}>AM/PM</Text>
              </View>
              <View style={styles.wheelArea}>
                <View pointerEvents="none" style={styles.wheelHighlight} />
                <View style={styles.wheelRow}>
                  <WheelColumn
                    values={HOUR_VALUES}
                    selectedIndex={hourIndex}
                    onSelect={(value) => onPointTimeChange({ ...pointTime, hour: value })}
                    formatter={(value) => formatNumber(value)}
                  />
                  <Text pointerEvents="none" style={styles.wheelDivider}>
                    :
                  </Text>
                  <WheelColumn
                    values={MINUTE_VALUES}
                    selectedIndex={minuteIndex}
                    onSelect={(value) => onPointTimeChange({ ...pointTime, minute: value })}
                    formatter={(value) => formatNumber(value)}
                  />
                  <WheelColumn
                    values={MERIDIEM_VALUES}
                    selectedIndex={meridiemIndex}
                    onSelect={(value) => onPointTimeChange({ ...pointTime, meridiem: value })}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.periodSection}>
              <Text style={styles.periodLabel}>FROM</Text>
              <View style={styles.wheelGroup}>
                <View style={styles.wheelLabelsRow}>
                  <Text style={styles.wheelLabel}>Hour</Text>
                  <Text style={styles.wheelLabel}>Min</Text>
                  <Text style={styles.wheelLabel}>AM/PM</Text>
                </View>
                <View style={styles.wheelArea}>
                  <View pointerEvents="none" style={styles.wheelHighlight} />
                  <View style={styles.wheelRow}>
                    <WheelColumn
                      values={HOUR_VALUES}
                      selectedIndex={startHourIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          start: { ...prev.start, hour: value },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    <Text pointerEvents="none" style={styles.wheelDivider}>
                      :
                    </Text>
                    <WheelColumn
                      values={MINUTE_VALUES}
                      selectedIndex={startMinuteIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          start: { ...prev.start, minute: value },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    <WheelColumn
                      values={MERIDIEM_VALUES}
                      selectedIndex={startMeridiemIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          start: { ...prev.start, meridiem: value },
                        }))
                      }
                    />
                  </View>
                </View>
              </View>
              <Text style={[styles.periodLabel, styles.periodLabelSpacer]}>TO</Text>
              <View style={styles.wheelGroup}>
                <View style={styles.wheelLabelsRow}>
                  <Text style={styles.wheelLabel}>Hour</Text>
                  <Text style={styles.wheelLabel}>Min</Text>
                  <Text style={styles.wheelLabel}>AM/PM</Text>
                </View>
                <View style={styles.wheelArea}>
                  <View pointerEvents="none" style={styles.wheelHighlight} />
                  <View style={styles.wheelRow}>
                    <WheelColumn
                      values={HOUR_VALUES}
                      selectedIndex={endHourIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          end: { ...prev.end, hour: value },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    <Text pointerEvents="none" style={styles.wheelDivider}>
                      :
                    </Text>
                    <WheelColumn
                      values={MINUTE_VALUES}
                      selectedIndex={endMinuteIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          end: { ...prev.end, minute: value },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    <WheelColumn
                      values={MERIDIEM_VALUES}
                      selectedIndex={endMeridiemIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          end: { ...prev.end, meridiem: value },
                        }))
                      }
                    />
                  </View>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function SegmentedControlButton({ label, active, onPress }) {
  return (
    <Pressable
      style={[styles.segmentedButton, active && styles.segmentedButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentedButtonLabel, active && styles.segmentedButtonLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const WHEEL_ITEM_HEIGHT = 48;

function WheelColumn({
  values,
  selectedIndex,
  onSelect,
  formatter = (value) => value,
  itemHeight = WHEEL_ITEM_HEIGHT,
}) {
  const scrollRef = useRef(null);
  const isMomentumScrolling = useRef(false);

  const offsets = useMemo(
    () => values.map((_, index) => index * itemHeight),
    [values, itemHeight]
  );

  useEffect(() => {
    if (!scrollRef.current || isMomentumScrolling.current) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * itemHeight, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex, itemHeight]);

  const finalizeSelection = useCallback(
    (offsetY) => {
      const maxOffset = Math.max(0, (values.length - 1) * itemHeight);
      const clampedOffset = Math.min(Math.max(offsetY, 0), maxOffset);
      const index = Math.round(clampedOffset / itemHeight);
      const clampedIndex = Math.min(Math.max(index, 0), values.length - 1);
      const targetOffset = offsets[clampedIndex] ?? clampedIndex * itemHeight;

      const distanceToTarget = Math.abs(targetOffset - clampedOffset);
      const shouldAnimate = distanceToTarget > 0.5;
      if (distanceToTarget > 0) {
        scrollRef.current?.scrollTo({ y: targetOffset, animated: shouldAnimate });
      }

      if (clampedIndex !== selectedIndex) {
        onSelect(values[clampedIndex]);
        if (HAPTICS_SUPPORTED && typeof Haptics.selectionAsync === 'function') {
          try {
            Haptics.selectionAsync();
          } catch (error) {
            // Ignore missing haptics support on web
          }
        }
      }
    },
    [itemHeight, offsets, onSelect, selectedIndex, values]
  );

  const handleMomentumBegin = useCallback(() => {
    isMomentumScrolling.current = true;
  }, []);

  const handleMomentumEnd = useCallback(
    (event) => {
      isMomentumScrolling.current = false;
      finalizeSelection(event.nativeEvent.contentOffset.y ?? 0);
    },
    [finalizeSelection]
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wheelColumn}
      contentContainerStyle={[
        styles.wheelColumnContent,
        { paddingVertical: itemHeight * 2 },
      ]}
      showsVerticalScrollIndicator={false}
      // deixa o sistema cuidar do momentum e nós só "arredondamos" no fim:
      snapToInterval={itemHeight}
      decelerationRate={Platform.select({ ios: 'fast', android: 0.998 })}
      overScrollMode="never"
      bounces
      scrollEventThrottle={16}
      nestedScrollEnabled
      // evita que o gesto suba para o pan da folha:
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onMomentumScrollBegin={handleMomentumBegin}
      onMomentumScrollEnd={handleMomentumEnd}
      // se o usuário soltar sem momentum, finalize aqui:
      onScrollEndDrag={(e) => {
        if (!isMomentumScrolling.current) {
          finalizeSelection(e.nativeEvent.contentOffset.y ?? 0);
        }
      }}
    >
      {values.map((value, index) => {
        const isActive = index === selectedIndex;
        return (
          <View key={`${value}-${index}`} style={[styles.wheelItem, { height: itemHeight }]}>
            <Text style={[styles.wheelItemText, isActive && styles.wheelItemTextActive]}>
              {formatter(value)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F1528',
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#DDE9FF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 24,
    overflow: 'hidden',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  createButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1F2742',
  },
  createButtonDisabled: {
    backgroundColor: '#B7C2D6',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  createButtonTextDisabled: {
    color: '#E5EBF6',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 48,
  },
  emojiButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 56,
    paddingHorizontal: 32,
    paddingVertical: 18,
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  emojiButtonActive: {
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  emoji: {
    fontSize: 52,
    textAlign: 'center',
  },
  emojiChevron: {
    marginTop: 10,
  },
  emojiPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F6FF',
  },
  emojiOptionSelected: {
    backgroundColor: '#DDE9FF',
    borderWidth: 2,
    borderColor: '#1F2742',
  },
  emojiOptionText: {
    fontSize: 28,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2742',
    textAlign: 'center',
  },
  counter: {
    textAlign: 'center',
    color: '#7F8A9A',
    marginTop: 4,
    marginBottom: 24,
    fontWeight: '500',
  },
  paletteContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  colorDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18, 32, 53, 0.2)',
  },
  colorDotSelected: {
    borderWidth: 2,
    borderColor: '#1F2742',
  },
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  subtasksPanel: {
    marginTop: 4,
    gap: 12,
  },
  subtasksCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(109, 125, 150, 0.16)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FF',
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: '#1F2742',
    fontWeight: '600',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    color: '#7F8A9A',
    fontSize: 15,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#DDE9FF',
    zIndex: 2,
  },
  overlayCard: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  overlayTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  overlayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2742',
    textAlign: 'center',
  },
  overlaySubtitle: {
    fontSize: 14,
    color: '#7F8A9A',
    textAlign: 'center',
    marginTop: 2,
  },
  overlayApplyButton: {
    minWidth: 54,
    alignItems: 'flex-end',
  },
  overlayApplyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2742',
  },
  overlayApplyTextDisabled: {
    color: '#B0BDCF',
  },
  overlayScroll: {
    flex: 1,
  },
  overlayScrollContent: {
    paddingBottom: 32,
  },
  optionList: {
    backgroundColor: '#F5F7FF',
    borderRadius: 20,
    overflow: 'hidden',
  },
  tagPanel: {
    gap: 18,
  },
  tagCreator: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EEF3FF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tagInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1F2742',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(109, 125, 150, 0.16)',
  },
  tagAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#1F2742',
  },
  tagAddButtonDisabled: {
    backgroundColor: '#B8C4D6',
  },
  tagAddButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  tagAddButtonTextDisabled: {
    opacity: 0.6,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(109, 125, 150, 0.12)',
  },
  optionItemSelected: {
    backgroundColor: '#E4ECFF',
  },
  optionItemLast: {
    borderBottomWidth: 0,
  },
  optionLabelColumn: {
    flexShrink: 1,
  },
  optionLabel: {
    color: '#1F2742',
    fontSize: 16,
    fontWeight: '500',
  },
  optionLabelSelected: {
    fontWeight: '600',
  },
  optionHint: {
    marginTop: 2,
    color: '#6F7A86',
    fontSize: 13,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#B8C4D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: '#1F2742',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1F2742',
  },
  subtasksList: {
    gap: 10,
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#F5F7FF',
  },
  subtaskText: {
    flex: 1,
    color: '#1F2742',
    fontSize: 15,
  },
  subtaskRemoveButton: {
    padding: 4,
  },
  subtaskComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EEF3FF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  subtaskComposerInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2742',
    paddingVertical: 0,
  },
  subtaskComposerConfirm: {
    padding: 4,
  },
  subtasksPanelHint: {
    color: '#7F8A9A',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  quickSelectRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  quickSelectButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#EEF3FF',
  },
  quickSelectButtonActive: {
    backgroundColor: '#1F2742',
  },
  quickSelectLabel: {
    fontSize: 14,
    color: '#1F2742',
    fontWeight: '600',
  },
  quickSelectLabelActive: {
    color: '#FFFFFF',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarHeaderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2742',
  },
  weekdayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#7F8A9A',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calendarDay: {
    flex: 1,
    marginHorizontal: 4,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDaySelected: {
    backgroundColor: '#1F2742',
  },
  calendarDayToday: {
    borderWidth: 2,
    borderColor: '#1F2742',
  },
  calendarDayDisabled: {
    opacity: 0.3,
  },
  calendarDayRepeating: {
    backgroundColor: 'rgba(31, 39, 66, 0.18)',
  },
  calendarDayText: {
    fontSize: 16,
    color: '#1F2742',
    fontWeight: '600',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
  },
  calendarDayTextDisabled: {
    color: '#1F2742',
  },
  calendarDayTextRepeating: {
    color: '#1F2742',
    fontWeight: '600',
  },
  repeatPanel: {
    backgroundColor: '#F5F7FF',
    borderRadius: 20,
    paddingVertical: 6,
  },
  weekdayToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 10,
    gap: 8,
  },
  weekdayToggle: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#E8EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayToggleActive: {
    backgroundColor: '#1F2742',
  },
  weekdayToggleLabel: {
    color: '#1F2742',
    fontWeight: '600',
  },
  weekdayToggleLabelActive: {
    color: '#FFFFFF',
  },
  timePanel: {
    backgroundColor: '#F5F7FF',
    borderRadius: 20,
    padding: 16,
    gap: 18,
  },
  specifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  specifiedLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  specifiedIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3EBFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  specifiedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2742',
  },
  specifiedSubtitle: {
    fontSize: 13,
    color: '#7F8A9A',
    marginTop: 2,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E3EBFF',
    borderRadius: 18,
    padding: 4,
    gap: 4,
  },
  segmentedButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  segmentedButtonLabel: {
    fontSize: 14,
    color: '#54627A',
    fontWeight: '600',
  },
  segmentedButtonLabelActive: {
    color: '#1F2742',
  },
  wheelGroup: {
    marginTop: 18,
    marginBottom: 14,
    gap: 10,
  },
  wheelArea: {
    position: 'relative',
    paddingHorizontal: 12,
    height: WHEEL_ITEM_HEIGHT * 5,
    justifyContent: 'center',
  },
  wheelHighlight: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: WHEEL_ITEM_HEIGHT * 2,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(31,39,66,0.16)',
    backgroundColor: '#FFFFFF',
    shadowColor: '#1F2742',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  wheelRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 12,
  },
  wheelColumn: {
    flex: 1,
    height: '100%',
    maxHeight: WHEEL_ITEM_HEIGHT * 5,
    flexBasis: 0,
  },
  wheelColumnContent: {
    paddingVertical: WHEEL_ITEM_HEIGHT * 2,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 18,
    color: '#A3AEC1',
    fontWeight: '600',
  },
  wheelItemTextActive: {
    color: '#1F2742',
    fontSize: 24,
    fontWeight: '700',
  },
  wheelLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  wheelLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#7F8A9A',
    textTransform: 'uppercase',
  },
  wheelDivider: {
    alignSelf: 'center',
    fontSize: 26,
    fontWeight: '700',
    color: '#1F2742',
    marginHorizontal: 2,
  },
  periodSection: {
    marginTop: 6,
    gap: 12,
  },
  periodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7F8A9A',
    textAlign: 'center',
  },
  periodLabelSpacer: {
    marginTop: 2,
  },
});
