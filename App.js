import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Easing,
  Platform,
  Image,
  LayoutAnimation,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import {
  addMonths as addMonthsDateFns,
  eachDayOfInterval,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  getWeeksInMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  loadHistory,
  loadMonthImages,
  loadTasks,
  loadUserSettings,
  saveHistory,
  saveMonthImages,
  saveTasks,
  saveUserSettings,
} from './storage';
import AddHabitSheet from './components/AddHabitSheet';
import { DEFAULT_USER_SETTINGS } from './constants/userSettings';
import { getNavigationBarThemeForTab } from './constants/navigation';
import { lightenColor } from './utils/colorUtils';
import {
  getDateKey,
  getMonthId,
  getMonthStart,
  normalizeDateValue,
  shouldTaskAppearOnDate,
} from './utils/dateUtils';
import { clampValue } from './utils/mathUtils';
import {
  getSubtaskCompletionStatus,
  getTaskCompletionStatus,
  getTaskTagDisplayLabel,
  normalizeTaskTagKey,
  isPassiveTaskType,
  isReminderExpiredForDate,
  shouldCountTaskTowardsCompletion,
  normalizeRepeatConfig,
} from './utils/taskUtils';
import { getTimerTotalSeconds, toMinutes } from './utils/timeUtils';
import { getWeekdayInitials, translations } from './constants/i18n';
import { styles } from './styles/appStyles';
import {
  NOTIFICATIONS_SUPPORTED,
  REMINDER_OFFSETS,
  USE_NATIVE_DRIVER,
} from './constants/app';
import {
  triggerImpact,
  triggerSelection,
  triggerSuccessFeedback,
} from './utils/feedbackUtils';
import { AnimatedPressable } from './components/animatedComponents';
import ConfettiOverlay from './components/ConfettiOverlay';
import StickyMonthHeader from './components/StickyMonthHeader';
import CalendarMonthItem from './components/CalendarMonthItem';
import CustomizeCalendarModal from './components/CustomizeCalendarModal';
import DayReportModal from './components/DayReportModal';
import TaskDetailModal from './components/TaskDetailModal';
import ProfileTaskDetailModal from './components/ProfileTaskDetailModal';
import ActivityTimelineModal from './components/ActivityTimelineModal';
import ProfileTasksModal from './components/ProfileTasksModal';
import SwipeableTaskCard from './components/SwipeableTaskCard';
import { CALENDAR_DAY_SIZE } from './constants/layout';


const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');

const buildCalendarMonthItem = (id, baseDate) => {
  const date = getMonthStart(baseDate);
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });

  return {
    id,
    date,
    monthId: getMonthId(date),
    monthIndex: date.getMonth(),
    days,
  };
};

// Versões antigas salvavam a URI do cache do ImagePicker direto; o Android
// limpa esse cache e as imagens somem. Na abertura, resgatamos o que ainda
// existe copiando para o documentDirectory (permanente). Se o arquivo já foi
// apagado, a URI vira null para o app voltar ao emoji em vez de imagem quebrada.
const isVolatileCacheUri = (uri) =>
  typeof uri === 'string' && uri.startsWith('file://') && uri.includes('/cache/');

