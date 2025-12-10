import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

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
  '👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👊','👏','🙌','👐','🤲','🙏','🫶','🤝','👋','✋','🖐️',
  '👉','👈','☝️','👇','👆','🫵','✍️',
  '🏃‍♂️','🏃‍♀️','🚶‍♂️','🚶‍♀️','🏋️‍♂️','🏋️‍♀️','🤸‍♂️','🤸‍♀️','🏊‍♂️','🏊‍♀️','🚴‍♂️','🚴‍♀️','🧗‍♂️','🧗‍♀️','🧘‍♂️','🧘‍♀️','🤾‍♂️','🤾‍♀️',
  '⛹️‍♂️','⛹️‍♀️','🤺','🤼‍♂️','🤼‍♀️','🤽‍♂️','🤽‍♀️','🚵‍♂️','🚵‍♀️','🧎‍♂️','🧎‍♀️','🧍‍♂️','🧍‍♀️',
  '☀️','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','🌈','🌪️','🌫️','💨',
  '🌙','🌛','🌟','✨','💫','⚡','🔥','💧','💦','🌊',
  '🌱','🌿','🍃','🌵','🌷','🌼','🌻','🌸','💐','🍁','🍂','🍀',
  '🍎','🍏','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🍍','🥭','🥝','🥑','🍅','🥕','🌽','🥦','🥒','🧄','🧅',
  '🍞','🥐','🥖','🥨','🥯','🧇','🥞','🧀','🍳','🥚','🥗','🥙','🌯','🌮','🍔','🍟','🍕','🍝','🍜','🍣','🍱','🥟','🥠','🍲',
  '🍚','🍛','🍥','🍡','🍢','🍘','🍙','🍿','🍫','🍪','🍩','🧁','🎂','🍰','🍦','🍨','🍧','🍯','🍮','🍵','☕','🧋','🥤','🧃','🧉','💧','🚰',
  '⏰','⏱️','⏲️','🕰️','🗓️','📅','📆','📋','🗒️','📝','📖','📚','📘','📙','📗','📓','📔',
  '🧠','💡','🔋','🔌','🔋','🪫','🔧','🛠️','🧰','🧪','🔬','⚖️','🧯','🧹','🪣','🧼','🪥','🪒','🚿','🛁',
  '💻','🖥️','⌨️','🖱️','📱','📲','🎧','📷','🎥','🎙️','📎','📌','📍','🔖','🔗','🔒','🔓','🔑','🗝️','🔔','🔕',
  '🏠','🏡','🏢','🏫','🏥','🏬','🏪','🏖️','🏕️','⛰️','🏞️','🌋','🏜️',
  '🚗','🚕','🚙','🚌','🚎','🚑','🚒','🚓','🚚','🚲','🛵','🏍️','🚆','🚄','✈️','🛫','🛬','🚀','⛵','🚤','🚢',
  '🎨','🖌️','🧵','🧶','🎸','🎹','🥁','🎻','🎤','🎮','🎲','♟️','🧩','📷','🎞️','🎬','🎯','🎳','🏸','🥊','🥋',
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
  '🐔','🐧','🦆','🦅','🦉','🦇','🐢','🐍','🦎','🐙','🪼','🐠','🐟','🐡','🐬','🦈','🐳','🐋',
  '🐝','🦋','🐞','🪲','🐜','🪳','🪰','🕷️','🕸️',
  '✅','☑️','✔️','❌','✖️','⭕','❗','❕','⁉️','❓','❔',
  '🔴','🟠','🟡','🟢','🔵','🟣','⚪','⚫','⬜','⬛','🔺','🔻','🔸','🔹',
  '⭐','🌟','✨','💫','🎯','🏆','🎖️','🥇','🥈','🥉',
  '💬','🗨️','🗯️','🔊','🔇','📣','📢','📶',
  '💰','💸','💳','💵','💶','💷','💴','💹',
  '💊','💉','🩹','🩺','🧼','🪥','🧴','🛌','🧘','🫁','🫀','🧬',
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
const FREQUENCY_LABELS = {
  daily: { singular: 'day', plural: 'days' },
  weekly: { singular: 'week', plural: 'weeks' },
  monthly: { singular: 'month', plural: 'months' },
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
const INTERVAL_VALUES = Array.from({ length: 99 }, (_, i) => i + 1);

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

function daysBetween(start, end) {
  return Math.floor((normalizeDate(end) - normalizeDate(start)) / (24 * 60 * 60 * 1000));
}

function monthsBetween(start, end) {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth())
  );
}

