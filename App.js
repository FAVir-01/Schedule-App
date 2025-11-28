import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  Platform,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import {
  addMonths as addMonthsDateFns,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  loadHistory,
  loadTasks,
  loadUserSettings,
  saveHistory,
  saveTasks,
  saveUserSettings,
} from './storage';
import AddHabitSheet from './components/AddHabitSheet';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

const triggerImpact = (style) => {
  if (!HAPTICS_SUPPORTED) {
    return;
  }
  try {
    void Haptics.impactAsync(style);
  } catch (error) {
    // Ignore web environments without haptics support
  }
};

const triggerSelection = () => {
  if (!HAPTICS_SUPPORTED) {
    return;
  }
  try {
    void Haptics.selectionAsync();
  } catch (error) {
    // Ignore web environments without haptics support
  }
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CALENDAR_DAY_SIZE = SCREEN_WIDTH / 7;

const CalendarDayCell = ({ date, isCurrentMonth, status }) => {
  if (!isCurrentMonth) {
    return <View style={{ width: CALENDAR_DAY_SIZE, height: CALENDAR_DAY_SIZE }} />;
  }

  const isSuccess = status === 'success';

  return (
    <View style={styles.calendarDayCellWrapper}>
      {isSuccess ? (
        <View style={styles.calendarSuccessCircle}>
          <Ionicons name="checkmark" size={20} color="white" />
        </View>
      ) : (
        <Text style={styles.calendarDayText}>{format(date, 'd')}</Text>
      )}
    </View>
  );
};

const CalendarMonthItem = ({ item, getDayStatus }) => {
  const monthStart = startOfMonth(item.date);
  const monthEnd = endOfMonth(item.date);

  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });

  return (
    <View style={styles.calendarMonthContainer}>
      <View style={styles.calendarMonthHeader}>
        <Text style={styles.calendarMonthTitle}>{format(item.date, 'MMMM yyyy', { locale: ptBR })}</Text>
      </View>

      <View style={styles.calendarDaysGrid}>
        {days.map((day) => (
          <CalendarDayCell
            key={day.toISOString()}
            date={day}
            isCurrentMonth={day.getMonth() === item.date.getMonth()}
            status={getDayStatus ? getDayStatus(day) : 'pending'}
          />
        ))}
      </View>
    </View>
  );
};

const LEFT_TABS = [
  {
    key: 'today',
    label: 'Today',
    icon: 'time-outline',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    icon: 'calendar-clear-outline',
  },
];

const RIGHT_TABS = [
  {
    key: 'discover',
    label: 'Discover',
    icon: 'compass-outline',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: 'person-outline',
  },
];

const NAV_BAR_THEMES = {
  today: {
    buttonStyle: 'dark',
  },
  calendar: {
    buttonStyle: 'dark',
  },
  discover: {
    buttonStyle: 'dark',
  },
  profile: {
    buttonStyle: 'dark',
  },
};

const DEFAULT_NAV_BAR_THEME = NAV_BAR_THEMES.calendar;

const getNavigationBarThemeForTab = (tabKey) => NAV_BAR_THEMES[tabKey] ?? DEFAULT_NAV_BAR_THEME;

const DEFAULT_USER_SETTINGS = {
  activeTab: 'today',
  selectedTagFilter: 'all',
};

const getDateKey = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthStart = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  normalized.setDate(1);
  return normalized;
};

const getMonthId = (date) => {
  const normalized = getMonthStart(date);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
};

const hexToRgb = (hex) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
};

const lightenColor = (hex, amount = 0.7) => {
  try {
    const { r, g, b } = hexToRgb(hex);
    const mixChannel = (channel) => Math.round(channel + (255 - channel) * amount);
    const mixed = [mixChannel(r), mixChannel(g), mixChannel(b)];
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  } catch (error) {
    return '#f2f3f8';
  }
};

const formatNumber = (value) => value.toString().padStart(2, '0');

const formatTimeValue = ({ hour, minute, meridiem }) =>
  `${formatNumber(hour)}:${formatNumber(minute)} ${meridiem}`;

const toMinutes = ({ hour, minute, meridiem }) => {
  const normalizedHour = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
  return normalizedHour * 60 + minute;
};

const formatTaskTime = (time) => {
  if (!time || !time.specified) {
    return 'Anytime';
  }

  if (time.mode === 'period' && time.period) {
    const { start, end } = time.period;
    return `${formatTimeValue(start)} - ${formatTimeValue(end)}`;
  }

  if (time.point) {
    return formatTimeValue(time.point);
  }

  return 'Anytime';
};

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

  if (!task.repeat && task.dateKey) {
    return task.dateKey === dateKey ? Boolean(task.completed) : false;
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
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
  return null;
};