const rescueCachedImage = async (uri, prefix) => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return null;
    }
    const extension = uri.split('.').pop().split(/[#?]/)[0] || 'jpg';
    const destination = `${FileSystem.documentDirectory}${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.${extension}`;
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch (error) {
    console.warn('Failed to rescue cached image', error);
    return uri;
  }
};

const migrateCachedImages = async (storedTasks, storedImages) => {
  let tasks = storedTasks;
  let images = storedImages;

  if (Array.isArray(storedTasks)) {
    tasks = await Promise.all(
      storedTasks.map(async (task) => {
        if (!isVolatileCacheUri(task?.customImage)) {
          return task;
        }
        const rescuedUri = await rescueCachedImage(task.customImage, 'custom_habit_icon');
        return rescuedUri === task.customImage ? task : { ...task, customImage: rescuedUri };
      })
    );
  }

  if (storedImages && typeof storedImages === 'object') {
    const entries = await Promise.all(
      Object.entries(storedImages).map(async ([key, uri]) => {
        if (!isVolatileCacheUri(uri)) {
          return [key, uri];
        }
        return [key, await rescueCachedImage(uri, `custom_month_${key}`)];
      })
    );
    images = Object.fromEntries(entries);
  }

  return { tasks, images };
};

// Apaga imagens nossas (custom_habit_icon_*/custom_month_*) que nenhuma tarefa
// ou mês referencia mais — ex.: tarefa deletada, imagem trocada ou criação
// cancelada. Só roda quando tasks E images carregaram com sucesso.
const cleanupOrphanImageFiles = async (storedTasks, storedImages) => {
  try {
    const dir = FileSystem.documentDirectory;
    if (!dir) {
      return;
    }
    const referenced = new Set();
    (storedTasks ?? []).forEach((task) => {
      if (typeof task?.customImage === 'string') {
        referenced.add(task.customImage.split('/').pop());
      }
    });
    Object.values(storedImages ?? {}).forEach((uri) => {
      if (typeof uri === 'string') {
        referenced.add(uri.split('/').pop());
      }
    });
    const fileNames = await FileSystem.readDirectoryAsync(dir);
    const orphans = fileNames.filter(
      (name) =>
        (name.startsWith('custom_habit_icon_') || name.startsWith('custom_month_')) &&
        !referenced.has(name)
    );
    await Promise.all(
      orphans.map((name) =>
        FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(() => {})
      )
    );
  } catch (error) {
    console.warn('Failed to clean up orphan images', error);
  }
};

if (NOTIFICATIONS_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}




function ScheduleApp() {
  const [userSettings, setUserSettings] = useState(DEFAULT_USER_SETTINGS);
  const [activeTab, setActiveTab] = useState(DEFAULT_USER_SETTINGS.activeTab);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabMenuMounted, setIsFabMenuMounted] = useState(false);
  const [isHabitSheetOpen, setIsHabitSheetOpen] = useState(false);
  const [habitSheetMode, setHabitSheetMode] = useState('create');
  const [habitSheetInitialTask, setHabitSheetInitialTask] = useState(null);
  const [isCustomizeCalendarOpen, setCustomizeCalendarOpen] = useState(false);
  const [isProfileTasksOpen, setProfileTasksOpen] = useState(false);
  const [isActivityOpen, setActivityOpen] = useState(false);
  const [isLanguageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [tasks, setTasks] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeProfileTaskId, setActiveProfileTaskId] = useState(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState(
    DEFAULT_USER_SETTINGS.selectedTagFilter
  );
  const language = userSettings.language ?? DEFAULT_USER_SETTINGS.language;
  const t = translations[language] ?? translations.en;
  const [history, setHistory] = useState([]);
  const [customMonthImages, setCustomMonthImages] = useState({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const saveTimeoutRef = useRef(null);
  const settingsSaveTimeoutRef = useRef(null);
  const historySaveTimeoutRef = useRef(null);
  // Marca quais stores falharam ao carregar, p/ não sobrescrever dado bom com estado vazio
  const loadFailuresRef = useRef({});
  // Espelhos do estado mais recente p/ flush imediato quando o app vai pra background
  const tasksRef = useRef(null);
  const userSettingsRef = useRef(null);
  const historyRef = useRef(null);
  const isHydratedRef = useRef(false);
  const taskPositionsRef = useRef(new Map());
  const taskAnimationsRef = useRef(new Map());
  const [calendarMonths, setCalendarMonths] = useState(() => {
    const today = new Date();
    const months = [];

    for (let i = -12; i <= 12; i++) {
      months.push(buildCalendarMonthItem(i, addMonthsDateFns(today, i)));
    }

    return months;
  });
  const [visibleCalendarDate, setVisibleCalendarDate] = useState(new Date());
  const initialCalendarIndex = useMemo(() => {
    const todayId = getMonthId(new Date());
    return calendarMonths.findIndex((month) => getMonthId(month.date) === todayId);
  }, [calendarMonths]);
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
  const cardVerticalOffset = isCompact ? 200 : 230;
  const fabHaloSize = fabSize + (isCompact ? 26 : 30);
  const fabBaseSize = fabSize + (isCompact ? 14 : 18);
  const fabIconSize = isCompact ? 28 : 30;
  const HEADER_HEIGHT = 100;
  const MARGINS = 30;
  const BASE_HEIGHT = HEADER_HEIGHT + MARGINS;
  const buildMonthLayouts = useCallback((months) => {
    let currentOffset = 0;
    const layouts = months.map((month, index) => {
      const weeks = getWeeksInMonth(month.date);
      const length = BASE_HEIGHT + weeks * CALENDAR_DAY_SIZE;
      const layout = { length, offset: currentOffset, index };
      currentOffset += length;
      return layout;
    });

    return layouts;
  }, [BASE_HEIGHT]);
  const monthLayouts = useMemo(() => {
    return buildMonthLayouts(calendarMonths);
  }, [buildMonthLayouts, calendarMonths]);
  const monthLayoutsRef = useRef(monthLayouts);
  useEffect(() => {
    monthLayoutsRef.current = monthLayouts;
  }, [monthLayouts]);

  const getItemLayout = useCallback(
    (data, index) => {
      const cachedLayout = monthLayoutsRef.current[index];
      if (cachedLayout) {
        return cachedLayout;
      }
      if (!data?.[index]) {
        return { length: 0, offset: 0, index };
      }
      const previousLayout = monthLayoutsRef.current[index - 1];
      const offset = previousLayout ? previousLayout.offset + previousLayout.length : 0;
      const weeks = getWeeksInMonth(data[index].date);
      const length = BASE_HEIGHT + weeks * CALENDAR_DAY_SIZE;
      const layout = { length, offset, index };
      monthLayoutsRef.current[index] = layout;
      return layout;
    },
    [BASE_HEIGHT]
  );
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const selectedDateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);

  useEffect(() => {
    // currentTime só decide expiração de lembretes (granularidade de minuto).
    // Devolver o mesmo objeto enquanto o minuto não muda evita re-renderizar
    // o app inteiro a cada segundo.
    const timerId = setInterval(() => {
      setCurrentTime((previous) => {
        const now = new Date();
        return Math.floor(now.getTime() / 60000) === Math.floor(previous.getTime() / 60000)
          ? previous
          : now;
      });
    }, 10000);

    return () => clearInterval(timerId);
  }, []);

  const isSelectedToday = selectedDateKey === todayKey;
  const selectedDateLabel = useMemo(() => {
    if (isSelectedToday) {
      return t.tabs.today;
    }
    const locale = language === 'pt' ? 'pt-BR' : 'en-US';
    const weekday = selectedDate.toLocaleDateString(locale, { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }, [isSelectedToday, language, selectedDate, t.tabs.today]);
  const selectedDateEyebrow = useMemo(() => {
    const locale = language === 'pt' ? 'pt-BR' : 'en-US';
    return selectedDate
      .toLocaleDateString(locale, { day: 'numeric', month: 'long' })
      .toUpperCase();
  }, [language, selectedDate]);
  useEffect(() => {
    const monthStart = getMonthStart(selectedDate);
    setCalendarMonths((previous) => {
      const exists = previous.some(({ date }) => getMonthId(date) === getMonthId(monthStart));
      if (exists) {
        return previous;
      }
      const nextId = previous.reduce((max, month) => Math.max(max, month.id), -1) + 1;
      const updated = [...previous, buildCalendarMonthItem(nextId, monthStart)];
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
      const scoredTasks = dayTasks.filter(shouldCountTaskTowardsCompletion);
      const allCompleted =
        scoredTasks.length > 0 &&
        scoredTasks.every((task) => getTaskCompletionStatus(task, key));
      return {
        date,
        key,
        label: getWeekdayInitials(language)[date.getDay()],
        dayNumber: date.getDate(),
        allCompleted,
      };
    });
  }, [language, tasks, today]);
  // Cache persistente do status dos dias do calendário. Antes, qualquer
  // mudança em tasks (ou mês novo no scroll) recalculava TODOS os meses ×
  // dias × tarefas, mesmo fora da aba calendário — era a fonte das travadas.
  // Agora: fora da aba devolve o último resultado sem calcular nada; dentro
  // da aba, dias já calculados vêm do cache (só o mês novo é computado).
  const calendarStatusStoreRef = useRef({
    tasksRef: null,
    dayStatusCache: new Map(),
    lastResult: { calendarDayStatusByKey: {}, calendarMonthStatusSignatureById: {} },
  });
  const isCalendarTabActive = activeTab === 'calendar';
  const { calendarDayStatusByKey, calendarMonthStatusSignatureById } = useMemo(() => {
    const store = calendarStatusStoreRef.current;
    if (store.tasksRef !== tasks) {
      store.tasksRef = tasks;
      store.dayStatusCache.clear();
    }
    if (!isCalendarTabActive) {
      return store.lastResult;
    }

    const dayStatusByKey = {};
    const monthStatusSignatureById = {};

    const resolveDayStatus = (day) => {
      const dateKey = getDateKey(day);
      const cached = store.dayStatusCache.get(dateKey);
      if (cached !== undefined) {
        dayStatusByKey[dateKey] = cached;
        return cached;
      }
      const dayTasks = tasks.filter((task) => shouldTaskAppearOnDate(task, day));
      const scoredTasks = dayTasks.filter(shouldCountTaskTowardsCompletion);
      const allCompleted =
        scoredTasks.length > 0 &&
        scoredTasks.every((task) => getTaskCompletionStatus(task, dateKey));
      const status = allCompleted ? 'success' : 'pending';
      store.dayStatusCache.set(dateKey, status);
      dayStatusByKey[dateKey] = status;
      return status;
    };

    calendarMonths.forEach((month) => {
      const signature = month.days
        .map((day) => {
          const status = resolveDayStatus(day);
          return `${getDateKey(day)}:${status}`;
        })
        .join('|');
      monthStatusSignatureById[month.monthId] = signature;
    });

    const result = {
      calendarDayStatusByKey: dayStatusByKey,
      calendarMonthStatusSignatureById: monthStatusSignatureById,
    };
    store.lastResult = result;
    return result;
  }, [calendarMonths, isCalendarTabActive, tasks]);

  const reportTasks = useMemo(() => {
    if (!reportDate) return [];
    const dateKey = getDateKey(reportDate);

    return tasks
      .filter((task) => shouldTaskAppearOnDate(task, reportDate))
      .map((task) => {
        const isCompleted = getTaskCompletionStatus(task, dateKey);

        const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
        const totalSubtasks = subtasks.length;
        const completedSubtasks = subtasks.filter((s) => getSubtaskCompletionStatus(s, dateKey)).length;

        return {
          ...task,
          completed: isCompleted,
          totalSubtasks,
          completedSubtasks,
        };
      });
  }, [reportDate, tasks]);

  const appendHistoryEntry = useCallback((type, details = {}) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    setHistory((previous) => [entry, ...previous].slice(0, 200));
  }, []);

  const handleOpenReport = useCallback((date) => {
    setReportDate(date);
  }, []);
  const handleOpenProfileTasks = useCallback(() => {
    setProfileTasksOpen(true);
  }, []);
  const handleCloseProfileTasks = useCallback(() => {
    setProfileTasksOpen(false);
    setActiveProfileTaskId(null);
  }, []);
  const handleDeleteProfileTasks = useCallback(
    (taskIds) => {
      const tasksToDelete = tasks.filter((task) => taskIds.includes(task.id));
      tasksToDelete.forEach((task) => {
        void cancelTaskReminder(task.notificationId);
        if (!task.profileLocked) {
          appendHistoryEntry('task_deleted', { taskId: task.id, title: task.title });
        }
      });
      setTasks((previous) =>
        previous.filter((task) => task.profileLocked || !taskIds.includes(task.id))
      );
      setActiveProfileTaskId((current) => (taskIds.includes(current) ? null : current));
    },
    [appendHistoryEntry, cancelTaskReminder, tasks]
  );
  const handleDeleteProfileTask = useCallback(
    (taskId) => {
      handleDeleteProfileTasks([taskId]);
    },
    [handleDeleteProfileTasks]
  );
  const handleToggleProfileTaskLock = useCallback((taskId) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId
          ? { ...task, profileLocked: !task.profileLocked }
          : task
      )
    );
  }, []);

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
      return [...previous, buildCalendarMonthItem(nextId, nextMonthDate)];
    });
  }, []);

  const renderCalendarMonth = useCallback(
    ({ item }) => (
      <CalendarMonthItem
        item={item}
        dayStatusByKey={calendarDayStatusByKey}
        onDayPress={handleOpenReport}
        customImages={customMonthImages}
        language={language}
        monthStatusSignature={calendarMonthStatusSignatureById[item.monthId]}
        todayKey={todayKey}
      />
    ),
    [calendarDayStatusByKey, calendarMonthStatusSignatureById, customMonthImages, handleOpenReport, language, todayKey]
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
  const availableTagOptions = useMemo(() => {
    const seen = new Set();
    return tasks.reduce((options, task) => {
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
  }, [tasks]);
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
    if (
      selectedTagFilter !== 'all' &&
      availableTagOptions.length > 0 &&
      !availableTagOptions.some((option) => option.key === selectedTagFilter)
    ) {
      setSelectedTagFilter('all');
      updateUserSettings({ selectedTagFilter: 'all' });
    }
  }, [availableTagOptions, selectedTagFilter, updateUserSettings]);
  const visibleTasks = useMemo(() => {
    if (selectedTagFilter === 'all') {
      return tasksForSelectedDate;
    }
    return tasksForSelectedDate.filter((task) => normalizeTaskTagKey(task) === selectedTagFilter);
  }, [selectedTagFilter, tasksForSelectedDate]);
  const visibleTasksForSelectedDay = useMemo(
    () =>
      visibleTasks.map((task) => {
        // Lembrete expirado conta como "resolvido" para ordenação/progresso,
        // mas ganha a flag `missed` para o card mostrar o visual de perdido.
        const missed = isReminderExpiredForDate(task, selectedDate, currentTime);
        return {
          ...task,
          completed: getTaskCompletionStatus(task, selectedDateKey) || missed,
          missed,
        };
      }),
    [currentTime, selectedDate, selectedDateKey, visibleTasks]
  );
  const sortedVisibleTasksForSelectedDay = useMemo(() => {
    const incomplete = [];
    const completed = [];

    visibleTasksForSelectedDay.forEach((task) => {
      if (task.completed) {
        completed.push(task);
      } else {
        incomplete.push(task);
      }
    });

    return [...incomplete, ...completed];
  }, [visibleTasksForSelectedDay]);
  const getTaskTranslateY = useCallback(
    (taskId) => {
      if (!taskAnimationsRef.current.has(taskId)) {
        taskAnimationsRef.current.set(taskId, new Animated.Value(0));
      }
      return taskAnimationsRef.current.get(taskId);
    },
    []
  );
  const handleTaskLayout = useCallback(
    (taskId, event) => {
      const { y } = event.nativeEvent.layout;
      const previousY = taskPositionsRef.current.get(taskId);
      taskPositionsRef.current.set(taskId, y);
      if (previousY === undefined || previousY === y) {
        return;
      }
      const translateY = getTaskTranslateY(taskId);
      translateY.stopAnimation();
      translateY.setValue(previousY - y);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },
    [getTaskTranslateY]
  );
  // Cache de identidade: tasks não alteradas devolvem o MESMO objeto de stats
  // entre renders, permitindo que o React.memo dos cards pule o re-render.
  const taskStatsCacheRef = useRef(new WeakMap());
  const visibleTasksWithStats = useMemo(
    () =>
      sortedVisibleTasksForSelectedDay.map((task) => {
        const cached = taskStatsCacheRef.current.get(task);
        if (cached && cached.dateKey === selectedDateKey) {
          return cached.value;
        }
        const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
        const completedSubtasks = Array.isArray(task.subtasks)
          ? task.subtasks.filter((item) => getSubtaskCompletionStatus(item, selectedDateKey)).length
          : 0;

        const value = {
          ...task,
          totalSubtasks,
          completedSubtasks,
          backgroundColor: lightenColor(task.color, 0.75),
          borderColor: task.color,
        };
        taskStatsCacheRef.current.set(task, { dateKey: selectedDateKey, value });
        return value;
      }),
    [selectedDateKey, sortedVisibleTasksForSelectedDay]
  );
  const profileTasks = useMemo(() => {
    const getSortDate = (task) => {
      const normalized = normalizeDateValue(task.date ?? task.dateKey);
      return normalized ? normalized.getTime() : Number.MAX_SAFE_INTEGER;
    };
    const getSortTime = (task) => {
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
    return tasks
      .slice()
      .sort((a, b) => getSortDate(a) - getSortDate(b) || getSortTime(a) - getSortTime(b));
  }, [tasks]);
  const scorableTasksForSelectedDate = useMemo(
    () => tasksForSelectedDate.filter(shouldCountTaskTowardsCompletion),
    [tasksForSelectedDate]
  );
  const allTasksCompletedForSelectedDay =
    scorableTasksForSelectedDate.length > 0 &&
    scorableTasksForSelectedDate.every((task) => getTaskCompletionStatus(task, selectedDateKey));
  const completedTaskCount = useMemo(
    () =>
      scorableTasksForSelectedDate.filter((task) => getTaskCompletionStatus(task, selectedDateKey))
        .length,
    [scorableTasksForSelectedDate, selectedDateKey]
  );
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const previousCompletionRef = useRef(false);
  const handleConfettiComplete = useCallback(() => {
    setShowConfetti(false);
  }, []);

  useEffect(() => {
    previousCompletionRef.current = allTasksCompletedForSelectedDay;
    if (!allTasksCompletedForSelectedDay) {
      return undefined;
    }
    // Adia a montagem do confete p/ depois do frame da conclusão (re-render da
    // lista + animação do card); montar tudo junto causava uma travada leve.
    void triggerSuccessFeedback();
    const timeoutId = setTimeout(() => {
      setConfettiKey((previous) => previous + 1);
      setShowConfetti(true);
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [allTasksCompletedForSelectedDay]);

  useEffect(() => {
    previousCompletionRef.current = false;
  }, [selectedDateKey]);
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks]
  );
  const activeProfileTask = useMemo(
    () => tasks.find((task) => task.id === activeProfileTaskId) ?? null,
    [activeProfileTaskId, tasks]
  );
  const profileStats = useMemo(() => {
    const committedHabits = tasks.length;
    const dateCandidates = [];

    history.forEach((entry) => {
      if (entry?.timestamp) {
        const normalized = normalizeDateValue(entry.timestamp);
        if (normalized) {
          dateCandidates.push(normalized);
        }
      }
    });

    tasks.forEach((task) => {
      const normalized = normalizeDateValue(task.date ?? task.dateKey);
      if (normalized) {
        dateCandidates.push(normalized);
      }
    });

    const minDate = dateCandidates.length
      ? new Date(Math.min(...dateCandidates.map((date) => date.getTime())))
      : today;
    const startDate = minDate > today ? today : minDate;
    const totalDays = Math.max(0, differenceInCalendarDays(today, startDate) + 1);

    if (!tasks.length) {
      return {
        totalDays,
        committedHabits,
        currentStreak: 0,
        bestStreak: 0,
      };
    }

    const dateRange = eachDayOfInterval({ start: startDate, end: today });
    let currentStreak = 0;
    let bestStreak = 0;

    dateRange.forEach((date) => {
      const scheduledTasks = tasks.filter((task) => shouldTaskAppearOnDate(task, date));
      const scoredTasks = scheduledTasks.filter(shouldCountTaskTowardsCompletion);
      if (scoredTasks.length === 0) {
        return;
      }
      const isComplete = scoredTasks.every((task) => getTaskCompletionStatus(task, date));
      if (isComplete) {
        currentStreak += 1;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else if (date.getTime() !== today.getTime()) {
        // Hoje ainda em andamento não zera a sequência; só um dia passado falhado.
        currentStreak = 0;
      }
    });

    return {
      totalDays,
      committedHabits,
      currentStreak,
      bestStreak,
    };
  }, [history, tasks, today]);
  const totalDaysUnit = profileStats.totalDays === 1 ? t.profile.day : t.profile.days;
  const habitsUnit = t.profile.habits;
  const currentStreakUnit = profileStats.currentStreak === 1 ? t.profile.day : t.profile.days;
  const bestStreakUnit = profileStats.bestStreak === 1 ? t.profile.day : t.profile.days;
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

  // Ajuste direto do progresso quantum: amount é segundos (timer) ou unidades
  // (count). Chamado pelo stepper inline do card — sem modal, a água/contador
  // reage na hora.
  const applyQuantumDelta = useCallback(
    (taskId, direction, amount) => {
      const deltaAmount = Math.round(amount);
      if (!taskId || !deltaAmount || deltaAmount <= 0) {
        return;
      }
      const dateKey = selectedDateKey;
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          if (task.quantum?.mode === 'timer') {
            const deltaSeconds = deltaAmount;
            const limitSeconds = getTimerTotalSeconds(task.quantum?.timer);
            if (!limitSeconds) {
              return task;
            }
            const baseDateKey =
              dateKey ?? task.dateKey ?? (task.date ? getDateKey(task.date) : null);
            if (!baseDateKey) {
              return task;
            }
            const progressByDate = {
              ...(task.quantum?.progressByDate ?? {}),
            };
            const currentEntry = progressByDate[baseDateKey] ?? {};
            const currentSeconds = currentEntry?.doneSeconds ?? 0;
            const nextSeconds = clampValue(
              currentSeconds + direction * deltaSeconds,
              0,
              limitSeconds
            );
            const completedDates = { ...(task.completedDates ?? {}) };
            if (baseDateKey) {
              if (nextSeconds === limitSeconds) {
                completedDates[baseDateKey] = true;
              } else {
                delete completedDates[baseDateKey];
              }
            }
            return {
              ...task,
              completedDates,
              quantum: {
                ...task.quantum,
                progressByDate: {
                  ...progressByDate,
                  [baseDateKey]: {
                    ...currentEntry,
                    doneSeconds: nextSeconds,
                  },
                },
                doneSeconds: nextSeconds,
                lastAdjustTimerSeconds: deltaSeconds,
                wavePulse: Date.now(),
              },
            };
          }
          const deltaCount = deltaAmount;
          const limitCount = task.quantum?.count?.value ?? 0;
          if (!limitCount) {
            return task;
          }
          const baseDateKey =
            dateKey ?? task.dateKey ?? (task.date ? getDateKey(task.date) : null);
          if (!baseDateKey) {
            return task;
          }
          const progressByDate = {
            ...(task.quantum?.progressByDate ?? {}),
          };
          const currentEntry = progressByDate[baseDateKey] ?? {};
          const currentCount = currentEntry?.doneCount ?? 0;
          const nextCount = clampValue(
            currentCount + direction * deltaCount,
            0,
            limitCount
          );
          const completedDates = { ...(task.completedDates ?? {}) };
          if (baseDateKey) {
            if (nextCount === limitCount) {
              completedDates[baseDateKey] = true;
            } else {
              delete completedDates[baseDateKey];
            }
          }
          return {
            ...task,
            completedDates,
            quantum: {
              ...task.quantum,
              progressByDate: {
                ...progressByDate,
                [baseDateKey]: {
                  ...currentEntry,
                  doneCount: nextCount,
                },
              },
              doneCount: nextCount,
              lastAdjustCount: deltaCount,
              wavePulse: Date.now(),
            },
          };
        })
      );
    },
    [selectedDateKey]
  );
  const lastToggleRef = useRef(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const actionsScale = useRef(new Animated.Value(0.85)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(12)).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    waitForInteraction: false,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const topItem = viewableItems[0];
      if (topItem && topItem.item && topItem.item.date) {
        setVisibleCalendarDate(topItem.item.date);
      }
    }
  }).current;
  const emptyStateIconSize = isCompact ? 98 : 112;
  const normalizeStoredTasks = useCallback((storedTasks) => {
    const normalizeCompletedDates = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }
      return value;
    };

    return storedTasks.filter(Boolean).map((task) => {
      const baseDateKey = task.dateKey ?? (task.date ? getDateKey(task.date) : null);
      const completedDates = { ...normalizeCompletedDates(task.completedDates) };

      if (task.completed && baseDateKey && !completedDates[baseDateKey]) {
        completedDates[baseDateKey] = true;
      }

      const normalizedQuantum = task.quantum
        ? (() => {
            const progressByDate =
              task.quantum.progressByDate &&
              typeof task.quantum.progressByDate === 'object' &&
              !Array.isArray(task.quantum.progressByDate)
                ? { ...task.quantum.progressByDate }
                : {};
            if (baseDateKey) {
              const legacyDoneSeconds = task.quantum.doneSeconds;
              const legacyDoneCount = task.quantum.doneCount;
              if (
                typeof legacyDoneSeconds === 'number' ||
                typeof legacyDoneCount === 'number'
              ) {
                progressByDate[baseDateKey] = {
                  ...progressByDate[baseDateKey],
                  doneSeconds: typeof legacyDoneSeconds === 'number' ? legacyDoneSeconds : 0,
                  doneCount: typeof legacyDoneCount === 'number' ? legacyDoneCount : 0,
                };
              }
            }
            return {
              ...task.quantum,
              progressByDate,
            };
          })()
        : task.quantum;

      const normalizedSubtasks = Array.isArray(task.subtasks)
        ? task.subtasks.map((subtask) => {
            const subtaskCompletedDates = {
              ...normalizeCompletedDates(subtask.completedDates),
            };
            if (subtask.completed && baseDateKey && !subtaskCompletedDates[baseDateKey]) {
              subtaskCompletedDates[baseDateKey] = true;
            }
            const { completed, ...restSubtask } = subtask;
            return {
              ...restSubtask,
              completedDates: subtaskCompletedDates,
            };
          })
        : task.subtasks;

      const { completed, ...restTask } = task;

      return {
        ...restTask,
        dateKey: baseDateKey,
        completedDates,
        subtasks: normalizedSubtasks,
        repeat: normalizeRepeatConfig(task.repeat),
        quantum: normalizedQuantum,
      };
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const hydrateFromStorage = async () => {
      try {
        const [loadedTasks, storedSettings, storedHistory, loadedImages] = await Promise.all([
          loadTasks(),
          loadUserSettings(),
          loadHistory(),
          loadMonthImages(),
        ]);

        let storedTasks = loadedTasks;
        let storedImages = loadedImages;
        if (Platform.OS !== 'web') {
          const migrated = await migrateCachedImages(loadedTasks, loadedImages);
          storedTasks = migrated.tasks;
          storedImages = migrated.images;

          if (Array.isArray(storedTasks) && storedImages !== undefined) {
            void cleanupOrphanImageFiles(storedTasks, storedImages);
          }
        }

        // Migração: o tipo 'list' foi removido (era idêntico ao default).
        if (Array.isArray(storedTasks)) {
          storedTasks = storedTasks.map((task) =>
            task?.type === 'list' ? { ...task, type: 'default' } : task
          );
        }

        if (!isMounted) {
          return;
        }

        loadFailuresRef.current = {
          tasks: storedTasks === undefined,
          settings: storedSettings === undefined,
          history: storedHistory === undefined,
          images: storedImages === undefined,
        };

        if (Array.isArray(storedTasks)) {
          setTasks(normalizeStoredTasks(storedTasks));
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

        if (storedImages) {
          setCustomMonthImages(storedImages);
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
  }, [normalizeStoredTasks]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    tasks.forEach((task) => {
      if (!task.notificationId && REMINDER_OFFSETS[task.reminder] != null) {
        void refreshTaskReminder(task, null);
      }
    });
  }, [isHydrated, refreshTaskReminder, tasks]);

  useEffect(() => {
    if (!isHydrated || loadFailuresRef.current.tasks) {
      return undefined;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      const normalizedTasks = tasks.map((task) => ({
        ...task,
        repeat: normalizeRepeatConfig(task.repeat),
      }));
      void saveTasks(normalizedTasks);
    }, 500);

    saveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isHydrated, tasks]);

  useEffect(() => {
    if (!isHydrated || loadFailuresRef.current.settings) {
      return undefined;
    }

    if (settingsSaveTimeoutRef.current) {
      clearTimeout(settingsSaveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      void saveUserSettings(userSettings);
    }, 500);

    settingsSaveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isHydrated, userSettings]);

  useEffect(() => {
    if (!isHydrated || loadFailuresRef.current.history) {
      return undefined;
    }

    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      void saveHistory(history);
    }, 500);

    historySaveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [history, isHydrated]);

  useEffect(() => {
    tasksRef.current = tasks;
    userSettingsRef.current = userSettings;
    historyRef.current = history;
    isHydratedRef.current = isHydrated;
  });

  // Flush imediato ao ir pra background: sem isso, mudanças feitas nos últimos
  // 500ms (debounce) se perdem se o sistema matar o app.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background' && nextState !== 'inactive') {
        return;
      }
      if (!isHydratedRef.current) {
        return;
      }
      const failures = loadFailuresRef.current;
      if (!failures.tasks && Array.isArray(tasksRef.current)) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        const normalizedTasks = tasksRef.current.map((task) => ({
          ...task,
          repeat: normalizeRepeatConfig(task.repeat),
        }));
        void saveTasks(normalizedTasks);
      }
      if (!failures.settings && userSettingsRef.current) {
        if (settingsSaveTimeoutRef.current) {
          clearTimeout(settingsSaveTimeoutRef.current);
          settingsSaveTimeoutRef.current = null;
        }
        void saveUserSettings(userSettingsRef.current);
      }
      if (!failures.history && Array.isArray(historyRef.current)) {
        if (historySaveTimeoutRef.current) {
          clearTimeout(historySaveTimeoutRef.current);
          historySaveTimeoutRef.current = null;
        }
        void saveHistory(historyRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleUpdateMonthImage = useCallback(
    async (monthIndex, uri) => {
      const updatedImages = {
        ...customMonthImages,
        [monthIndex]: uri,
      };

      setCustomMonthImages(updatedImages);
      if (!loadFailuresRef.current.images) {
        await saveMonthImages(updatedImages);
      }
    },
    [customMonthImages]
  );

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
        paddingTop: isCompact ? 10 : 14,
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
        backgroundColor: '#ffffff',
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
      const initialDateKey = dateKey ?? selectedDateKey;
      const targetTask = tasksRef.current.find((task) => task.id === taskId);
      if (isPassiveTaskType(targetTask)) {
        return;
      }
      const resolvedDateKey =
        initialDateKey ??
        targetTask?.dateKey ??
        (targetTask?.date ? getDateKey(targetTask.date) : null);
      const wasCompleted = targetTask
        ? getTaskCompletionStatus(targetTask, resolvedDateKey)
        : false;

      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          const completedDates = { ...(task.completedDates ?? {}) };
          const isCompletedForDate = getTaskCompletionStatus(task, resolvedDateKey);

          if (isCompletedForDate) {
            delete completedDates[resolvedDateKey];
          } else if (resolvedDateKey) {
            completedDates[resolvedDateKey] = true;
          }

          return {
            ...task,
            completedDates,
          };
        })
      );

      appendHistoryEntry('task_completion_toggled', {
        taskId,
        dateKey: resolvedDateKey,
        completed: !wasCompleted,
      });
    },
    [appendHistoryEntry, selectedDateKey]
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
          completedDates: {},
        };
      });
  }, []);

  const getUniqueTitle = useCallback(
    (requestedTitle, excludeTaskId) => {
      const baseTitle = (requestedTitle || t.common.untitledTask).trim() || t.common.untitledTask;
      const normalizedBase = baseTitle.toLowerCase();

      const existingTitles = new Set(
        tasks
          .filter((task) => task.id !== excludeTaskId)
          .map((task) => (task.title || '').trim().toLowerCase())
      );

      if (!existingTitles.has(normalizedBase)) {
        return baseTitle;
      }

      let suffix = 1;
      let candidate = `${baseTitle} ${suffix}`;
      while (existingTitles.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${baseTitle} ${suffix}`;
      }
      return candidate;
    },
    [t.common.untitledTask, tasks]
  );

  const getReminderBaseTime = useCallback((time) => {
    if (!time?.specified) {
      return null;
    }
    if (time.mode === 'period') {
      return time.period?.start ?? null;
    }
    return time.point ?? null;
  }, []);

  const buildReminderDateTime = useCallback((date, timeValue, offsetMinutes) => {
    if (!date || !timeValue || typeof offsetMinutes !== 'number') {
      return null;
    }
    const reminderDate = new Date(date);
    reminderDate.setHours(0, 0, 0, 0);
    reminderDate.setMinutes(toMinutes(timeValue) + offsetMinutes);
    return reminderDate;
  }, []);

  const findNextReminderDate = useCallback(
    (task) => {
      const offsetMinutes = REMINDER_OFFSETS[task?.reminder] ?? null;
      if (offsetMinutes === null) {
        return null;
      }
      const baseTime = getReminderBaseTime(task?.time);
      if (!baseTime) {
        return null;
      }
      const startDate = normalizeDateValue(task?.date ?? task?.dateKey);
      if (!startDate) {
        return null;
      }
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const initialDate = startDate > today ? startDate : today;
      const limitDays = 366;

      for (let offset = 0; offset <= limitDays; offset += 1) {
        const candidateDate = new Date(initialDate);
        candidateDate.setDate(candidateDate.getDate() + offset);
        if (!shouldTaskAppearOnDate(task, candidateDate)) {
          continue;
        }
        const reminderDate = buildReminderDateTime(candidateDate, baseTime, offsetMinutes);
        if (!reminderDate) {
          continue;
        }
        if (reminderDate > now) {
          return reminderDate;
        }
        const msDifference = now.getTime() - reminderDate.getTime();
        if (offset === 0 && msDifference <= 60000) {
          return new Date(now.getTime() + 5000);
        }
      }
      return null;
    },
    [buildReminderDateTime, getReminderBaseTime]
  );

  const scheduleTaskReminder = useCallback(
    async (task) => {
      if (!NOTIFICATIONS_SUPPORTED) {
        return null;
      }
      const offsetMinutes = REMINDER_OFFSETS[task?.reminder] ?? null;
      if (offsetMinutes === null) {
        return null;
      }
      const permissionResponse = await Notifications.getPermissionsAsync();
      if (permissionResponse.status !== 'granted') {
        const requestResponse = await Notifications.requestPermissionsAsync();
        if (requestResponse.status !== 'granted') {
          return null;
        }
      }
      const reminderDate = findNextReminderDate(task);
      if (!reminderDate) {
        return null;
      }
      const diffSeconds = Math.max(
        1,
        Math.ceil((reminderDate.getTime() - Date.now()) / 1000)
      );
      const timeIntervalType =
        Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval';
      const dateType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
      const trigger =
        diffSeconds <= 120
          ? {
              type: timeIntervalType,
              seconds: diffSeconds,
              repeats: false,
            }
          : {
              type: dateType,
              date: reminderDate,
            };
      return Notifications.scheduleNotificationAsync({
        content: {
          title: 'Lembrete',
          body: task?.title ? `Hora de: ${task.title}` : 'Você tem uma tarefa pendente.',
          sound: true,
          channelId: 'default',
        },
        trigger,
      });
    },
    [findNextReminderDate]
  );

  const cancelTaskReminder = useCallback(async (notificationId) => {
    if (!NOTIFICATIONS_SUPPORTED || !notificationId) {
      return;
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.warn('Failed to cancel notification', error);
    }
  }, []);

  const updateTaskNotificationId = useCallback((taskId, notificationId) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId ? { ...task, notificationId } : task
      )
    );
  }, []);

  const refreshTaskReminder = useCallback(
    async (task, existingNotificationId) => {
      if (existingNotificationId) {
        await cancelTaskReminder(existingNotificationId);
      }
      const nextNotificationId = await scheduleTaskReminder(task);
      if (nextNotificationId) {
        updateTaskNotificationId(task.id, nextNotificationId);
      } else if (existingNotificationId) {
        updateTaskNotificationId(task.id, null);
      }
    },
    [cancelTaskReminder, scheduleTaskReminder, updateTaskNotificationId]
  );

  const handleCreateHabit = useCallback((habit) => {
    const normalizedDate = new Date(habit?.startDate ?? new Date());
    normalizedDate.setHours(0, 0, 0, 0);
    const dateKey = getDateKey(normalizedDate);
    const color = habit?.color ?? '#d1d7ff';
    const title = getUniqueTitle(habit?.title, null);
    const repeat = normalizeRepeatConfig(habit?.repeat);
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      color,
      emoji: habit?.emoji ?? '✅',
      customImage: habit?.customImage ?? null,
      time: habit?.time,
      date: normalizedDate,
      dateKey,
      completedDates: {},
      subtasks: convertSubtasks(habit?.subtasks ?? []),
      repeat,
      reminder: habit?.reminder,
      tag: habit?.tag,
      tagLabel: habit?.tagLabel,
      type: habit?.type ?? 'normal',
      typeLabel: habit?.typeLabel,
      quantum: habit?.quantum,
      profileLocked: false,
      notificationId: null,
    };
    setTasks((previous) => [...previous, newTask]);
    void refreshTaskReminder(newTask, null);
    setSelectedDate(normalizedDate);
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    appendHistoryEntry('task_created', {
      taskId: newTask.id,
      title,
      dateKey: newTask.dateKey,
    });
  }, [appendHistoryEntry, convertSubtasks, getUniqueTitle, refreshTaskReminder]);

  const handleUpdateHabit = useCallback(
    (taskId, habit) => {
      const normalizedDate = habit?.startDate ? new Date(habit.startDate) : null;
      if (normalizedDate) {
        normalizedDate.setHours(0, 0, 0, 0);
      }
      const existingTask = tasks.find((task) => task.id === taskId);
      if (!existingTask) {
        return;
      }
      const nextTitle = habit?.title
        ? getUniqueTitle(habit.title, taskId)
        : existingTask?.title ?? t.common.untitledTask;
      const existingNotificationId = existingTask?.notificationId ?? null;
      const nextDate = normalizedDate ? new Date(normalizedDate) : new Date(existingTask.date);
      nextDate.setHours(0, 0, 0, 0);
      const nextQuantum = habit?.quantum ?? existingTask.quantum;
      let mergedQuantum = nextQuantum;
      if (nextQuantum && existingTask.quantum) {
        const sameMode = nextQuantum.mode === existingTask.quantum.mode;
        mergedQuantum = {
          ...existingTask.quantum,
          ...nextQuantum,
          doneSeconds: sameMode ? existingTask.quantum.doneSeconds ?? 0 : 0,
          doneCount: sameMode ? existingTask.quantum.doneCount ?? 0 : 0,
        };
      }
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          return {
            ...task,
            title: nextTitle,
            color: habit?.color ?? task.color,
            emoji: habit?.emoji ?? task.emoji,
            // O sheet sempre envia customImage (null = usuário removeu a imagem);
            // não usar o valor antigo como fallback, senão remover não funciona.
            customImage: habit?.customImage ?? null,
            time: habit?.time,
            subtasks: convertSubtasks(habit?.subtasks ?? [], task.subtasks ?? []),
            repeat: normalizeRepeatConfig(habit?.repeat ?? task.repeat),
            reminder: habit?.reminder,
            tag: habit?.tag,
            tagLabel: habit?.tagLabel,
            type: habit?.type,
            typeLabel: habit?.typeLabel,
            quantum: mergedQuantum,
            date: nextDate,
            dateKey: getDateKey(nextDate),
            profileLocked: task.profileLocked ?? false,
            notificationId: task.notificationId ?? null,
          };
        })
      );
      if (existingTask) {
        const updatedTask = {
          ...existingTask,
          title: nextTitle,
          color: habit?.color ?? existingTask.color,
          emoji: habit?.emoji ?? existingTask.emoji,
          customImage: habit?.customImage ?? null,
          time: habit?.time,
          subtasks: convertSubtasks(habit?.subtasks ?? [], existingTask.subtasks ?? []),
          repeat: normalizeRepeatConfig(habit?.repeat ?? existingTask.repeat),
          reminder: habit?.reminder,
          tag: habit?.tag,
          tagLabel: habit?.tagLabel,
          type: habit?.type,
          typeLabel: habit?.typeLabel,
          quantum: mergedQuantum,
          date: nextDate,
          dateKey: getDateKey(nextDate),
          profileLocked: existingTask.profileLocked ?? false,
          notificationId: existingNotificationId,
        };
        void refreshTaskReminder(updatedTask, existingNotificationId);
      }
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      if (normalizedDate) {
        setSelectedDate(normalizedDate);
      }
      appendHistoryEntry('task_updated', {
        taskId,
        title: nextTitle,
        dateKey: normalizedDate ? getDateKey(normalizedDate) : undefined,
      });
    },
    [appendHistoryEntry, convertSubtasks, getUniqueTitle, refreshTaskReminder, t.common.untitledTask, tasks]
  );

  const handleToggleSubtask = useCallback(
    (taskId, subtaskId) => {
      triggerSelection();
      const targetTask = tasks.find((task) => task.id === taskId);
      const targetDateKey =
        selectedDateKey ??
        targetTask?.dateKey ??
        (targetTask?.date ? getDateKey(targetTask.date) : null);
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

  // Handlers estáveis dos cards (recebem a task de volta como argumento):
  // referências fixas + cache de identidade das tasks = React.memo efetivo,
  // só o card tocado re-renderiza ao completar/ajustar.
  const handleCardPress = useCallback((task) => setActiveTaskId(task.id), []);
  const handleCardToggle = useCallback(
    (task) => handleToggleTaskCompletion(task.id, selectedDateKey),
    [handleToggleTaskCompletion, selectedDateKey]
  );
  const handleCardQuantumDelta = useCallback(
    (task, direction, amount) => applyQuantumDelta(task.id, direction, amount),
    [applyQuantumDelta]
  );
  const handleCardCopy = useCallback(
    (task) => {
      openHabitSheet('copy', {
        ...task,
        title: `${task.title} 1`,
        subtasks: task.subtasks?.map((subtask) => subtask.title) ?? [],
        startDate: task.date,
      });
    },
    [openHabitSheet]
  );
  const handleCardDelete = useCallback(
    (task) => {
      if (task.profileLocked) {
        return;
      }
      setTasks((previous) => previous.filter((current) => current.id !== task.id));
      appendHistoryEntry('task_deleted', { taskId: task.id, title: task.title });
    },
    [appendHistoryEntry]
  );
  const handleCardEdit = useCallback(
    (task) => {
      openHabitSheet('edit', {
        ...task,
        startDate: task.date,
        subtasks: task.subtasks?.map((subtask) => subtask.title) ?? [],
      });
    },
    [openHabitSheet]
  );

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
          name={isActive ? icon.replace('-outline', '') : icon}
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

  const selectedDayProgressPercent =
    scorableTasksForSelectedDate.length > 0
      ? Math.round((completedTaskCount / scorableTasksForSelectedDate.length) * 100)
      : 0;

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

      <ConfettiOverlay
        key={confettiKey}
        visible={showConfetti}
        onComplete={handleConfettiComplete}
      />

      <View style={styles.container}>
        <View
          style={[
            styles.content,
            dynamicStyles.content,
            activeTab === 'calendar' && { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
            activeTab === 'profile' && { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, alignItems: 'center', justifyContent: 'center' },
          ]}
          importantForAccessibility={isFabOpen ? 'no-hide-descendants' : 'auto'}
        >
          {activeTab === 'today' ? (
            <ScrollView
              contentContainerStyle={styles.todayContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.todayHeader}>
                <Text style={styles.todayDateEyebrow}>{selectedDateEyebrow}</Text>
                <Text style={styles.todayTitle}>{selectedDateLabel}</Text>
                {scorableTasksForSelectedDate.length > 0 && (
                  <>
                    <View style={styles.todayProgressRow}>
                      <Text
                        style={[
                          styles.todaySubtitle,
                          allTasksCompletedForSelectedDay
                            ? styles.todaySubtitleSuccess
                            : styles.todaySubtitleInProgress,
                        ]}
                      >
                        {allTasksCompletedForSelectedDay
                          ? t.today.allTasksCompleted
                          : t.today.completedProgress
                              .replace('{completed}', String(completedTaskCount))
                              .replace('{total}', String(scorableTasksForSelectedDate.length))}
                      </Text>
                      <Text
                        style={[
                          styles.todayProgressPct,
                          allTasksCompletedForSelectedDay
                            ? styles.todaySubtitleSuccess
                            : styles.todayProgressPctInProgress,
                        ]}
                      >
                        {selectedDayProgressPercent}%
                      </Text>
                    </View>
                    <View style={styles.todayProgressTrack}>
                      <View
                        style={[
                          styles.todayProgressFill,
                          allTasksCompletedForSelectedDay && styles.todayProgressFillComplete,
                          { width: `${selectedDayProgressPercent}%` },
                        ]}
                      />
                    </View>
                  </>
                )}
              </View>

              <View style={styles.daySelector}>
                {weekDays.map((day) => {
                  const isSelected = day.key === selectedDateKey;
                  const isToday = day.key === todayKey;
                  const dayContainerStyles = [styles.dayNumber];
                  const dayTextStyles = [styles.dayNumberText];
                  if (day.allCompleted) {
                    dayContainerStyles.push(styles.dayNumberCompleted);
                    dayTextStyles.push(styles.dayNumberTextCompleted);
                  }
                  if (isSelected) {
                    dayContainerStyles.push(styles.dayNumberSelected);
                    dayTextStyles.push(styles.dayNumberTextSelected);
                  }
                  const indicatorStyles = [styles.todayIndicator];
                  if (isSelected) {
                    indicatorStyles.push(styles.todayIndicatorOnSelected);
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
                      accessibilityLabel={language === 'pt' ? 'Mostrar todos os rótulos' : 'Show all tags'}
                      accessibilityState={{ selected: selectedTagFilter === 'all' }}
                    >
                      <Text
                        style={[
                          styles.tagPillText,
                          selectedTagFilter === 'all' && styles.tagPillTextSelected,
                        ]}
                      >
                        {t.common.all}
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
                          accessibilityLabel={t.today.showTasksTagged.replace('{tag}', option.label)}
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
                      accessibilityLabel={t.today.emptyIllustration}
                    >
                      <Ionicons name="calendar-clear-outline" size={emptyStateIconSize} color="#3c2ba7" />
                    </View>
                    <Text style={styles.emptyState}>
                      {selectedTagFilter === 'all' ? t.today.emptyDay : t.today.emptyDayTag}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.tasksList}>
                    {visibleTasksWithStats.map((task) => (
                      <Animated.View
                        key={task.id}
                        onLayout={(event) => handleTaskLayout(task.id, event)}
                        style={{ transform: [{ translateY: getTaskTranslateY(task.id) }] }}
                      >
                        <SwipeableTaskCard
                          task={task}
                          backgroundColor={task.backgroundColor}
                          borderColor={task.borderColor}
                          dateKey={selectedDateKey}
                          totalSubtasks={task.totalSubtasks}
                          completedSubtasks={task.completedSubtasks}
                          onPress={handleCardPress}
                          onToggleCompletion={handleCardToggle}
                          onQuantumDelta={handleCardQuantumDelta}
                          onCopy={handleCardCopy}
                          onDelete={handleCardDelete}
                          language={language}
                          isVisible={activeTab === 'today'}
                          onEdit={handleCardEdit}
                        />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          ) : activeTab === 'calendar' ? (
            <View style={{ flex: 1 }}>
              <StickyMonthHeader date={visibleCalendarDate} customImages={customMonthImages} language={language} />

              <FlatList
                data={calendarMonths}
                renderItem={renderCalendarMonth}
                keyExtractor={(item) => item.id.toString()}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={Platform.OS === 'android'}
                maxToRenderPerBatch={3}
                windowSize={5}
                initialScrollIndex={initialCalendarIndex !== -1 ? initialCalendarIndex : 12}
                initialNumToRender={2}
                updateCellsBatchingPeriod={16}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                getItemLayout={getItemLayout}
                onScrollToIndexFailed={(info) => {
                  const wait = new Promise((resolve) => setTimeout(resolve, 500));
                  wait.then(() => {
                    // Retry can be added here if a ref is available
                  });
                }}
                contentContainerStyle={[
                  styles.calendarListContent,
                  {
                    paddingTop: 0,
                    paddingBottom: isCompact ? 56 : 72,
                    paddingHorizontal: 0,
                  },
                ]}
                onEndReached={loadMoreCalendarMonths}
                onEndReachedThreshold={0.5}
              />
            </View>
          ) : activeTab === 'profile' ? (
             <View style={styles.profileContainer}>
                <View style={styles.profileStatsSection}>
                  <Text style={styles.profileStatsTitle}>{t.profile.stats}</Text>
                  <View style={styles.profileStatsGrid}>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>{t.profile.totalDays}</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.totalDays}</Text>
                        <Text style={styles.profileStatUnit}>{totalDaysUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>{t.profile.committedHabits}</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.committedHabits}</Text>
                        <Text style={styles.profileStatUnit}>{habitsUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>{t.profile.currentStreak}</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.currentStreak}</Text>
                        <Text style={styles.profileStatUnit}>{currentStreakUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>{t.profile.bestStreak}</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.bestStreak}</Text>
                        <Text style={styles.profileStatUnit}>{bestStreakUnit}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.customizeButton}
                  onPress={() => setCustomizeCalendarOpen(true)}
                  activeOpacity={0.8}
                >
                   <Ionicons name="images-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                   <Text style={styles.customizeButtonText}>{t.profile.customizeCalendar}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileTasksButton}
                  onPress={handleOpenProfileTasks}
                  activeOpacity={0.85}
                >
                  <Ionicons name="list-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.profileTasksButtonText}>{t.profile.openTasks}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileTasksButton}
                  onPress={() => setActivityOpen(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="time-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.profileTasksButtonText}>{t.profile.activity}</Text>
                </TouchableOpacity>
                <View style={styles.languageSection}>
                  <TouchableOpacity
                    style={[styles.profileTasksButton, styles.languageActionButton]}
                    activeOpacity={0.85}
                    onPress={() => setLanguageMenuOpen((prev) => !prev)}
                  >
                    <Ionicons name="language-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.profileTasksButtonText}>{t.profile.language}</Text>
                    <Ionicons
                      name={isLanguageMenuOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#fff"
                      style={styles.languageActionChevron}
                    />
                  </TouchableOpacity>
                  {isLanguageMenuOpen ? (
                    <View style={styles.languageRow}>
                      <TouchableOpacity style={[styles.languageButton, language === 'en' && styles.languageButtonActive]} onPress={() => updateUserSettings({ language: 'en' })}>
                        <Text style={[styles.languageButtonText, language === 'en' && styles.languageButtonTextActive]}>{t.profile.english}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.languageButton, language === 'pt' && styles.languageButtonActive]} onPress={() => updateUserSettings({ language: 'pt' })}>
                        <Text style={[styles.languageButtonText, language === 'pt' && styles.languageButtonTextActive]}>{t.profile.portuguese}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
             </View>
          ) : (
            <View style={styles.placeholderContainer}>
              <View style={styles.placeholderIconWrapper}>
                <Ionicons
                  name={
                    activeTab === 'discover'
                      ? 'planet-outline'
                      : 'person-circle-outline'
                  }
                  size={48}
                  color="#3c2ba7"
                />
              </View>
              <Text style={styles.heading}>
                {activeTab === 'discover'
                  ? t.discover.title
                  : t.tabs.profile}
              </Text>
              <Text style={[styles.description, dynamicStyles.description, styles.placeholderDescription]}>
                {activeTab === 'discover'
                  ? t.discover.description
                  : t.placeholders.profileDescription}
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
              {[
                { key: 'today', label: t.tabs.today, icon: 'time-outline' },
                { key: 'calendar', label: t.tabs.calendar, icon: 'calendar-clear-outline' },
              ].map(renderTabButton)}
            </View>
            <View style={[styles.tabGroup, dynamicStyles.tabGroupRight]}>
              {[
                { key: 'discover', label: t.tabs.discover, icon: 'compass-outline' },
                { key: 'profile', label: t.tabs.profile, icon: 'person-outline' },
              ].map(renderTabButton)}
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
            accessibilityLabel={isFabOpen ? t.common.closeAddMenu : t.common.openAddMenu}
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
            accessibilityLabel={t.common.closeAddMenu}
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
                accessibilityLabel={t.fab.addHabit}
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
                      accessibilityLabel={t.fab.addHabit}
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
                      {t.fab.addHabit}
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
                      {t.fab.addHabitDescription}
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
                accessibilityLabel={t.fab.addReflection}
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
                      {t.fab.addReflection}
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
                      {t.fab.addReflectionDescription}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
      <TaskDetailModal
        language={language}
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
      <DayReportModal
        visible={!!reportDate}
        date={reportDate}
        tasks={reportTasks}
        onClose={() => setReportDate(null)}
        customImages={customMonthImages}
        language={language}
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
        availableTagOptions={availableTagOptions}
        language={language}
      />
      <CustomizeCalendarModal
        visible={isCustomizeCalendarOpen}
        onClose={() => setCustomizeCalendarOpen(false)}
        customImages={customMonthImages}
        onUpdateImage={handleUpdateMonthImage}
        language={language}
      />
      <ProfileTasksModal
        visible={isProfileTasksOpen}
        tasks={profileTasks}
        onClose={handleCloseProfileTasks}
        onSelectTask={(taskId) => setActiveProfileTaskId(taskId)}
        onDeleteTask={handleDeleteProfileTask}
        onDeleteSelected={handleDeleteProfileTasks}
        language={language}
      />
      <ActivityTimelineModal
        visible={isActivityOpen}
        history={history}
        tasks={tasks}
        onClose={() => setActivityOpen(false)}
        language={language}
      />
      <ProfileTaskDetailModal
        language={language}
        visible={isProfileTasksOpen && !!activeProfileTaskId}
        task={activeProfileTask}
        onClose={() => setActiveProfileTaskId(null)}
        onToggleLock={handleToggleProfileTaskLock}
      />
    </View>
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
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
    });
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScheduleApp />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