function getRepeatLabel(repeatConfig, startDate) {
  if (!repeatConfig?.enabled) {
    return 'No repeat';
  }

  const { frequency, interval, weekdays, monthDays, endDate } = repeatConfig;
  const unitLabels = FREQUENCY_LABELS[frequency] || FREQUENCY_LABELS.daily;
  const everyText = `Every ${interval} ${interval === 1 ? unitLabels.singular : unitLabels.plural}`;
  const endText = endDate ? ` until ${formatDateLabel(endDate)}` : '';

  if (frequency === 'weekly') {
    const selectedWeekdays = (weekdays && weekdays.size ? weekdays : null) ||
      new Set([startDate ? getWeekdayKeyFromDate(startDate) : 'mon']);
    const labels = WEEKDAYS.filter(({ key }) => selectedWeekdays.has(key)).map(
      (weekday) => WEEKDAY_SHORT_NAMES[weekday.key] || weekday.label
    );
    const daysText = labels.length ? ` on ${labels.join(', ')}` : '';
    return `${everyText}${daysText}${endText}`;
  }

  if (frequency === 'monthly') {
    const selectedDays = (monthDays && monthDays.size ? monthDays : null) ||
      new Set([startDate ? startDate.getDate() : 1]);
    const dayText = Array.from(selectedDays)
      .sort((a, b) => a - b)
      .map((day) => formatOrdinal(day))
      .join(', ');
    return `${everyText}${dayText ? ` on ${dayText}` : ''}${endText}`;
  }

  return `${everyText}${endText}`;
}