const getTaskTagDisplayLabel = (task) => {
  if (!task) {
    return null;
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

const normalizeDateValue = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const isSameDay = (dateA, dateB) => {
  if (!dateA || !dateB) {
    return false;
  }
  return dateA.getTime() === dateB.getTime();
};

const getWeekdayKeyFromDate = (date) => {
  const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return WEEKDAY_KEYS[date.getDay()] ?? null;
};

const shouldTaskAppearOnDate = (task, targetDate) => {
  if (!task || !targetDate) {
    return false;
  }

  const normalizedTargetDate = normalizeDateValue(targetDate);
  const normalizedStartDate = normalizeDateValue(task.date ?? task.dateKey);

  if (!normalizedTargetDate || !normalizedStartDate) {
    return false;
  }

  if (isSameDay(normalizedStartDate, normalizedTargetDate)) {
    return true;
  }

  const repeat = task.repeat;
  if (!repeat || !repeat.option || repeat.option === 'off') {
    return false;
  }

  if (normalizedTargetDate.getTime() < normalizedStartDate.getTime()) {
    return false;
  }

  switch (repeat.option) {
    case 'daily':
      return true;
    case 'weekly':
      return normalizedTargetDate.getDay() === normalizedStartDate.getDay();
    case 'monthly':
      return normalizedTargetDate.getDate() === normalizedStartDate.getDate();
    case 'weekend': {
      const day = normalizedTargetDate.getDay();
      return day === 0 || day === 6;
    }
    case 'weekdays': {
      const day = normalizedTargetDate.getDay();
      return day >= 1 && day <= 5;
    }
    case 'custom': {
      const weekdays = Array.isArray(repeat.weekdays) ? repeat.weekdays : [];
      if (!weekdays.length) {
        return false;
      }
      const weekdayKey = getWeekdayKeyFromDate(normalizedTargetDate);
      return weekdayKey ? weekdays.includes(weekdayKey) : false;
    }
    default:
      return false;
  }
};

function ScheduleApp() {
  const [userSettings, setUserSettings] = useState(DEFAULT_USER_SETTINGS);
  const [activeTab, setActiveTab] = useState(DEFAULT_USER_SETTINGS.activeTab);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabMenuMounted, setIsFabMenuMounted] = useState(false);
  const [isHabitSheetOpen, setIsHabitSheetOpen] = useState(false);
  const [habitSheetMode, setHabitSheetMode] = useState('create');
  const [habitSheetInitialTask, setHabitSheetInitialTask] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [tasks, setTasks] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState(
    DEFAULT_USER_SETTINGS.selectedTagFilter
  );
  const [history, setHistory] = useState([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [calendarMonths, setCalendarMonths] = useState(() => [
    { id: 0, date: getMonthStart(new Date()) },
  ]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;
  const fabSize = isCompact ? 48 : 56;
  const centerGap = isCompact ? fabSize * 0.8 : fabSize * 0.95;
  const horizontalPadding = useMemo(() => Math.max(16, Math.min(32, width * 0.06)), [width]);
  const bottomBarPadding = useMemo(() => Math.max(16, horizontalPadding * 0.75), [horizontalPadding]);
  const iconSize = isCompact ? 18 : 20;
  const cardSize = isCompact ? 136 : 152;
  const cardIconSize = Math.round(cardSize * 0.75);
  const cardSpacing = isCompact ? 16 : 24;
  const cardBorderRadius = isCompact ? 30 : 34;
  const cardVerticalOffset = isCompact ? 124 : 140;
  const fabHaloSize = fabSize + (isCompact ? 26 : 30);
  const fabBaseSize = fabSize + (isCompact ? 14 : 18);
  const fabIconSize = isCompact ? 28 : 30;
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const selectedDateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
  const isSelectedToday = selectedDateKey === todayKey;
  const selectedDateLabel = useMemo(() => {
    if (isSelectedToday) {
      return 'Today';
    }
    const weekday = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday}, ${selectedDate.getDate()}`;
  }, [isSelectedToday, selectedDate]);
  useEffect(() => {
    const monthStart = getMonthStart(selectedDate);
    setCalendarMonths((previous) => {
      const exists = previous.some(({ date }) => getMonthId(date) === getMonthId(monthStart));
      if (exists) {
        return previous;
      }
      const nextId = previous.reduce((max, month) => Math.max(max, month.id), -1) + 1;
      const updated = [...previous, { id: nextId, date: monthStart }];
      return updated.sort((a, b) => a.date.getTime() - b.date.getTime());
    });
  }, [selectedDate]);
  const weekDays = useMemo(() => {
    const base = new Date(today);
    return Array.from({ length: 7 }, (_, index) => {
      const offset = index - 3;
      const date = new Date(base);
      date.setDate(base.getDate() + offset);
      const key = getDateKey(date);
      const dayTasks = tasks.filter((task) => shouldTaskAppearOnDate(task, date));
      const allCompleted =
        dayTasks.length > 0 && dayTasks.every((task) => getTaskCompletionStatus(task, key));
      return {
        date,
        key,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        dayNumber: date.getDate(),
        allCompleted,
      };
    });
  }, [tasks, today]);
  const getDayStatusForCalendar = useCallback(
    (day) => {
      const dateKey = getDateKey(day);
      const dayTasks = tasks.filter((task) => shouldTaskAppearOnDate(task, day));
      const allCompleted =
        dayTasks.length > 0 && dayTasks.every((task) => getTaskCompletionStatus(task, dateKey));
      return allCompleted ? 'success' : 'pending';
    },
    [tasks]
  );

  const loadMoreCalendarMonths = useCallback(() => {
    setCalendarMonths((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const lastMonth = previous[previous.length - 1].date;
      const nextId = previous.reduce((max, month) => Math.max(max, month.id), -1) + 1;
      const nextMonthDate = getMonthStart(addMonthsDateFns(lastMonth, 1));
      const exists = previous.some(({ date }) => getMonthId(date) === getMonthId(nextMonthDate));
      if (exists) {
        return previous;
      }
      return [...previous, { id: nextId, date: nextMonthDate }];
    });
  }, []);

  const renderCalendarMonth = useCallback(
    ({ item }) => <CalendarMonthItem item={item} getDayStatus={getDayStatusForCalendar} />,
    [getDayStatusForCalendar]
  );
  const tasksForSelectedDate = useMemo(() => {
    const filtered = tasks.filter((task) => shouldTaskAppearOnDate(task, selectedDate));
    const getSortValue = (task) => {
      if (!task.time || !task.time.specified) {
        return Number.MAX_SAFE_INTEGER;
      }
      if (task.time.mode === 'period' && task.time.period) {
        return toMinutes(task.time.period.start);
      }
      if (task.time.point) {
        return toMinutes(task.time.point);
      }
      return Number.MAX_SAFE_INTEGER;
    };
    return filtered.slice().sort((a, b) => getSortValue(a) - getSortValue(b));
  }, [selectedDate, tasks]);
  const tagOptions = useMemo(() => {
    const seen = new Set();
    return tasksForSelectedDate.reduce((options, task) => {
      const key = normalizeTaskTagKey(task);
      if (!key || seen.has(key)) {
        return options;
      }
      seen.add(key);
      options.push({
        key,
        label: getTaskTagDisplayLabel(task) ?? 'Tag',
      });
      return options;
    }, []);
  }, [tasksForSelectedDate]);
  useEffect(() => {
    if (selectedTagFilter !== 'all' && !tagOptions.some((option) => option.key === selectedTagFilter)) {
      setSelectedTagFilter('all');
      updateUserSettings({ selectedTagFilter: 'all' });
    }
  }, [selectedTagFilter, tagOptions, updateUserSettings]);
  const visibleTasks = useMemo(() => {
    if (selectedTagFilter === 'all') {
      return tasksForSelectedDate;
    }
    return tasksForSelectedDate.filter((task) => normalizeTaskTagKey(task) === selectedTagFilter);
  }, [selectedTagFilter, tasksForSelectedDate]);
  const visibleTasksForSelectedDay = useMemo(
    () =>
      visibleTasks.map((task) => ({
        ...task,
        completed: getTaskCompletionStatus(task, selectedDateKey),
      })),
    [selectedDateKey, visibleTasks]
  );
  const visibleTasksWithStats = useMemo(
    () =>
      visibleTasksForSelectedDay.map((task) => {
        const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
        const completedSubtasks = Array.isArray(task.subtasks)
          ? task.subtasks.filter((item) => getSubtaskCompletionStatus(item, selectedDateKey)).length
          : 0;

        return {
          ...task,
          totalSubtasks,
          completedSubtasks,
          backgroundColor: lightenColor(task.color, 0.75),
          borderColor: task.color,
        };
      }),
    [selectedDateKey, visibleTasksForSelectedDay]
  );
  const allTasksCompletedForSelectedDay =
    tasksForSelectedDate.length > 0 &&
    tasksForSelectedDate.every((task) => getTaskCompletionStatus(task, selectedDateKey));
  const completedTaskCount = useMemo(
    () => tasksForSelectedDate.filter((task) => getTaskCompletionStatus(task, selectedDateKey)).length,
    [selectedDateKey, tasksForSelectedDate]
  );
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks]
  );
  const activeTaskForSelectedDate = useMemo(
    () =>
      activeTask
        ? {
            ...activeTask,
            completed: getTaskCompletionStatus(activeTask, selectedDateKey),
            subtasks: Array.isArray(activeTask.subtasks)
              ? activeTask.subtasks.map((subtask) => ({
                  ...subtask,
                  completed: getSubtaskCompletionStatus(subtask, selectedDateKey),
                }))
              : activeTask.subtasks,
          }
        : null,
    [activeTask, selectedDateKey]
  );
  const lastToggleRef = useRef(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const actionsScale = useRef(new Animated.Value(0.85)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(12)).current;
  const emptyStateIconSize = isCompact ? 98 : 112;

  useEffect(() => {
    let isMounted = true;
    const hydrateFromStorage = async () => {
      try {
        const [storedTasks, storedSettings, storedHistory] = await Promise.all([
          loadTasks(),
          loadUserSettings(),
          loadHistory(),
        ]);

        if (!isMounted) {
          return;
        }

        if (Array.isArray(storedTasks)) {
          setTasks(storedTasks);
        }

        if (storedSettings) {
          const mergedSettings = { ...DEFAULT_USER_SETTINGS, ...storedSettings };
          setUserSettings(mergedSettings);
          setActiveTab(mergedSettings.activeTab ?? DEFAULT_USER_SETTINGS.activeTab);
          setSelectedTagFilter(
            mergedSettings.selectedTagFilter ?? DEFAULT_USER_SETTINGS.selectedTagFilter
          );
        }

        if (Array.isArray(storedHistory)) {
          setHistory(storedHistory);
        }
      } catch (error) {
        console.warn('Failed to load stored data', error);
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    };

    void hydrateFromStorage();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    void saveTasks(tasks);
  }, [isHydrated, tasks]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    void saveUserSettings(userSettings);
  }, [isHydrated, userSettings]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    void saveHistory(history);
  }, [history, isHydrated]);

  const appendHistoryEntry = useCallback((type, details = {}) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    setHistory((previous) => [entry, ...previous].slice(0, 200));
  }, []);

  const updateUserSettings = useCallback((updates) => {
    setUserSettings((previous) => ({
      ...previous,
      ...updates,
    }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    void applyNavigationBarThemeForTab(activeTab);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void applyNavigationBarThemeForTab(activeTab);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [activeTab, applyNavigationBarThemeForTab]);

  const dynamicStyles = useMemo(
    () => ({
      content: {
        paddingHorizontal: horizontalPadding,
        paddingTop: isCompact ? 32 : 48,
      },
      calendarListContent: {
        paddingHorizontal: horizontalPadding,
        paddingTop: isCompact ? 24 : 32,
        paddingBottom: isCompact ? 56 : 72,
      },
      description: {
        fontSize: isCompact ? 15 : 16,
        lineHeight: isCompact ? 20 : 22,
      },
      emptyStateIllustration: {
        width: isCompact ? 220 : 260,
        height: isCompact ? 220 : 260,
        borderRadius: isCompact ? 110 : 130,
      },
      bottomBarContainer: {
        paddingHorizontal: 0,
        paddingBottom: insets.bottom,
        backgroundColor: '#000000',
      },
      bottomBar: {
        paddingHorizontal: bottomBarPadding,
        paddingVertical: isCompact ? 8 : 10,
      },
      tabLabel: {
        fontSize: isCompact ? 10 : 11,
        marginTop: isCompact ? 2 : 4,
      },
      tabGroupLeft: {
        paddingRight: centerGap / 2,
        marginRight: centerGap / 4,
      },
      tabGroupRight: {
        paddingLeft: centerGap / 2,
        marginLeft: centerGap / 4,
      },
      addButton: {
        width: fabSize,
        height: fabSize,
        borderRadius: fabSize / 2,
        top: isCompact ? -20 : -24,
      },
    }),
    [
      bottomBarPadding,
      centerGap,
      fabSize,
      horizontalPadding,
      insets.bottom,
      isCompact,
    ]
  );

  const openFabMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 200) {
      return;
    }
    lastToggleRef.current = now;
    if (isFabOpen) {
      return;
    }
    setIsFabMenuMounted(true);
    setIsFabOpen(true);
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  }, [isFabOpen]);

  const closeFabMenu = useCallback(() => {
    if (!isFabOpen && !isFabMenuMounted) {
      return;
    }
    const now = Date.now();
    if (now - lastToggleRef.current < 200) {
      return;
    }
    lastToggleRef.current = now;
    setIsFabOpen(false);
  }, [isFabMenuMounted, isFabOpen]);

  const handleToggleFab = useCallback(() => {
    if (isFabOpen) {
      closeFabMenu();
    } else {
      openFabMenu();
    }
  }, [closeFabMenu, isFabOpen, openFabMenu]);

  const handleAddHabit = useCallback(() => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    closeFabMenu();
    setHabitSheetMode('create');
    setHabitSheetInitialTask(null);
    setIsHabitSheetOpen(true);
  }, [closeFabMenu]);

  const handleAddReflection = useCallback(() => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    console.log('Add reflection action triggered');
    closeFabMenu();
  }, [closeFabMenu]);

  const handleCloseCreateHabit = useCallback(() => {
    setIsHabitSheetOpen(false);
    setHabitSheetMode('create');
    setHabitSheetInitialTask(null);
  }, []);

  const handleSelectDate = useCallback((date) => {
    triggerSelection();
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    setSelectedDate(normalized);
  }, []);
  const handleSelectCalendarDate = useCallback(
    (date) => {
      handleSelectDate(date);
    },
    [handleSelectDate]
  );

  const applyNavigationBarThemeForTab = useCallback(async (tabKey) => {
    if (Platform.OS !== 'android') {
      return;
    }

    const theme = getNavigationBarThemeForTab(tabKey);
    // Only adjust navigation bar button style. Android edge-to-edge prevents background/position
    // tweaks, and some devices warn when unsupported methods are called.
    if (!theme || !theme.buttonStyle) {
      return;
    }
    // Lazy-require to avoid importing when not available on platform
    const NavigationBar = require('expo-navigation-bar');
    if (NavigationBar?.setButtonStyleAsync) {
      try {
        await NavigationBar.setButtonStyleAsync(theme.buttonStyle);
      } catch (error) {
        // Ignore when navigation bar button style can't be updated
      }
    }
  }, []);

  const handleChangeTab = useCallback(
    (tabKey) => {
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tabKey);
      updateUserSettings({ activeTab: tabKey });
      void applyNavigationBarThemeForTab(tabKey);
    },
    [applyNavigationBarThemeForTab, updateUserSettings]
  );

  const handleSelectTagFilter = useCallback(
    (filterKey) => {
      setSelectedTagFilter(filterKey);
      updateUserSettings({ selectedTagFilter: filterKey });
    },
    [updateUserSettings]
  );

  const handleToggleTaskCompletion = useCallback(
    (taskId, dateKey = selectedDateKey) => {
      const targetDateKey = dateKey ?? selectedDateKey;
      const targetTask = tasks.find((task) => task.id === taskId);
      const wasCompleted = targetTask
        ? getTaskCompletionStatus(targetTask, targetDateKey)
        : false;

      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          const completedDates = { ...(task.completedDates ?? {}) };
          const isCompletedForDate = getTaskCompletionStatus(task, targetDateKey);

          if (isCompletedForDate) {
            delete completedDates[targetDateKey];
          } else if (targetDateKey) {
            completedDates[targetDateKey] = true;
          }

          return {
            ...task,
            completedDates,
            completed: Boolean(completedDates[targetDateKey]),
          };
        })
      );

      appendHistoryEntry('task_completion_toggled', {
        taskId,
        dateKey: targetDateKey,
        completed: !wasCompleted,
      });
    },
    [appendHistoryEntry, selectedDateKey, tasks]
  );

  const convertSubtasks = useCallback((subtasks, existing = []) => {
    const remainingExisting = [...existing];
    const now = Date.now();
    return subtasks
      .map((item) => item.trim())
      .filter(Boolean)
      .map((title, index) => {
        const existingIndex = remainingExisting.findIndex((subtask) => subtask.title === title);
        if (existingIndex >= 0) {
          const [found] = remainingExisting.splice(existingIndex, 1);
          return { ...found, title, completedDates: found.completedDates ?? {} };
        }
        return {
          id: `${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          completed: false,
          completedDates: {},
        };
      });
  }, []);

  const handleCreateHabit = useCallback((habit) => {
    const normalizedDate = new Date(habit?.startDate ?? new Date());
    normalizedDate.setHours(0, 0, 0, 0);
    const dateKey = getDateKey(normalizedDate);
    const color = habit?.color ?? '#d1d7ff';
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: habit?.title ?? 'Untitled task',
      color,
      emoji: habit?.emoji ?? '✅',
      time: habit?.time,
      date: normalizedDate,
      dateKey,
      completed: false,
      completedDates: {},
      subtasks: convertSubtasks(habit?.subtasks ?? []),
      repeat: habit?.repeat,
      reminder: habit?.reminder,
      tag: habit?.tag,
      tagLabel: habit?.tagLabel,
    };
    setTasks((previous) => [...previous, newTask]);
    setSelectedDate(normalizedDate);
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    appendHistoryEntry('task_created', {
      taskId: newTask.id,
      title: newTask.title,
      dateKey: newTask.dateKey,
    });
  }, [appendHistoryEntry, convertSubtasks]);

  const handleUpdateHabit = useCallback(
    (taskId, habit) => {
      const normalizedDate = habit?.startDate ? new Date(habit.startDate) : null;
      if (normalizedDate) {
        normalizedDate.setHours(0, 0, 0, 0);
      }
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          const nextDate = normalizedDate ? new Date(normalizedDate) : new Date(task.date);
          nextDate.setHours(0, 0, 0, 0);
          return {
            ...task,
            title: habit?.title ?? task.title,
            color: habit?.color ?? task.color,
            emoji: habit?.emoji ?? task.emoji,
            time: habit?.time,
            subtasks: convertSubtasks(habit?.subtasks ?? [], task.subtasks ?? []),
            repeat: habit?.repeat,
            reminder: habit?.reminder,
            tag: habit?.tag,
            tagLabel: habit?.tagLabel,
            date: nextDate,
            dateKey: getDateKey(nextDate),
          };
        })
      );
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      if (normalizedDate) {
        setSelectedDate(normalizedDate);
      }
      appendHistoryEntry('task_updated', {
        taskId,
        title: habit?.title,
        dateKey: normalizedDate ? getDateKey(normalizedDate) : undefined,
      });
    },
    [appendHistoryEntry, convertSubtasks]
  );

  const handleToggleSubtask = useCallback(
    (taskId, subtaskId) => {
      triggerSelection();
      const targetDateKey = selectedDateKey;
      const targetTask = tasks.find((task) => task.id === taskId);
      const targetSubtask = targetTask?.subtasks?.find((item) => item.id === subtaskId);
      const wasCompleted = targetSubtask
        ? getSubtaskCompletionStatus(targetSubtask, targetDateKey)
        : false;
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          return {
            ...task,
            subtasks: (task.subtasks ?? []).map((subtask) => {
              if (subtask.id !== subtaskId) {
                return subtask;
              }
              const completedDates = { ...(subtask.completedDates ?? {}) };
              const isCompletedForDate = getSubtaskCompletionStatus(subtask, targetDateKey);
              if (isCompletedForDate) {
                delete completedDates[targetDateKey];
              } else if (targetDateKey) {
                completedDates[targetDateKey] = true;
              }
              return {
                ...subtask,
                completedDates,
                completed: Boolean(targetDateKey && completedDates[targetDateKey]),
              };
            }),
          };
        })
      );
      appendHistoryEntry('subtask_completion_toggled', {
        taskId,
        subtaskId,
        dateKey: targetDateKey,
        completed: !wasCompleted,
      });
    },
    [appendHistoryEntry, selectedDateKey, tasks]
  );

  const openHabitSheet = useCallback((mode, task = null) => {
    setHabitSheetMode(mode);
    setHabitSheetInitialTask(task);
    setIsHabitSheetOpen(true);
  }, []);

  const closeTaskDetail = useCallback(() => {
    setActiveTaskId(null);
  }, []);

  useEffect(() => {
    if (activeTaskId && !tasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(null);
    }
  }, [activeTaskId, tasks]);

  useEffect(() => {
    if (!isFabOpen || Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFabMenu();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [closeFabMenu, isFabOpen]);

  useEffect(() => {
    if (!isFabMenuMounted) {
      overlayOpacity.setValue(0);
      actionsScale.setValue(0.85);
      actionsOpacity.setValue(0);
      actionsTranslateY.setValue(12);
      return;
    }

    if (isFabOpen) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.spring(actionsScale, {
          toValue: 1,
          damping: 18,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 0,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 12,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsScale, {
          toValue: 0.85,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (finished && !isFabOpen) {
          setIsFabMenuMounted(false);
        }
      });
    }
  }, [actionsOpacity, actionsScale, actionsTranslateY, isFabMenuMounted, isFabOpen, overlayOpacity]);

  const renderTabButton = ({ key, label, icon }) => {
    const isActive = activeTab === key;
    return (
      <TouchableOpacity
        key={key}
        style={styles.tabButton}
        onPress={() => handleChangeTab(key)}
        accessibilityRole="button"
        accessibilityLabel={`${label} tab`}
        disabled={isFabOpen}
      >
        <Ionicons
          name={icon}
          size={iconSize}
          color={isActive ? styles.activeColor.color : styles.inactiveColor.color}
        />
        <Text
          style={[
            styles.tabLabel,
            dynamicStyles.tabLabel,
            isActive ? styles.activeColor : styles.inactiveColor,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.appFrame,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#f6f6fb"
        translucent={false}
      />

      <View style={styles.container}>
        <View
          style={[styles.content, dynamicStyles.content]}
          importantForAccessibility={isFabOpen ? 'no-hide-descendants' : 'auto'}
        >
          {activeTab === 'today' ? (
            <ScrollView
              contentContainerStyle={styles.todayContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.todayHeader}>
                <Text style={styles.todayTitle}>{selectedDateLabel}</Text>
                {tasksForSelectedDate.length > 0 && (
                  <Text
                    style={[
                      styles.todaySubtitle,
                      allTasksCompletedForSelectedDay
                        ? styles.todaySubtitleSuccess
                        : styles.todaySubtitleInProgress,
                    ]}
                  >
                    {allTasksCompletedForSelectedDay
                      ? 'All tasks completed'
                      : `${completedTaskCount}/${tasksForSelectedDate.length} completed`}
                  </Text>
                )}
              </View>

              <View style={styles.daySelector}>
                {weekDays.map((day) => {
                  const isSelected = day.key === selectedDateKey;
                  const isToday = day.key === todayKey;
                  const dayContainerStyles = [styles.dayNumber];
                  const dayTextStyles = [styles.dayNumberText];
                  if (isSelected) {
                    dayContainerStyles.push(styles.dayNumberSelected);
                    dayTextStyles.push(styles.dayNumberTextSelected);
                  }
                  if (day.allCompleted) {
                    dayContainerStyles.push(styles.dayNumberCompleted);
                    dayTextStyles.push(styles.dayNumberTextCompleted);
                  }
                  const indicatorStyles = [styles.todayIndicator];
                  if (day.allCompleted) {
                    indicatorStyles.push(styles.todayIndicatorOnCompleted);
                  }
                  return (
                    <Pressable
                      key={day.key}
                      style={styles.dayItem}
                      onPress={() => handleSelectDate(day.date)}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.label} ${day.dayNumber}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                        {day.label}
                      </Text>
                      <View style={dayContainerStyles}>
                        <Text style={dayTextStyles}>{day.dayNumber}</Text>
                        {isToday && <View style={indicatorStyles} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {tagOptions.length > 0 && (
                <View style={styles.tagFilterContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tagFilterScroll}
                  >
                    <Pressable
                      key="all"
                      style={[
                        styles.tagPill,
                        selectedTagFilter === 'all' && styles.tagPillSelected,
                      ]}
                      onPress={() => {
                        if (selectedTagFilter !== 'all') {
                          triggerSelection();
                          handleSelectTagFilter('all');
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Show all tags"
                      accessibilityState={{ selected: selectedTagFilter === 'all' }}
                    >
                      <Text
                        style={[
                          styles.tagPillText,
                          selectedTagFilter === 'all' && styles.tagPillTextSelected,
                        ]}
                      >
                        All
                      </Text>
                    </Pressable>
                    {tagOptions.map((option) => {
                      const isSelected = selectedTagFilter === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          style={[styles.tagPill, isSelected && styles.tagPillSelected]}
                          onPress={() => {
                            if (!isSelected) {
                              triggerSelection();
                              handleSelectTagFilter(option.key);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Show tasks tagged ${option.label}`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[styles.tagPillText, isSelected && styles.tagPillTextSelected]}
                            numberOfLines={1}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.tasksSection}>
                {visibleTasksWithStats.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <View
                      style={[styles.emptyStateIllustration, dynamicStyles.emptyStateIllustration]}
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel="Illustration showing an empty schedule"
                    >
                      <Ionicons name="calendar-clear-outline" size={emptyStateIconSize} color="#3c2ba7" />
                    </View>
                    <Text style={styles.emptyState}>
                      {selectedTagFilter === 'all'
                        ? 'No tasks for this day yet. Use the add button to create one.'
                        : 'No tasks with this tag for this day yet.'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={visibleTasksWithStats}
                    renderItem={({ item: task }) => (
                      <SwipeableTaskCard
                        task={task}
                        backgroundColor={task.backgroundColor}
                        borderColor={task.borderColor}
                        totalSubtasks={task.totalSubtasks}
                        completedSubtasks={task.completedSubtasks}
                        onPress={() => setActiveTaskId(task.id)}
                        onToggleCompletion={() => handleToggleTaskCompletion(task.id, selectedDateKey)}
                        onCopy={() => {
                          const duplicated = {
                            ...task,
                            title: `${task.title} 1`,
                            subtasks: task.subtasks?.map((subtask) => subtask.title) ?? [],
                            startDate: task.date,
                          };
                          openHabitSheet('copy', duplicated);
                        }}
                        onDelete={() => {
                          setTasks((previous) => previous.filter((current) => current.id !== task.id));
                        }}
                        onEdit={() => {
                          const editable = {
                            ...task,
                            startDate: task.date,
                            subtasks: task.subtasks?.map((subtask) => subtask.title) ?? [],
                          };
                          openHabitSheet('edit', editable);
                        }}
                      />
                    )}
                    keyExtractor={(task) => task.id}
                    scrollEnabled={false}
                    contentContainerStyle={styles.tasksList}
                  />
                )}
              </View>
            </ScrollView>
          ) : activeTab === 'calendar' ? (
            <FlatList
              data={calendarMonths}
              renderItem={renderCalendarMonth}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.calendarListContent, dynamicStyles.calendarListContent]}
              onEndReached={loadMoreCalendarMonths}
              onEndReachedThreshold={0.5}
            />
          ) : (
            <View style={styles.placeholderContainer}>
              <View style={styles.placeholderIconWrapper}>
                <Ionicons
                  name={
                    activeTab === 'calendar'
                      ? 'calendar-outline'
                      : activeTab === 'discover'
                      ? 'planet-outline'
                      : 'person-circle-outline'
                  }
                  size={48}
                  color="#3c2ba7"
                />
              </View>
              <Text style={styles.heading}>
                {activeTab === 'calendar'
                  ? 'Calendar Overview'
                  : activeTab === 'discover'
                  ? 'Discover'
                  : 'Profile'}
              </Text>
              <Text style={[styles.description, dynamicStyles.description, styles.placeholderDescription]}>
                {activeTab === 'calendar'
                  ? 'Plan ahead and review your upcoming schedule from the calendar view.'
                  : activeTab === 'discover'
                  ? 'Explore new routines, templates, and ideas to add to your day.'
                  : 'View and personalize your profile, preferences, and progress.'}
              </Text>
            </View>
          )}
        </View>

        <View
          style={[styles.bottomBarContainer, dynamicStyles.bottomBarContainer]}
          importantForAccessibility={isFabOpen ? 'no-hide-descendants' : 'auto'}
        >
          <View
            style={[
              styles.bottomBar,
              dynamicStyles.bottomBar,
              isFabOpen && styles.bottomBarDimmed,
            ]}
          >
            <View style={[styles.tabGroup, dynamicStyles.tabGroupLeft]}>
              {LEFT_TABS.map(renderTabButton)}
            </View>
            <View style={[styles.tabGroup, dynamicStyles.tabGroupRight]}>
              {RIGHT_TABS.map(renderTabButton)}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.addButton,
              dynamicStyles.addButton,
              isFabOpen && styles.addButtonActive,
            ]}
            onPress={handleToggleFab}
            accessibilityRole="button"
            accessibilityLabel={isFabOpen ? 'Close add menu' : 'Open add menu'}
            activeOpacity={0.85}
          >
            {isFabOpen && (
              <View
                pointerEvents="none"
                style={[
                  styles.addButtonBase,
                  {
                    width: fabBaseSize,
                    height: fabBaseSize,
                    borderRadius: fabBaseSize / 2,
                    top: (fabSize - fabBaseSize) / 2,
                    left: (fabSize - fabBaseSize) / 2,
                  },
                ]}
              />
            )}
            {isFabOpen && (
              <View
                pointerEvents="none"
                style={[
                  styles.addButtonHalo,
                  {
                    width: fabHaloSize,
                    height: fabHaloSize,
                    borderRadius: fabHaloSize / 2,
                    top: (fabSize - fabHaloSize) / 2,
                    left: (fabSize - fabHaloSize) / 2,
                  },
                ]}
              />
            )}
            <Ionicons
              name={isFabOpen ? 'close' : 'add'}
              size={fabIconSize}
              color={isFabOpen ? '#3c2ba7' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {isFabMenuMounted && (
          <AnimatedPressable
            style={[styles.overlay, { opacity: overlayOpacity }]}
            onPress={closeFabMenu}
            accessibilityRole="button"
            accessibilityLabel="Close add menu"
            pointerEvents="auto"
            accessibilityHint="Tap to dismiss the add options"
          >
          </AnimatedPressable>
        )}

        {isFabMenuMounted && (
          <Animated.View
            pointerEvents={isFabOpen ? 'auto' : 'none'}
            style={[
              styles.fabActionsContainer,
              {
                bottom: insets.bottom + fabSize / 2 + cardVerticalOffset,
                opacity: actionsOpacity,
                transform: [
                  { scale: actionsScale },
                  { translateY: actionsTranslateY },
                ],
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.fabActionsRow}>
              <TouchableOpacity
                style={[
                  styles.fabCard,
                  {
                    width: cardSize,
                    height: cardSize,
                    borderRadius: cardBorderRadius,
                    marginHorizontal: cardSpacing / 2,
                    transform: [{ rotate: '-7deg' }],
                    borderWidth: isCompact ? 4 : 5,
                    borderColor: '#ffffff',
                  },
                ]}
                onPress={handleAddHabit}
                accessibilityRole="button"
                accessibilityLabel="Add habit"
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#C084FC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.fabCardBackground,
                    {
                      borderRadius: cardBorderRadius,
                      paddingHorizontal: cardSize * 0.14,
                      paddingVertical: isCompact ? 18 : 22,
                    },
                  ]}
                >
                  <View style={styles.fabCardContent}>
                    <Image
                      source={habitImage}
                      style={[
                        styles.fabCardIcon,
                        {
                          width: cardIconSize,
                          height: cardIconSize,
                          marginBottom: isCompact ? 12 : 14,
                        },
                      ]}
                      resizeMode="contain"
                      accessible
                      accessibilityLabel="Illustration of adding a habit"
                    />
                    <Text
                      style={[
                        styles.fabCardTitle,
                        {
                          fontSize: isCompact ? 16 : 17,
                          marginBottom: isCompact ? 6 : 8,
                        },
                      ]}
                    >
                      Add habit
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        {
                          fontSize: isCompact ? 12 : 13,
                          lineHeight: isCompact ? 18 : 20,
                        },
                      ]}
                    >
                      {`Add a new routine\nto your life`}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fabCard,
                  {
                    width: cardSize,
                    height: cardSize,
                    borderRadius: cardBorderRadius,
                    marginHorizontal: cardSpacing / 2,
                    transform: [{ rotate: '7deg' }],
                    borderWidth: isCompact ? 4 : 5,
                    borderColor: '#ffffff',
                  },
                ]}
                onPress={handleAddReflection}
                accessibilityRole="button"
                accessibilityLabel="Add reflection"
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#F59E0B', '#FDE047']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.fabCardBackground,
                    {
                      borderRadius: cardBorderRadius,
                      paddingHorizontal: cardSize * 0.14,
                      paddingVertical: isCompact ? 18 : 22,
                    },
                  ]}
                >
                  <View style={styles.fabCardContent}>
                    <Image
                      source={reflectionImage}
                      style={[
                        styles.fabCardIcon,
                        {
                          width: cardIconSize,
                          height: cardIconSize,
                          marginBottom: isCompact ? 12 : 14,
                        },
                      ]}
                      resizeMode="contain"
                      accessible
                      accessibilityLabel="Illustration of adding a reflection"
                    />
                    <Text
                      style={[
                        styles.fabCardTitle,
                        {
                          fontSize: isCompact ? 16 : 17,
                          marginBottom: isCompact ? 6 : 8,
                        },
                      ]}
                    >
                      Add reflection
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        {
                          fontSize: isCompact ? 12 : 13,
                          lineHeight: isCompact ? 18 : 20,
                        },
                      ]}
                    >
                      {`Reflect on your day\nwith your mood and feelings`}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
      <TaskDetailModal
        visible={Boolean(activeTaskForSelectedDate)}
        task={activeTaskForSelectedDate}
        dateKey={selectedDateKey}
        onClose={closeTaskDetail}
        onToggleSubtask={handleToggleSubtask}
        onToggleCompletion={(taskId) => handleToggleTaskCompletion(taskId, selectedDateKey)}
        onEdit={(taskId) => {
          const taskToEdit = tasks.find((task) => task.id === taskId);
          if (!taskToEdit) {
            return;
          }
          const editable = {
            ...taskToEdit,
            startDate: taskToEdit.date,
            subtasks: taskToEdit.subtasks?.map((subtask) => subtask.title) ?? [],
          };
          openHabitSheet('edit', editable);
          closeTaskDetail();
        }}
      />
      <AddHabitSheet
        visible={isHabitSheetOpen}
        onClose={handleCloseCreateHabit}
        onCreate={(habit) => {
          handleCreateHabit(habit);
          handleCloseCreateHabit();
        }}
        onUpdate={(habit) => {
          if (habitSheetInitialTask) {
            handleUpdateHabit(habitSheetInitialTask.id, habit);
          }
          handleCloseCreateHabit();
        }}
        mode={habitSheetMode}
        initialHabit={habitSheetInitialTask}
      />
    </View>
  );
}

function SwipeableTaskCard({
  task,
  backgroundColor,
  borderColor,
  totalSubtasks,
  completedSubtasks,
  onPress,
  onToggleCompletion,
  onCopy,
  onDelete,
  onEdit,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionWidth = 168;
  const [isOpen, setIsOpen] = useState(false);
  const currentOffsetRef = useRef(0);

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentOffsetRef.current = value;
    });
    return () => {
      translateX.removeListener(id);
    };
  }, [translateX]);

  const closeActions = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => setIsOpen(false));
  }, [translateX]);

  const handlePanRelease = useCallback(() => {
    const clampedValue = Math.min(0, Math.max(-actionWidth, currentOffsetRef.current));
    const shouldOpen = clampedValue <= -actionWidth * 0.5;
    const targetValue = shouldOpen ? -actionWidth : 0;

    setIsOpen(shouldOpen);
    currentOffsetRef.current = targetValue;

    Animated.spring(translateX, {
      toValue: targetValue,
      damping: 20,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [actionWidth, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 6 && Math.abs(gesture.dy) < 10,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dx < 0) {
            translateX.setValue(Math.max(-actionWidth, gesture.dx));
          } else if (isOpen) {
            translateX.setValue(Math.min(0, -actionWidth + gesture.dx));
          }
        },
        onPanResponderRelease: () => {
          handlePanRelease();
        },
        onPanResponderTerminate: () => {
          handlePanRelease();
        },
      }),
    [actionWidth, handlePanRelease, isOpen, translateX]
  );

  const handlePress = useCallback(() => {
    if (isOpen) {
      closeActions();
      return;
    }
    onPress?.();
  }, [closeActions, isOpen, onPress]);

  const handleAction = useCallback(
    (callback) => {
      closeActions();
      if (callback) {
        triggerSelection();
        callback();
      }
    },
    [closeActions]
  );

  const totalLabel = useMemo(() => {
    if (!totalSubtasks) {
      return null;
    }
    return `${completedSubtasks}/${totalSubtasks}`;
  }, [completedSubtasks, totalSubtasks]);

  return (
    <View style={styles.swipeableWrapper}>
      <View style={styles.swipeableActions}>
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionCopy]}
          onPress={() => handleAction(onCopy)}
          accessibilityRole="button"
          accessibilityLabel="Copy task"
        >
          <Ionicons name="copy-outline" size={18} color="#3c2ba7" />
          <Text style={styles.swipeActionText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionDelete]}
          onPress={() => handleAction(onDelete)}
          accessibilityRole="button"
          accessibilityLabel="Delete task"
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={[styles.swipeActionText, styles.swipeActionTextDelete]}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.taskCard,
          {
            backgroundColor,
            borderColor,
            transform: [{ translateX }],
          },
        ]}
      >
        <Pressable style={styles.taskCardContent} onPress={handlePress}>
          <View style={styles.taskInfo}>
            <Text style={styles.taskEmoji}>{task.emoji}</Text>
            <View style={styles.taskDetails}>
              <Text
                style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
                numberOfLines={1}
              >
                {task.title}
              </Text>
              <Text style={styles.taskTime}>{formatTaskTime(task.time)}</Text>
              {totalLabel && (
                <View style={styles.taskSubtaskSummary}>
                  <Text style={styles.taskSubtaskSummaryText}>{totalLabel}</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={() => handleAction(onToggleCompletion)}
          style={[styles.taskToggle, task.completed && styles.taskToggleCompleted]}
          accessibilityRole="checkbox"
          accessibilityLabel={task.completed ? 'Mark task as incomplete' : 'Mark task as complete'}
          accessibilityState={{ checked: task.completed }}
        >
          {task.completed && <Ionicons name="checkmark" size={18} color="#ffffff" />}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function TaskDetailModal({
  visible,
  task,
  dateKey,
  onClose,
  onToggleSubtask,
  onToggleCompletion,
  onEdit,
}) {
  if (!visible || !task) {
    return null;
  }

  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
  const completedSubtasks = Array.isArray(task.subtasks)
    ? task.subtasks.filter((item) => getSubtaskCompletionStatus(item, dateKey)).length
    : 0;
  const cardBackground = lightenColor(task.color, 0.85);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.detailOverlay}>
        <Pressable style={styles.detailBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.detailCardContainer}>
          <View style={[styles.detailCard, { backgroundColor: cardBackground, borderColor: task.color }]}>
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailHeaderInfo}>
                <Text style={styles.detailEmoji}>{task.emoji}</Text>
                <View style={styles.detailTitleContainer}>
                  <Text style={styles.detailTitle}>{task.title}</Text>
                  <Text style={styles.detailTime}>{formatTaskTime(task.time)}</Text>
                  {totalSubtasks > 0 && (
                    <Text style={styles.detailSubtaskSummaryLabel}>
                      {completedSubtasks}/{totalSubtasks} subtasks completed
                    </Text>
                  )}
                </View>
              </View>
              <Pressable
                onPress={() => {
                  onToggleCompletion?.(task.id);
                }}
                style={[styles.detailToggle, task.completed && styles.detailToggleCompleted]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.completed }}
                accessibilityLabel={
                  task.completed ? 'Mark task as incomplete' : 'Mark task as complete'
                }
              >
                {task.completed && <Ionicons name="checkmark" size={18} color="#fff" />}
              </Pressable>
            </View>
            <ScrollView style={styles.detailSubtasksContainer}>
              {totalSubtasks === 0 ? (
                <Text style={styles.detailEmptySubtasks}>No subtasks added yet.</Text>
              ) : (
                task.subtasks.map((subtask) => (
                  <Pressable
                    key={subtask.id}
                    style={styles.detailSubtaskRow}
                    onPress={() => onToggleSubtask?.(task.id, subtask.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: getSubtaskCompletionStatus(subtask, dateKey) }}
                    accessibilityLabel={
                      getSubtaskCompletionStatus(subtask, dateKey)
                        ? `Mark ${subtask.title} as incomplete`
                        : `Mark ${subtask.title} as complete`
                    }
                  >
                    <View
                      style={[
                        styles.detailSubtaskIndicator,
                        getSubtaskCompletionStatus(subtask, dateKey) &&
                          styles.detailSubtaskIndicatorCompleted,
                      ]}
                    >
                      {getSubtaskCompletionStatus(subtask, dateKey) && (
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.detailSubtaskText,
                        getSubtaskCompletionStatus(subtask, dateKey) &&
                          styles.detailSubtaskTextCompleted,
                      ]}
                    >
                      {subtask.title}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable
              style={styles.detailEditLink}
              onPress={() => onEdit?.(task.id)}
              accessibilityRole="button"
              accessibilityLabel="Edit task"
            >
              <Ionicons name="create-outline" size={18} color="#3c2ba7" />
              <Text style={styles.detailEditButtonText}>Edit Task</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      } catch {
        // Orientation lock best effort only
      }
    };

    void lockOrientation();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScheduleApp />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6fb',
    position: 'relative',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f6fb',
  },
  appFrame: {
    flex: 1,
    backgroundColor: '#f6f6fb',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    color: '#4b4b63',
  },
  todayContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  todayHeader: {
    marginBottom: 24,
  },
  todayTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  todaySubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  todaySubtitleSuccess: {
    color: '#2f9e44',
  },
  todaySubtitleInProgress: {
    color: '#6f7a86',
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  tagFilterContainer: {
    marginBottom: 16,
  },
  tagFilterScroll: {
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#edefff',
  },
  tagPillSelected: {
    backgroundColor: '#3c2ba7',
  },
  tagPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3c2ba7',
  },
  tagPillTextSelected: {
    color: '#ffffff',
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#9ba0b0',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dayLabelSelected: {
    color: '#3c2ba7',
  },
  dayNumber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e7f6e6',
    position: 'relative',
  },
  dayNumberSelected: {
    backgroundColor: '#f0faee',
  },
  dayNumberCompleted: {
    backgroundColor: '#3dd598',
  },
  dayNumberText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  dayNumberTextSelected: {
    color: '#2f2a6f',
  },
  dayNumberTextCompleted: {
    color: '#ffffff',
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 6,
    width: '54%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#3c2ba7',
  },
  todayIndicatorOnCompleted: {
    backgroundColor: '#ffffff',
  },
  tasksSection: {
    marginTop: 8,
  },
  tasksList: {
    paddingBottom: 4,
  },
  emptyState: {
    fontSize: 15,
    color: '#6f7a86',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  emptyStateIllustration: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e7e9f8',
    borderWidth: 1,
    borderColor: '#d7dbeb',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  swipeableWrapper: {
    marginBottom: 14,
    position: 'relative',
  },
  swipeableActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 168,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4fb',
  },
  swipeActionButton: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#eef1ff',
  },
  swipeActionCopy: {
    backgroundColor: '#eef1ff',
  },
  swipeActionDelete: {
    backgroundColor: '#ff6b6b',
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a2e',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  swipeActionTextDelete: {
    color: '#ffffff',
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskCardContent: {
    flex: 1,
    paddingRight: 12,
  },
  taskEmoji: {
    fontSize: 28,
  },
  taskDetails: {
    marginLeft: 12,
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  taskTitleCompleted: {
    color: '#6f7a86',
    textDecorationLine: 'line-through',
  },
  taskTime: {
    marginTop: 4,
    fontSize: 13,
    color: '#6f7a86',
  },
  taskSubtaskSummary: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7dbeb',
  },
  taskSubtaskSummaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3c2ba7',
  },
  taskToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#c5cadb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  taskToggleCompleted: {
    backgroundColor: '#3dd598',
    borderColor: '#3dd598',
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 11, 30, 0.45)',
    justifyContent: 'flex-end',
  },
  detailBackdrop: {
    flex: 1,
  },
  detailCardContainer: {
    padding: 20,
  },
  detailCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailEmoji: {
    fontSize: 36,
  },
  detailTitleContainer: {
    marginLeft: 12,
    flex: 1,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  detailTime: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#4b4b63',
  },
  detailSubtaskSummaryLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#3c2ba7',
    fontWeight: '600',
  },
  detailToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#c5cadb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  detailToggleCompleted: {
    backgroundColor: '#3dd598',
    borderColor: '#3dd598',
  },
  detailSubtasksContainer: {
    maxHeight: 260,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  detailEmptySubtasks: {
    fontSize: 14,
    color: '#6f7a86',
  },
  detailSubtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#d9dcea',
  },
  detailSubtaskIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#c5cadb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: '#ffffff',
  },
  detailSubtaskIndicatorCompleted: {
    backgroundColor: '#3dd598',
    borderColor: '#3dd598',
  },
  detailSubtaskText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a2e',
  },
  detailSubtaskTextCompleted: {
    color: '#6f7a86',
    textDecorationLine: 'line-through',
  },
  detailEditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  detailEditButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3c2ba7',
  },
  calendarListContent: {
    paddingBottom: 60,
    gap: 12,
  },
  calendarMonthSection: {
    marginBottom: 24,
  },
  calendarMonthSeparator: {
    height: 12,
    backgroundColor: '#000000',
    borderRadius: 6,
    marginBottom: 12,
  },
  calendarMonthContainer: {
    marginBottom: 20,
  },
  calendarMonthHeader: {
    height: 120,
    backgroundColor: '#000',
    justifyContent: 'flex-end',
    padding: 16,
    borderRadius: 12,
  },
  calendarMonthTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCellWrapper: {
    width: CALENDAR_DAY_SIZE,
    height: CALENDAR_DAY_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  calendarSuccessCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#a2e76f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBarContainer: {
    width: '100%',
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
    borderTopWidth: 0,
  },
  bottomBarDimmed: {
    opacity: 0.4,
  },
  tabGroup: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  tabLabel: {
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  activeColor: {
    color: '#1a1a2e',
  },
  inactiveColor: {
    color: '#6f7a86',
  },
  addButton: {
    position: 'absolute',
    top: -32,
    alignSelf: 'center',
    backgroundColor: '#3c2ba7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 12,
    zIndex: 12,
    overflow: 'visible',
  },
  addButtonActive: {
    backgroundColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
    gap: 8,
  },
  placeholderIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f0efff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  placeholderDescription: {
    textAlign: 'center',
    marginTop: 2,
  },
  addButtonBase: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
    zIndex: -1,
  },
  addButtonHalo: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: -2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 10,
    overflow: 'hidden',
  },
  fabActionsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  fabActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  fabCard: {
    overflow: 'visible',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 14,
  },
  fabCardBackground: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  fabCardContent: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  fabCardTitle: {
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  fabCardSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  fabCardIcon: {
    alignSelf: 'center',
  },
});