function doesDateRepeat(date, start, repeatConfig) {
  if (!repeatConfig?.enabled || !start || isBeforeDay(date, start)) {
    return false;
  }

  const { frequency, interval = 1, weekdays, monthDays, endDate } = repeatConfig;
  const normalizedDate = normalizeDate(date);
  const normalizedStart = normalizeDate(start);

  if (endDate && isBeforeDay(endDate, normalizedDate)) {
    return false;
  }

  if (frequency === 'daily') {
    const diffDays = daysBetween(normalizedStart, normalizedDate);
    return diffDays % interval === 0;
  }

  if (frequency === 'weekly') {
    const diffDays = daysBetween(normalizedStart, normalizedDate);
    const diffWeeks = Math.floor(diffDays / 7);
    const targetWeekday = getWeekdayKeyFromDate(normalizedDate);
    const allowedWeekdays = weekdays && weekdays.size ? weekdays : new Set([getWeekdayKeyFromDate(start)]);
    return diffWeeks % interval === 0 && allowedWeekdays.has(targetWeekday);
  }

  if (frequency === 'monthly') {
    const diffMonths = monthsBetween(normalizedStart, normalizedDate);
    const selectedDays = monthDays && monthDays.size ? monthDays : new Set([start.getDate()]);
    return diffMonths % interval === 0 && selectedDays.has(normalizedDate.getDate());
  }

  return false;
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
    const usableHeight = height - insets.top;
    return usableHeight;
  }, [height, insets.top]);
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedEmoji, setSelectedEmoji] = useState(DEFAULT_EMOJI);
  const [isEmojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(visible);
  const [activePanel, setActivePanel] = useState(null);
  const [startDate, setStartDate] = useState(() => normalizeDate(new Date()));
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState('daily');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [selectedWeekdays, setSelectedWeekdays] = useState(
    () => new Set([getWeekdayKeyFromDate(normalizeDate(new Date()))])
  );
  const [selectedMonthDays, setSelectedMonthDays] = useState(() => new Set([startDate.getDate()]));
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(null);
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

  const [calendarMonth, setCalendarMonthState] = useState(
    () => new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  );
  const [pendingDate, setPendingDate] = useState(startDate);
  const [pendingIsRepeatEnabled, setPendingIsRepeatEnabled] = useState(isRepeatEnabled);
  const [pendingRepeatFrequency, setPendingRepeatFrequency] = useState(repeatFrequency);
  const [pendingRepeatInterval, setPendingRepeatInterval] = useState(repeatInterval);
  const [pendingWeekdays, setPendingWeekdays] = useState(() => new Set(selectedWeekdays));
  const [pendingMonthDays, setPendingMonthDays] = useState(() => new Set(selectedMonthDays));
  const [pendingHasEndDate, setPendingHasEndDate] = useState(hasEndDate);
  const [pendingEndDate, setPendingEndDate] = useState(endDate ?? startDate);
  const [pendingHasSpecifiedTime, setPendingHasSpecifiedTime] = useState(hasSpecifiedTime);
  const [pendingTimeMode, setPendingTimeMode] = useState(timeMode);
  const [pendingPointTime, setPendingPointTime] = useState(pointTime);
  const [pendingPeriodTime, setPendingPeriodTime] = useState(periodTime);
  const [pendingReminder, setPendingReminder] = useState(reminderOption);
  const [pendingTag, setPendingTag] = useState(selectedTag);
  const [pendingSubtasks, setPendingSubtasks] = useState([]);
  const [customImage, setCustomImage] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const titleInputRef = useRef(null);
  const translateY = useRef(new Animated.Value(sheetHeight || height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const sheetBackgroundColor = useMemo(() => lightenColor(selectedColor, 0.75), [selectedColor]);
  const isEditMode = mode === 'edit';
  const isCopyMode = mode === 'copy';
  const submitLabel = isEditMode ? 'Save' : 'Create';
  const isDragCloseEnabled = false;
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
    setCustomImage(null);
    setEmojiPickerVisible(false);
  }, []);

  const handleToggleEmojiPicker = useCallback(() => {
    setEmojiPickerVisible((prev) => !prev);
  }, []);

  const handlePickImage = useCallback(async () => {
    if (isLoadingImage) {
      return;
    }

    try {
      setIsLoadingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets?.length) {
        setCustomImage(result.assets[0].uri);
        setEmojiPickerVisible(false);
      }
    } catch (error) {
      console.error('Error selecting custom image:', error);
    } finally {
      setIsLoadingImage(false);
    }
  }, [isLoadingImage]);

  const handleRemoveCustomImage = useCallback(() => {
    setCustomImage(null);
  }, []);

  const handleOpenPanel = useCallback(
    (panel) => {
      setActivePanel(panel);
      if (panel === 'date') {
        setCalendarMonthState(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
        setPendingDate(new Date(startDate));
      } else if (panel === 'repeat') {
        setPendingIsRepeatEnabled(isRepeatEnabled);
        setPendingRepeatFrequency(repeatFrequency);
        setPendingRepeatInterval(repeatInterval);
        setPendingWeekdays(new Set(selectedWeekdays));
        setPendingMonthDays(new Set(selectedMonthDays));
        setPendingHasEndDate(hasEndDate);
        setPendingEndDate(endDate ?? startDate);
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
      repeatFrequency,
      selectedTag,
      selectedWeekdays,
      selectedMonthDays,
      startDate,
      repeatInterval,
      isRepeatEnabled,
      hasEndDate,
      endDate,
      timeMode,
    ]
  );

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const handleApplyDate = useCallback(() => {
    const normalizedDate = normalizeDate(pendingDate);
    setStartDate(normalizedDate);
    setCalendarMonthState(new Date(normalizedDate.getFullYear(), normalizedDate.getMonth(), 1));
    if (repeatFrequency === 'weekly' && selectedWeekdays.size === 0) {
      setSelectedWeekdays(new Set([getWeekdayKeyFromDate(normalizedDate)]));
    }
    if (repeatFrequency === 'monthly' && selectedMonthDays.size === 0) {
      setSelectedMonthDays(new Set([normalizedDate.getDate()]));
    }
    closePanel();
  }, [
    closePanel,
    pendingDate,
    repeatFrequency,
    selectedMonthDays,
    selectedWeekdays,
  ]);

  const handleApplyRepeat = useCallback(() => {
    const normalizedInterval = Math.min(99, Math.max(1, pendingRepeatInterval || 1));
    const resolvedWeekdays =
      pendingRepeatFrequency === 'weekly'
        ? (pendingWeekdays.size
            ? new Set(pendingWeekdays)
            : new Set([getWeekdayKeyFromDate(startDate)]))
        : new Set(pendingWeekdays);

    const resolvedMonthDays =
      pendingRepeatFrequency === 'monthly'
        ? (pendingMonthDays.size ? new Set(pendingMonthDays) : new Set([startDate.getDate()]))
        : new Set(pendingMonthDays);

    setIsRepeatEnabled(pendingIsRepeatEnabled);
    setRepeatFrequency(pendingRepeatFrequency);
    setRepeatInterval(normalizedInterval);
    setSelectedWeekdays(resolvedWeekdays);
    setSelectedMonthDays(resolvedMonthDays);
    setHasEndDate(pendingHasEndDate && !!pendingEndDate);
    setEndDate(pendingHasEndDate && pendingEndDate ? normalizeDate(pendingEndDate) : null);
    closePanel();
  }, [
    closePanel,
    pendingEndDate,
    pendingHasEndDate,
    pendingIsRepeatEnabled,
    pendingMonthDays,
    pendingRepeatFrequency,
    pendingRepeatInterval,
    pendingWeekdays,
    startDate,
  ]);

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
    const defaultWeekday = getWeekdayKeyFromDate(resolvedStartDate);
    const defaultMonthDay = resolvedStartDate.getDate();
    const repeatSettings = initialHabit.repeat ?? {};
    let resolvedIsRepeatEnabled = false;
    let resolvedRepeatFrequency = 'daily';
    let resolvedRepeatInterval = 1;
    let resolvedWeekdays = new Set([defaultWeekday]);
    let resolvedMonthDays = new Set([defaultMonthDay]);
    let resolvedHasEndDate = false;
    let resolvedEndDate = null;

    if ('enabled' in repeatSettings || 'frequency' in repeatSettings) {
      resolvedIsRepeatEnabled = !!repeatSettings.enabled;
      resolvedRepeatFrequency = repeatSettings.frequency || 'daily';
      resolvedRepeatInterval = repeatSettings.interval ?? 1;
      if (repeatSettings.weekdays?.length) {
        resolvedWeekdays = new Set(repeatSettings.weekdays);
      } else if (resolvedRepeatFrequency === 'weekly') {
        resolvedWeekdays = new Set([defaultWeekday]);
      }
      if (repeatSettings.monthDays?.length) {
        resolvedMonthDays = new Set(repeatSettings.monthDays);
      } else if (resolvedRepeatFrequency === 'monthly') {
        resolvedMonthDays = new Set([defaultMonthDay]);
      }
      if (repeatSettings.endDate) {
        resolvedHasEndDate = true;
        resolvedEndDate = normalizeDate(new Date(repeatSettings.endDate));
      }
    } else if (repeatSettings.option) {
      const option = repeatSettings.option;
      resolvedIsRepeatEnabled = option !== 'off';
      if (option === 'daily') {
        resolvedRepeatFrequency = 'daily';
      } else if (option === 'weekly' || option === 'weekend' || option === 'custom') {
        resolvedRepeatFrequency = 'weekly';
        if (option === 'weekend') {
          resolvedWeekdays = new Set(['sat', 'sun']);
        } else if (repeatSettings.weekdays?.length) {
          resolvedWeekdays = new Set(repeatSettings.weekdays);
        }
      } else if (option === 'monthly') {
        resolvedRepeatFrequency = 'monthly';
      }
    }
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
    setIsRepeatEnabled(resolvedIsRepeatEnabled);
    setRepeatFrequency(resolvedRepeatFrequency);
    setRepeatInterval(resolvedRepeatInterval);
    setSelectedWeekdays(new Set(resolvedWeekdays));
    setSelectedMonthDays(new Set(resolvedMonthDays));
    setHasEndDate(resolvedHasEndDate);
    setEndDate(resolvedEndDate);
    setHasSpecifiedTime(resolvedHasSpecifiedTime);
    setTimeMode(resolvedTimeMode);
    setPointTime(resolvedPoint);
    setPeriodTime(resolvedPeriod);
    setReminderOption(resolvedReminder);
    setSelectedTag(resolvedTagKey);
    setPendingTag(resolvedTagKey);
    setSubtasks(resolvedSubtasks);
    setCustomImage(initialHabit.customImage ?? null);

    setCalendarMonthState(new Date(resolvedStartDate.getFullYear(), resolvedStartDate.getMonth(), 1));
    setPendingDate(resolvedStartDate);
    setPendingIsRepeatEnabled(resolvedIsRepeatEnabled);
    setPendingRepeatFrequency(resolvedRepeatFrequency);
    setPendingRepeatInterval(resolvedRepeatInterval);
    setPendingWeekdays(new Set(resolvedWeekdays));
    setPendingMonthDays(new Set(resolvedMonthDays));
    setPendingHasEndDate(resolvedHasEndDate);
    setPendingEndDate(resolvedEndDate ?? resolvedStartDate);
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
          const defaultStartDate = normalizeDate(new Date());
          setStartDate(defaultStartDate);
          setIsRepeatEnabled(false);
          setRepeatFrequency('daily');
          setRepeatInterval(1);
          setSelectedWeekdays(new Set([getWeekdayKeyFromDate(defaultStartDate)]));
          setSelectedMonthDays(new Set([defaultStartDate.getDate()]));
          setHasEndDate(false);
          setEndDate(null);
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
          setCustomImage(null);
          setIsLoadingImage(false);
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
      customImage,
      startDate,
      repeat: {
        enabled: isRepeatEnabled,
        frequency: repeatFrequency,
        interval: repeatInterval,
        weekdays: Array.from(selectedWeekdays),
        monthDays: Array.from(selectedMonthDays),
        endDate: hasEndDate && endDate ? endDate.toISOString() : null,
      },
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
    repeatFrequency,
    repeatInterval,
    isRepeatEnabled,
    hasEndDate,
    endDate,
    selectedMonthDays,
    selectedColor,
    selectedEmoji,
    selectedTag,
    selectedWeekdays,
    startDate,
    timeMode,
    title,
    reminderOption,
    subtasks,
    customImage,
    tagOptions,
  ]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          isDragCloseEnabled &&
          visible &&
          !activePanel &&
          gestureState.dy > 14 &&
          Math.abs(gestureState.dx) < 8,
        onPanResponderMove: (_, gestureState) => {
          if (!isDragCloseEnabled || !visible) {
            return;
          }
          const offset = Math.max(0, gestureState.dy);
          translateY.setValue(offset);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!isDragCloseEnabled || !visible) {
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
          if (!isDragCloseEnabled || !visible) {
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
    [activePanel, handleClose, isDragCloseEnabled, sheetHeight, translateY, visible]
  );

  const isSubmitDisabled = !title.trim();

  const dateLabel = useMemo(() => formatDateLabel(startDate), [startDate]);
  const repeatConfig = useMemo(
    () => ({
      enabled: isRepeatEnabled,
      frequency: repeatFrequency,
      interval: repeatInterval,
      weekdays: selectedWeekdays,
      monthDays: selectedMonthDays,
      endDate: hasEndDate && endDate ? endDate : null,
    }),
    [
      endDate,
      hasEndDate,
      isRepeatEnabled,
      repeatFrequency,
      repeatInterval,
      selectedMonthDays,
      selectedWeekdays,
    ]
  );
  const repeatLabel = useMemo(
    () => getRepeatLabel(repeatConfig, startDate),
    [repeatConfig, startDate]
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
        {...(!activePanel && isDragCloseEnabled ? panResponder.panHandlers : {})}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior="padding"
          enabled
          keyboardVerticalOffset={insets.top}
        >
          <View
            style={[
              styles.safeArea,
              {
                paddingTop: Math.max(insets.top, 12),
                backgroundColor: sheetBackgroundColor,
              },
            ]}
          >
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
              contentContainerStyle={[
                styles.scrollViewContent,
                { paddingBottom: Math.max(insets.bottom, 24) + 240 },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Pressable
                style={[styles.emojiButton, isEmojiPickerVisible && styles.emojiButtonActive]}
                accessibilityRole="button"
                accessibilityLabel={`Choose icon, currently ${customImage ? 'custom image' : selectedEmoji}`}
                accessibilityHint="Opens a list of emoji options"
                onPress={handleToggleEmojiPicker}
                hitSlop={12}
              >
                {customImage ? (
                  <Image source={{ uri: customImage }} style={styles.customIconImage} />
                ) : (
                  <Text style={styles.emoji}>{selectedEmoji}</Text>
                )}
                <Ionicons
                  name={isEmojiPickerVisible ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#6f7a86"
                  style={styles.emojiChevron}
                />
              </Pressable>
              {isEmojiPickerVisible && (
                <View style={styles.emojiPicker}>
                  <Pressable
                    style={[styles.emojiOption, styles.emojiUploadOption]}
                    onPress={handlePickImage}
                    accessibilityRole="button"
                    accessibilityLabel="Upload custom image"
                    accessibilityHint="Opens your gallery to choose an image"
                    disabled={isLoadingImage}
                  >
                    <Ionicons name="image-outline" size={24} color="#1F2742" />
                  </Pressable>
                  {customImage && (
                    <Pressable
                      style={[styles.emojiOption, styles.emojiOptionSelected]}
                      onPress={handleRemoveCustomImage}
                      accessibilityRole="button"
                      accessibilityLabel="Remove custom image"
                      accessibilityHint="Revert to emoji icon"
                    >
                      <Ionicons name="close" size={20} color="#1F2742" />
                    </Pressable>
                  )}
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
                  onChangeMonth={setCalendarMonthState}
                  repeatConfig={repeatConfig}
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
                  isEnabled={pendingIsRepeatEnabled}
                  frequency={pendingRepeatFrequency}
                  interval={pendingRepeatInterval}
                  weekdays={pendingWeekdays}
                  monthDays={pendingMonthDays}
                  hasEndDate={pendingHasEndDate}
                  endDate={pendingEndDate}
                  onToggleEnabled={setPendingIsRepeatEnabled}
                  onFrequencyChange={setPendingRepeatFrequency}
                  onIntervalChange={setPendingRepeatInterval}
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
                  onToggleMonthDay={(day) => {
                    setPendingMonthDays((prev) => {
                      const next = new Set(prev);
                      if (next.has(day)) {
                        next.delete(day);
                      } else {
                        next.add(day);
                      }
                      return next;
                    });
                  }}
                  onToggleHasEndDate={setPendingHasEndDate}
                  onChangeEndDate={setPendingEndDate}
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
          </View>
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
  const hasSubtasks = list.length > 0;

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

  return (
    <View style={styles.subtasksPanel}>
      <Text style={styles.subtasksTitle}>Subtasks</Text>
      <View style={styles.subtasksCard}>
        {hasSubtasks && (
          <View style={styles.subtasksList}>
            {list.map((item, index) => (
              <View
                key={`${item}-${index}`}
                style={[styles.subtaskItem, index === list.length - 1 && styles.subtaskItemLast]}
              >
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
        <View style={[styles.subtaskComposer, hasSubtasks && styles.subtaskComposerWithDivider]}>
          <TextInput
            style={styles.subtaskComposerInput}
            placeholder="Add subtask"
            placeholderTextColor="#9AA5B5"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSubmitEditing}
            returnKeyType="done"
            accessibilityLabel="Add subtask"
          />
          <Pressable
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel="Add subtask"
            style={[styles.subtaskComposerAdd, trimmedDraft.length === 0 && styles.subtaskComposerAddDisabled]}
            disabled={trimmedDraft.length === 0}
          >
            <Ionicons
              name="add"
              size={20}
              color={trimmedDraft.length === 0 ? '#C3CCDC' : '#6B7288'}
            />
          </Pressable>
        </View>
      </View>
      <Text style={styles.subtasksPanelHint}>Subtasks can be set as your daily routine or checklist</Text>
    </View>
  );
}

function DatePanel({ month, selectedDate, onSelectDate, onChangeMonth, repeatConfig }) {
  const today = useMemo(() => normalizeDate(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState(() => normalizeDate(month));

  useEffect(() => {
    const normalized = normalizeDate(month);
    if (normalized && normalized.getTime() !== visibleMonth.getTime()) {
      setVisibleMonth(normalized);
    }
  }, [month, visibleMonth]);

  const monthInfo = useMemo(() => getMonthMetadata(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(
    () =>
      visibleMonth.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [visibleMonth]
  );
  const previousMonth = useMemo(() => addMonths(visibleMonth, -1), [visibleMonth]);
  const nextMonth = useMemo(() => addMonths(visibleMonth, 1), [visibleMonth]);
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
  const isRepeatingDay = useCallback(
    (targetDate) => {
      if (!repeatConfig?.enabled) {
        return false;
      }
      const normalizedStart = normalizeDate(selectedDate);
      const normalizedTarget = normalizeDate(targetDate);
      if (!normalizedStart || !normalizedTarget) {
        return false;
      }
      return doesDateRepeat(normalizedTarget, normalizedStart, repeatConfig);
    },
    [repeatConfig, selectedDate]
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

  const handleChangeMonth = useCallback(
    (nextMonth) => {
      if (!nextMonth) {
        return;
      }
      const normalized = normalizeDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
      if (!normalized) {
        return;
      }
      setVisibleMonth(normalized);
      if (typeof onChangeMonth === 'function') {
        onChangeMonth(normalized);
      }
    },
    [onChangeMonth]
  );

  const handleSelectQuick = useCallback(
    (targetDate) => {
      const normalizedTarget = normalizeDate(targetDate);
      if (
        normalizedTarget.getFullYear() !== visibleMonth.getFullYear() ||
        normalizedTarget.getMonth() !== visibleMonth.getMonth()
      ) {
        handleChangeMonth(normalizedTarget);
      }
      onSelectDate(normalizedTarget);
    },
    [handleChangeMonth, onSelectDate, visibleMonth]
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
        <Pressable onPress={() => handleChangeMonth(previousMonth)} disabled={previousMonthDisabled} hitSlop={12}>
          <Ionicons
            name="chevron-back"
            size={22}
            color={previousMonthDisabled ? '#B8C4D6' : '#1F2742'}
          />
        </Pressable>
        <Text style={styles.calendarHeaderText}>{monthLabel}</Text>
        <Pressable onPress={() => handleChangeMonth(nextMonth)} hitSlop={12}>
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
        <View key={`week-${rowIndex}`} style={styles.weekRow}>
          {week.map((date) => {
            if (!date) {
              return <View key={`empty-${rowIndex}-${Math.random().toString(36).slice(2, 6)}`} style={styles.dayCellEmpty} />;
            }

            const disabled = isBeforeDay(date, today);
            const selected = isSameDay(date, selectedDate);
            const repeating = isRepeatingDay(date);
            const disabledStyle = disabled ? styles.dayCellDisabled : null;
            const selectedStyle = selected ? styles.dayCellSelected : null;
            const repeatingStyle = repeating ? styles.dayCellRepeating : null;

            return (
              <Pressable
                key={date.toISOString()}
                style={[styles.dayCell, disabledStyle, selectedStyle, repeatingStyle]}
                disabled={disabled}
                onPress={() => onSelectDate(date)}
              >
                <Text style={[styles.dayCellText, disabled && styles.dayCellTextDisabled, selected && styles.dayCellTextSelected, repeating && styles.dayCellTextRepeating]}>{date.getDate()}</Text>
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

function RepeatPanel({
  isEnabled,
  frequency,
  interval,
  weekdays,
  monthDays,
  hasEndDate,
  endDate,
  onToggleEnabled,
  onFrequencyChange,
  onIntervalChange,
  onToggleWeekday,
  onToggleMonthDay,
  onToggleHasEndDate,
  onChangeEndDate,
  startDate,
}) {
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  const [endDateMonth, setEndDateMonth] = useState(() => normalizeDate(endDate || startDate || new Date()));
  const weekdaySet = useMemo(() => weekdays ?? new Set(), [weekdays]);
  const monthDaySet = useMemo(() => monthDays ?? new Set(), [monthDays]);

  useEffect(() => {
    if (endDate) {
      const normalized = normalizeDate(endDate);
      setEndDateMonth(new Date(normalized.getFullYear(), normalized.getMonth(), 1));
    }
  }, [endDate]);

  const intervalUnit = useMemo(() => FREQUENCY_LABELS[frequency] || FREQUENCY_LABELS.daily, [frequency]);
  const intervalSummary = useMemo(
    () => `Every ${interval} ${interval === 1 ? intervalUnit.singular : intervalUnit.plural}`,
    [interval, intervalUnit]
  );

  const handleSelectFrequency = useCallback(
    (value) => {
      const fallbackDate = startDate || new Date();
      if (value === 'weekly' && weekdaySet.size === 0) {
        onToggleWeekday?.(getWeekdayKeyFromDate(fallbackDate));
      }
      if (value === 'monthly' && monthDaySet.size === 0) {
        onToggleMonthDay?.(fallbackDate.getDate());
      }
      onFrequencyChange?.(value);
    },
    [monthDaySet.size, onFrequencyChange, onToggleMonthDay, onToggleWeekday, startDate, weekdaySet.size]
  );

  const handleToggleEndDate = useCallback(
    (value) => {
      onToggleHasEndDate?.(value);
      if (value && !endDate) {
        const fallbackDate = normalizeDate(startDate || new Date());
        onChangeEndDate?.(fallbackDate);
        setEndDateMonth(new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1));
      }
    },
    [endDate, onChangeEndDate, onToggleHasEndDate, startDate]
  );

  const selectedEndDate = useMemo(
    () => normalizeDate(endDate || startDate || new Date()),
    [endDate, startDate]
  );

  return (
    <View style={styles.repeatPanel}>
      <View style={styles.specifiedRow}>
        <View style={styles.specifiedLabelGroup}>
          <View style={styles.specifiedIconContainer}>
            <Ionicons name="repeat-outline" size={22} color="#1F2742" />
          </View>
          <View>
            <Text style={styles.specifiedTitle}>Repeat</Text>
            <Text style={styles.specifiedSubtitle}>Customize recurrence</Text>
          </View>
        </View>
        <Switch
          value={isEnabled}
          onValueChange={onToggleEnabled}
          trackColor={{ false: '#C8D4E6', true: '#A3B7D7' }}
          thumbColor={isEnabled ? '#1F2742' : Platform.OS === 'android' ? '#f4f3f4' : undefined}
        />
      </View>

      {isEnabled && (
        <View style={styles.repeatContent}>
          <View style={styles.segmentedControl}>
            <SegmentedControlButton
              label="Daily"
              active={frequency === 'daily'}
              onPress={() => handleSelectFrequency('daily')}
            />
            <SegmentedControlButton
              label="Weekly"
              active={frequency === 'weekly'}
              onPress={() => handleSelectFrequency('weekly')}
            />
            <SegmentedControlButton
              label="Monthly"
              active={frequency === 'monthly'}
              onPress={() => handleSelectFrequency('monthly')}
            />
          </View>

          {frequency === 'weekly' && (
            <View style={styles.weekdayGrid}>
              {WEEKDAYS.map((weekday) => {
                const active = weekdaySet.has(weekday.key);
                return (
                  <Pressable
                    key={weekday.key}
                    style={[styles.weekdayPill, active && styles.weekdayPillActive]}
                    onPress={() => onToggleWeekday(weekday.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.weekdayPillLabel, active && styles.weekdayPillLabelActive]}>
                      {weekday.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {frequency === 'monthly' && (
            <View style={styles.monthDayGrid}>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                const active = monthDaySet.has(day);
                return (
                  <Pressable
                    key={day}
                    style={[styles.monthDayCell, active && styles.monthDayCellActive]}
                    onPress={() => onToggleMonthDay(day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.monthDayLabel, active && styles.monthDayLabelActive]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.intervalSection}>
            <Pressable
              style={styles.intervalRow}
              onPress={() => setShowIntervalPicker((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showIntervalPicker }}
            >
              <Text style={styles.intervalLabel}>Interval</Text>
              <View style={styles.intervalValueContainer}>
                <Text style={styles.intervalValue}>{intervalSummary}</Text>
                <Ionicons
                  name={showIntervalPicker ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#6B7288"
                  style={styles.intervalChevron}
                />
              </View>
            </Pressable>
            {showIntervalPicker && (
              <View style={styles.wheelGroup}>
                <View style={styles.wheelLabelsRow}>
                  <Text style={styles.wheelLabel}>Every</Text>
                  <Text style={styles.wheelLabel}>Unit</Text>
                </View>
                <View style={styles.wheelArea}>
                  <View pointerEvents="none" style={styles.wheelHighlight} />
                  <View style={styles.wheelRow}>
                    <WheelColumn
                      values={INTERVAL_VALUES}
                      selectedIndex={Math.max(0, Math.min(INTERVAL_VALUES.length - 1, interval - 1))}
                      onSelect={(value) => onIntervalChange(value)}
                    />
                    <WheelColumn
                      values={[intervalUnit.plural]}
                      selectedIndex={0}
                      onSelect={() => {}}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          <View style={styles.intervalSection}>
            <View style={styles.endDateRow}>
              <Text style={styles.intervalLabel}>End date</Text>
              <Switch
                value={hasEndDate}
                onValueChange={handleToggleEndDate}
                trackColor={{ false: '#C8D4E6', true: '#A3B7D7' }}
                thumbColor={hasEndDate ? '#1F2742' : Platform.OS === 'android' ? '#f4f3f4' : undefined}
              />
            </View>
            {hasEndDate && (
              <View style={styles.endDatePickerContainer}>
                <DatePanel
                  month={endDateMonth}
                  selectedDate={selectedEndDate}
                  onSelectDate={onChangeEndDate}
                  onChangeMonth={setEndDateMonth}
                  repeatConfig={{ enabled: false }}
                />
              </View>
            )}
          </View>
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
    backgroundColor: 'transparent',
    borderRadius: 56,
    paddingHorizontal: 32,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  emojiButtonActive: {
    // shadowOpacity: 0.12,
    // shadowRadius: 16,
    // elevation: 6,
  },
  customIconImage: {
    width: 67,
    height: 67,
    borderRadius: 33.5,
    resizeMode: 'cover',
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
  emojiUploadOption: {
    backgroundColor: '#E7F0FF',
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
  subtasksTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2742',
    marginLeft: 6,
  },
  subtasksCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
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
    gap: 0,
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F5',
  },
  subtaskItemLast: {
    borderBottomWidth: 0,
  },
  subtaskText: {
    flex: 1,
    color: '#1F2742',
    fontSize: 15,
    fontWeight: '600',
  },
  subtaskRemoveButton: {
    padding: 4,
  },
  subtaskComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  subtaskComposerWithDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F5',
    paddingTop: 10,
  },
  subtaskComposerInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2742',
    paddingVertical: 0,
  },
  subtaskComposerAdd: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F5',
  },
  subtaskComposerAddDisabled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EDF1F7',
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
  // Correção aqui: renomeando e adicionando estilos que faltavam para o calendário
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dayCell: {
    flex: 1,
    marginHorizontal: 4,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellEmpty: {
    flex: 1,
    marginHorizontal: 4,
    height: 44,
  },
  dayCellSelected: {
    backgroundColor: '#1F2742',
  },
  dayCellDisabled: {
    opacity: 0.3,
  },
  dayCellRepeating: {
    backgroundColor: 'rgba(31, 39, 66, 0.18)',
  },
  dayCellText: {
    fontSize: 16,
    color: '#1F2742',
    fontWeight: '600',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
  },
  dayCellTextDisabled: {
    color: '#1F2742',
  },
  dayCellTextRepeating: {
    color: '#1F2742',
    fontWeight: '600',
  },
  repeatPanel: {
    backgroundColor: '#F5F7FF',
    borderRadius: 20,
    paddingVertical: 6,
  },
  repeatContent: {
    gap: 18,
    marginTop: 12,
  },
  weekdayToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 10,
    gap: 8,
  },
  weekdayGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 8,
  },
  weekdayPill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(109, 125, 150, 0.18)',
  },
  weekdayPillActive: {
    backgroundColor: '#E3EBFF',
    borderColor: '#A3B7D7',
  },
  weekdayPillLabel: {
    color: '#556070',
    fontWeight: '700',
    fontSize: 15,
  },
  weekdayPillLabelActive: {
    color: '#1F2742',
  },
  monthDayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    gap: 8,
  },
  monthDayCell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(109, 125, 150, 0.18)',
  },
  monthDayCellActive: {
    backgroundColor: '#E3EBFF',
    borderColor: '#A3B7D7',
  },
  monthDayLabel: {
    color: '#556070',
    fontWeight: '700',
  },
  monthDayLabelActive: {
    color: '#1F2742',
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
  intervalSection: {
    marginTop: 6,
    gap: 12,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  intervalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2742',
  },
  intervalValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  intervalValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
  intervalChevron: {
    marginLeft: 4,
  },
  endDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  endDatePickerContainer: {
    marginTop: 6,
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
