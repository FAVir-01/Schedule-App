import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AccessibilityInfo,
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
  endOfMonth,
  endOfWeek,
  getWeeksInMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  loadDayMoods,
  loadHistory,
  loadMonthImages,
  loadMoodAppearance,
  loadTasks,
  loadUserSettings,
  replaceStoredAppData,
  saveDayMoods,
  saveMoodAppearance,
  saveHistory,
  saveMonthImages,
  saveTasks,
  saveUserSettings,
} from './storage';
import AddHabitSheet from './components/AddHabitSheet';
import { DEFAULT_USER_SETTINGS } from './constants/userSettings';
import { getNavigationBarThemeForTab } from './constants/navigation';
import { lightenColor } from './utils/colorUtils';
import { getMoodMarker } from './utils/moodUtils';
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
  reconcileQuantumCompletionState,
  reconcileTaskProgressOnEdit,
  restoreDeletedTaskAtIndex,
  shouldCountTaskTowardsCompletion,
  normalizeRepeatConfig,
} from './utils/taskUtils';
import { getTimerTotalSeconds, toMinutes } from './utils/timeUtils';
import {
  backfillTaskTitlesInHistory,
  createTaskHistoryDetails,
  prependHistoryEntry,
} from './utils/historyUtils';
import { getWeekdayInitials, translations } from './constants/i18n';
import { styles } from './styles/appStyles';
import {
  NOTIFICATIONS_SUPPORTED,
  USE_NATIVE_DRIVER,
} from './constants/app';
import {
  triggerImpact,
  triggerSelection,
  triggerSuccessFeedback,
} from './utils/feedbackUtils';
import {
  shouldTriggerCompletionCelebration,
  willProgressReachCompletion,
} from './utils/celebrationUtils';
import { calculateProfileStats } from './utils/profileStatsUtils';
import { measureSynchronous } from './utils/performanceUtils';
import { buildTaskReminderContent } from './utils/notificationUtils';
import { AnimatedPressable } from './components/animatedComponents';
import ConfettiOverlay from './components/ConfettiOverlay';
import StickyMonthHeader from './components/StickyMonthHeader';
import CalendarMonthItem from './components/CalendarMonthItem';
import CustomizeCalendarModal from './components/CustomizeCalendarModal';
import DayReportModal from './components/DayReportModal';
import TaskDetailModal from './components/TaskDetailModal';
import ProfileTaskDetailModal from './components/ProfileTaskDetailModal';
import PeriodGoalModal, { PeriodGoalSummaryCard } from './components/PeriodGoal';
import ActivityTimelineModal from './components/ActivityTimelineModal';
import LocalSummaryModal from './components/LocalSummaryModal';
import ProfileTasksModal from './components/ProfileTasksModal';
import SwipeableTaskCard from './components/SwipeableTaskCard';
import ReflectionSheet from './components/ReflectionSheet';
import SettingsSheet from './components/SettingsSheet';
import PerformanceChart from './components/PerformanceChart';
import AppErrorBoundary from './components/AppErrorBoundary';
import UndoSnackbar from './components/UndoSnackbar';
import DiscoverScreen, { FirstRunOnboarding } from './components/DiscoverScreen';
import { CALENDAR_DAY_SIZE } from './constants/layout';
import { getTaskTemplateCollection } from './constants/taskTemplates';
import {
  cancelTaskReminders,
  getTaskNotificationIds,
  getTaskReminderFingerprint,
  reconcileTaskReminderSchedules,
  scheduleTaskReminders,
} from './services/reminderService';
import {
  exportAppBackup,
  prepareImportedBackupData,
  selectLatestAppBackupFromDirectory,
} from './services/backupService';
import { buildTemplateTasks, migrateImportedTemplateTasks } from './utils/templateUtils';
import { normalizePeriodGoal } from './utils/periodGoalUtils';


const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');
const TASK_DELETE_UNDO_DURATION_MS = 6000;

const INITIAL_STORAGE_LOAD_FAILURES = {
  tasks: true,
  settings: true,
  history: true,
  images: true,
  moods: true,
  appearance: true,
};

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

// Apaga imagens nossas (custom_habit_icon_*/custom_month_*/custom_mood_*) que
// nada referencia mais — ex.: tarefa deletada, imagem trocada ou expressão
// removida. Só considera cada prefixo quando os dados dele carregaram bem.
const cleanupOrphanImageFiles = async (
  storedTasks,
  storedImages,
  storedMoods,
  storedAppearance
) => {
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
    // Humores: referenciados pela aparência dos níveis ou por qualquer
    // reflexão de dia (imagem legada ou foto do dia).
    const moodsLoaded = storedMoods !== undefined && storedAppearance !== undefined;
    if (moodsLoaded) {
      Object.values(storedAppearance ?? {}).forEach((uri) => {
        if (typeof uri === 'string') {
          referenced.add(uri.split('/').pop());
        }
      });
      Object.values(storedMoods ?? {}).forEach((mood) => {
        if (typeof mood?.image === 'string') {
          referenced.add(mood.image.split('/').pop());
        }
        if (typeof mood?.photo === 'string') {
          referenced.add(mood.photo.split('/').pop());
        }
      });
    }
    const fileNames = await FileSystem.readDirectoryAsync(dir);
    const orphans = fileNames.filter(
      (name) =>
        (name.startsWith('custom_habit_icon_') ||
          name.startsWith('custom_month_') ||
          (moodsLoaded && name.startsWith('custom_mood_'))) &&
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
  const [hasMountedCalendar, setHasMountedCalendar] = useState(
    DEFAULT_USER_SETTINGS.activeTab === 'calendar'
  );
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabMenuMounted, setIsFabMenuMounted] = useState(false);
  const [isHabitSheetOpen, setIsHabitSheetOpen] = useState(false);
  const [habitSheetMode, setHabitSheetMode] = useState('create');
  const [habitSheetInitialTask, setHabitSheetInitialTask] = useState(null);
  const [isCustomizeCalendarOpen, setCustomizeCalendarOpen] = useState(false);
  const [isProfileTasksOpen, setProfileTasksOpen] = useState(false);
  const [isActivityOpen, setActivityOpen] = useState(false);
  const [isLocalSummaryOpen, setLocalSummaryOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [tasks, setTasks] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeProfileTaskId, setActiveProfileTaskId] = useState(null);
  const [periodGoalTaskId, setPeriodGoalTaskId] = useState(null);
  const [pendingTaskDeletion, setPendingTaskDeletion] = useState(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState(
    DEFAULT_USER_SETTINGS.selectedTagFilter
  );
  const language = userSettings.language ?? DEFAULT_USER_SETTINGS.language;
  const t = translations[language] ?? translations.en;
  const [history, setHistory] = useState([]);
  const [customMonthImages, setCustomMonthImages] = useState({});
  // Reflexões diárias: { [dateKey]: { emoji, note, updatedAt } }
  const [dayMoods, setDayMoods] = useState({});
  // Expressões personalizadas (imagens) disponíveis na folha de reflexão.
  const [moodAppearance, setMoodAppearance] = useState({});
  const [reflectionDateKey, setReflectionDateKey] = useState(null);
  // Filtro do Profile: null = visão geral; id de hábito = gráfico/stats dele.
  const [profileFilterId, setProfileFilterId] = useState(null);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  // Evita exibir movimento antes de a preferência de acessibilidade ser carregada.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const updateUserSettings = useCallback((updates) => {
    setUserSettings((previous) => ({
      ...previous,
      ...updates,
    }));
  }, []);
  const saveTimeoutRef = useRef(null);
  const settingsSaveTimeoutRef = useRef(null);
  const historySaveTimeoutRef = useRef(null);
  const dayMoodsSaveTimeoutRef = useRef(null);
  const taskDeleteUndoTimeoutRef = useRef(null);
  // Marca quais stores falharam ao carregar, p/ não sobrescrever dado bom com estado vazio
  const loadFailuresRef = useRef({ ...INITIAL_STORAGE_LOAD_FAILURES });
  const storageProtectionAlertShownRef = useRef(false);
  const failedStorageWritesRef = useRef(new Map());
  const storageWriteSequenceRef = useRef(0);
  const latestStorageWriteSequenceRef = useRef(new Map());
  const pendingStorageWriteAlertRef = useRef(false);
  // Espelhos do estado mais recente p/ flush imediato quando o app vai pra background
  const tasksRef = useRef(null);
  const userSettingsRef = useRef(null);
  const historyRef = useRef(null);
  const dayMoodsRef = useRef(null);
  const isHydratedRef = useRef(false);
  const reminderReconciliationInFlightRef = useRef(false);
  const pendingReminderReconciliationRef = useRef(null);
  const pendingImportedReminderReconciliationRef = useRef(false);
  const didInitialReminderReconciliationRef = useRef(false);
  const reminderContentSignatureRef = useRef(null);
  const pendingCompletionActionDateRef = useRef(null);
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
  const [visibleCalendarMonthIds, setVisibleCalendarMonthIds] = useState(
    () => new Set([getMonthId(new Date())])
  );
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
  const cardHeight = isCompact ? 192 : 208;
  const cardIconSize = isCompact ? 60 : 72;
  const cardSpacing = isCompact ? 16 : 24;
  const cardBorderRadius = isCompact ? 30 : 34;
  const cardVerticalOffset = isCompact ? 150 : 174;
  const fabHaloSize = fabSize + (isCompact ? 26 : 30);
  const fabBaseSize = fabSize + (isCompact ? 14 : 18);
  const fabIconSize = isCompact ? 28 : 30;
  const HEADER_HEIGHT = 100;
  // Espaço real ocupado fora da grade: 10 do cabeçalho e 32 do container.
  // Antes, 12 desses pontos vinham do `gap` da lista e não eram incluídos no
  // getItemLayout, então o initialScrollIndex parava antes do mês atual.
  const MARGINS = 42;
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
  const currentDayKey = useMemo(() => getDateKey(currentTime), [currentTime]);
  const today = useMemo(() => normalizeDateValue(currentDayKey), [currentDayKey]);
  const todayKey = currentDayKey;
  const selectedDateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
  const previousTodayKeyRef = useRef(todayKey);

  useEffect(() => {
    const previousTodayKey = previousTodayKeyRef.current;
    if (previousTodayKey === todayKey) {
      return;
    }

    // Se o usuário estava acompanhando "hoje", acompanha a virada do dia.
    // Uma data histórica escolhida manualmente permanece selecionada.
    setSelectedDate((previousSelectedDate) =>
      getDateKey(previousSelectedDate) === previousTodayKey
        ? new Date(today)
        : previousSelectedDate
    );
    previousTodayKeyRef.current = todayKey;
  }, [today, todayKey]);

  useEffect(() => {
    // currentTime decide a expiração de lembretes e também a virada do dia.
    // Devolver o mesmo objeto enquanto o minuto não muda evita re-renderizar
    // o app inteiro a cada segundo.
    const updateCurrentTime = () => {
      setCurrentTime((previous) => {
        const now = new Date();
        return Math.floor(now.getTime() / 60000) === Math.floor(previous.getTime() / 60000)
          ? previous
          : now;
      });
    };
    const timerId = setInterval(updateCurrentTime, 10000);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        updateCurrentTime();
      }
    });

    return () => {
      clearInterval(timerId);
      appStateSubscription.remove();
    };
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
  // Calcula somente os meses visíveis e seus vizinhos. A primeira abertura
  // antes percorria 25 meses × dias × tarefas de forma síncrona, bloqueando a UI.
  const calendarStatusStoreRef = useRef({
    tasksRef: null,
    dayStatusCache: new Map(),
    lastResult: { calendarDayStatusByKey: {}, calendarMonthStatusSignatureById: {} },
  });
  const isCalendarTabActive = activeTab === 'calendar';
  useEffect(() => {
    if (isCalendarTabActive) {
      setHasMountedCalendar(true);
    }
  }, [isCalendarTabActive]);
  const calendarStatusMonths = useMemo(() => {
    if (!isCalendarTabActive || calendarMonths.length === 0) {
      return [];
    }

    const visibleIndexes = calendarMonths.reduce((indexes, month, index) => {
      if (visibleCalendarMonthIds.has(month.monthId)) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (visibleIndexes.length === 0) {
      visibleIndexes.push(initialCalendarIndex >= 0 ? initialCalendarIndex : 0);
    }

    const indexesToCalculate = new Set();
    visibleIndexes.forEach((index) => {
      for (let offset = -1; offset <= 1; offset += 1) {
        const candidate = index + offset;
        if (candidate >= 0 && candidate < calendarMonths.length) {
          indexesToCalculate.add(candidate);
        }
      }
    });

    return calendarMonths.filter((_, index) => indexesToCalculate.has(index));
  }, [calendarMonths, initialCalendarIndex, isCalendarTabActive, visibleCalendarMonthIds]);
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

    calendarStatusMonths.forEach((month) => {
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
  }, [calendarStatusMonths, isCalendarTabActive, tasks]);

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
    setHistory((previous) => prependHistoryEntry(previous, entry));
    return entry.id;
  }, []);

  const preserveTaskTitlesInHistory = useCallback((tasksToPreserve) => {
    if (!tasksToPreserve?.length) {
      return;
    }
    setHistory((previous) =>
      backfillTaskTitlesInHistory(previous, tasksToPreserve)
    );
  }, []);

  const queueTaskDeletionUndo = useCallback((task, originalIndex, historyEntryId) => {
    if (taskDeleteUndoTimeoutRef.current) {
      clearTimeout(taskDeleteUndoTimeoutRef.current);
    }
    setPendingTaskDeletion({ task, originalIndex, historyEntryId });
    taskDeleteUndoTimeoutRef.current = setTimeout(() => {
      setPendingTaskDeletion((current) =>
        current?.historyEntryId === historyEntryId ? null : current
      );
      taskDeleteUndoTimeoutRef.current = null;
    }, TASK_DELETE_UNDO_DURATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (taskDeleteUndoTimeoutRef.current) {
        clearTimeout(taskDeleteUndoTimeoutRef.current);
      }
    },
    []
  );

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
      const tasksToDelete = tasks.filter(
        (task) => taskIds.includes(task.id) && !task.profileLocked
      );
      preserveTaskTitlesInHistory(tasksToDelete);
      tasksToDelete.forEach((task) => {
        void cancelTaskReminders(task);
        appendHistoryEntry('task_deleted', createTaskHistoryDetails(task));
      });
      const deletedTaskIds = new Set(tasksToDelete.map((task) => task.id));
      setTasks((previous) =>
        previous.filter((task) => !deletedTaskIds.has(task.id))
      );
      setActiveProfileTaskId((current) => (deletedTaskIds.has(current) ? null : current));
    },
    [appendHistoryEntry, preserveTaskTitlesInHistory, tasks]
  );
  const handleDeleteProfileTask = useCallback(
    (taskId) => {
      const originalIndex = tasks.findIndex((task) => task.id === taskId);
      const task = tasks[originalIndex];
      if (!task || task.profileLocked) {
        return;
      }
      void cancelTaskReminders(task);
      preserveTaskTitlesInHistory([task]);
      setTasks((previous) => previous.filter((current) => current.id !== task.id));
      setActiveProfileTaskId((current) => (current === task.id ? null : current));
      const historyEntryId = appendHistoryEntry(
        'task_deleted',
        createTaskHistoryDetails(task)
      );
      queueTaskDeletionUndo(task, originalIndex, historyEntryId);
    },
    [appendHistoryEntry, preserveTaskTitlesInHistory, queueTaskDeletionUndo, tasks]
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

  const handleSavePeriodGoal = useCallback(
    (taskId, nextGoal) => {
      const targetTask = (tasksRef.current ?? []).find((task) => task.id === taskId);
      if (!targetTask) {
        setPeriodGoalTaskId(null);
        return;
      }
      const normalizedGoal = normalizePeriodGoal(nextGoal);
      setTasks((previous) =>
        previous.map((task) =>
          task.id === taskId ? { ...task, periodGoal: normalizedGoal } : task
        )
      );
      appendHistoryEntry('task_updated', createTaskHistoryDetails(targetTask));
      setPeriodGoalTaskId(null);
      triggerSelection();
    },
    [appendHistoryEntry]
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
      return [...previous, buildCalendarMonthItem(nextId, nextMonthDate)];
    });
  }, []);

  // Assinatura dos humores por mês: só o mês cujo emoji mudou re-renderiza.
  const calendarMonthMoodSignatureById = useMemo(() => {
    const result = {};
    calendarStatusMonths.forEach((month) => {
      result[month.monthId] = month.days
        .map((day) => {
          const marker = getMoodMarker(dayMoods[getDateKey(day)], moodAppearance);
          const markerId = marker?.image ?? marker?.emoji;
          return markerId ? `${getDateKey(day)}:${markerId}` : null;
        })
        .filter(Boolean)
        .join('|');
    });
    return result;
  }, [calendarStatusMonths, dayMoods, moodAppearance]);

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
        dayMoods={dayMoods}
        moodAppearance={moodAppearance}
        monthMoodSignature={calendarMonthMoodSignatureById[item.monthId]}
      />
    ),
    [calendarDayStatusByKey, calendarMonthStatusSignatureById, calendarMonthMoodSignatureById, customMonthImages, dayMoods, handleOpenReport, language, moodAppearance, todayKey]
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
        label: getTaskTagDisplayLabel(task, t.taskDisplay.tags) ?? t.taskDetails.tag,
      });
      return options;
    }, []);
  }, [t.taskDisplay.tags, tasks]);
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
        label: getTaskTagDisplayLabel(task, t.taskDisplay.tags) ?? t.taskDetails.tag,
      });
      return options;
    }, []);
  }, [t.taskDisplay.tags, tasksForSelectedDate]);
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
    const wasComplete = previousCompletionRef.current;
    const actionDateKey = pendingCompletionActionDateRef.current;
    previousCompletionRef.current = allTasksCompletedForSelectedDay;
    pendingCompletionActionDateRef.current = null;

    if (
      !shouldTriggerCompletionCelebration({
        isHydrated,
        wasComplete,
        isComplete: allTasksCompletedForSelectedDay,
        actionDateKey,
        selectedDateKey,
      })
    ) {
      return undefined;
    }

    void triggerSuccessFeedback();
    if (prefersReducedMotion) {
      return undefined;
    }

    // Adia a montagem do confete p/ depois do frame da conclusão (re-render da
    // lista + animação do card); montar tudo junto causava uma travada leve.
    const timeoutId = setTimeout(() => {
      setConfettiKey((previous) => previous + 1);
      setShowConfetti(true);
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [
    allTasksCompletedForSelectedDay,
    isHydrated,
    prefersReducedMotion,
    selectedDateKey,
    tasks,
  ]);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((isEnabled) => {
        if (isMounted) {
          setPrefersReducedMotion(isEnabled);
        }
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setPrefersReducedMotion
    );

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowConfetti(false);
    }
  }, [prefersReducedMotion]);
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks]
  );
  const activeProfileTask = useMemo(
    () => tasks.find((task) => task.id === activeProfileTaskId) ?? null,
    [activeProfileTaskId, tasks]
  );
  const periodGoalTask = useMemo(
    () => tasks.find((task) => task.id === periodGoalTaskId) ?? null,
    [periodGoalTaskId, tasks]
  );
  const profileFilterTask = useMemo(
    () => tasks.find((task) => task.id === profileFilterId) ?? null,
    [profileFilterId, tasks]
  );
  // Com um hábito filtrado, as stats passam a ser dele: dias desde a criação,
  // total de conclusões e sequências do próprio hábito.
  const profileStats = useMemo(
    () =>
      measureSynchronous(
        'profile.stats',
        () =>
          calculateProfileStats({
            tasks,
            history,
            selectedTask: profileFilterTask,
            today,
          }),
        (result) => ({
          taskCount: tasks.length,
          historyCount: history.length,
          filtered: Boolean(profileFilterTask),
          evaluatedDays: result.evaluatedDays,
          rangeLimited: result.isStreakRangeLimited,
        })
      ),
    [history, profileFilterTask, tasks, today]
  );
  // Faixa de humor dos últimos 7 dias exibida no Profile.
  const weekMoodDays = useMemo(() => {
    const initials = getWeekdayInitials(language);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const key = getDateKey(date);
      const marker = getMoodMarker(dayMoods[key], moodAppearance);
      return {
        key,
        label: initials[date.getDay()],
        emoji: marker?.emoji ?? null,
        image: marker?.image ?? null,
        isToday: key === todayKey,
      };
    });
  }, [dayMoods, language, moodAppearance, today, todayKey]);
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
      const targetTask = tasksRef.current?.find((task) => task.id === taskId);
      const baseDateKey =
        dateKey ??
        targetTask?.dateKey ??
        (targetTask?.date ? getDateKey(targetTask.date) : null);
      const isTimer = targetTask?.quantum?.mode === 'timer';
      const currentValue = isTimer
        ? targetTask?.quantum?.progressByDate?.[baseDateKey]?.doneSeconds ?? 0
        : targetTask?.quantum?.progressByDate?.[baseDateKey]?.doneCount ?? 0;
      const limitValue = isTimer
        ? getTimerTotalSeconds(targetTask?.quantum?.timer)
        : targetTask?.quantum?.count?.value ?? 0;
      pendingCompletionActionDateRef.current = willProgressReachCompletion({
        currentValue,
        limitValue,
        direction,
        amount: deltaAmount,
      })
        ? baseDateKey
        : null;

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
  const calendarListRef = useRef(null);
  const calendarScrollRetryTimerRef = useRef(null);
  const calendarScrollRetryIndexRef = useRef(null);
  const handleCalendarScrollToIndexFailed = useCallback(({ index, averageItemLength }) => {
    if (!Number.isInteger(index) || index < 0 || calendarScrollRetryIndexRef.current === index) {
      return;
    }

    calendarScrollRetryIndexRef.current = index;
    const cachedOffset = monthLayoutsRef.current[index]?.offset;
    const estimatedOffset = Number.isFinite(cachedOffset)
      ? cachedOffset
      : Math.max(0, (averageItemLength || 0) * index);
    calendarListRef.current?.scrollToOffset({ offset: estimatedOffset, animated: false });

    if (calendarScrollRetryTimerRef.current) {
      clearTimeout(calendarScrollRetryTimerRef.current);
    }
    calendarScrollRetryTimerRef.current = setTimeout(() => {
      calendarListRef.current?.scrollToIndex({ index, animated: false });
      calendarScrollRetryIndexRef.current = null;
      calendarScrollRetryTimerRef.current = null;
    }, 100);
  }, []);
  useEffect(
    () => () => {
      if (calendarScrollRetryTimerRef.current) {
        clearTimeout(calendarScrollRetryTimerRef.current);
      }
    },
    []
  );
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const topItem = viewableItems[0];
      if (topItem && topItem.item && topItem.item.date) {
        const topMonthId = topItem.item.monthId;
        setVisibleCalendarMonthIds((previous) =>
          previous.size === 1 && previous.has(topMonthId)
            ? previous
            : new Set([topMonthId])
        );
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

    return migrateImportedTemplateTasks(storedTasks).filter(Boolean).map((task) => {
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
            if (baseDateKey && Object.keys(progressByDate).length === 0) {
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
              animation: task.quantum.animation === 'defaut'
                ? 'default'
                : task.quantum.animation,
              progressByDate,
            };
          })()
        : task.quantum;

      const reconciledQuantumState = task.type === 'quantum'
        ? reconcileQuantumCompletionState(normalizedQuantum, completedDates)
        : { quantum: normalizedQuantum, completedDates };

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
      const notificationIds = getTaskNotificationIds(task);

      return {
        ...restTask,
        dateKey: baseDateKey,
        completedDates: reconciledQuantumState.completedDates,
        subtasks: normalizedSubtasks,
        repeat: normalizeRepeatConfig(task.repeat),
        periodGoal: normalizePeriodGoal(task.periodGoal),
        quantum: reconciledQuantumState.quantum,
        notificationIds,
        notificationId: notificationIds[0] ?? null,
        notificationScheduleMode:
          task.notificationScheduleMode === 'recurring' ||
          task.notificationScheduleMode === 'queued'
            ? task.notificationScheduleMode
            : null,
      };
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const hydrateFromStorage = async () => {
      try {
        const [
          loadedTasks,
          storedSettings,
          storedHistory,
          loadedImages,
          storedMoods,
          storedAppearance,
        ] = await Promise.all([
          loadTasks(),
          loadUserSettings(),
          loadHistory(),
          loadMonthImages(),
          loadDayMoods(),
          loadMoodAppearance(),
        ]);

        let storedTasks = loadedTasks;
        let storedImages = loadedImages;
        if (Platform.OS !== 'web') {
          const migrated = await migrateCachedImages(loadedTasks, loadedImages);
          storedTasks = migrated.tasks;
          storedImages = migrated.images;

          if (Array.isArray(storedTasks) && storedImages !== undefined) {
            void cleanupOrphanImageFiles(
              storedTasks,
              storedImages,
              storedMoods,
              storedAppearance
            );
          }
        }

        // Migração: aliases antigos eram equivalentes ao tipo padrão atual.
        if (Array.isArray(storedTasks)) {
          storedTasks = storedTasks.map((task) =>
            task?.type === 'list' || task?.type === 'normal'
              ? { ...task, type: 'default' }
              : task
          );
        }

        if (!isMounted) {
          return;
        }

        const storageLoadFailures = {
          tasks: storedTasks === undefined,
          settings: storedSettings === undefined,
          history: storedHistory === undefined,
          images: storedImages === undefined,
          moods: storedMoods === undefined,
          appearance: storedAppearance === undefined,
        };
        loadFailuresRef.current = storageLoadFailures;

        if (
          Object.values(storageLoadFailures).some(Boolean) &&
          !storageProtectionAlertShownRef.current
        ) {
          storageProtectionAlertShownRef.current = true;
          const alertLanguage = storedSettings?.language ?? DEFAULT_USER_SETTINGS.language;
          const alertText = translations[alertLanguage] ?? translations.en;
          Alert.alert(
            alertText.dataProtection.loadErrorTitle,
            alertText.dataProtection.loadErrorMessage
          );
        }

        if (Array.isArray(storedTasks)) {
          setTasks(normalizeStoredTasks(storedTasks));
        }

        if (storedSettings !== undefined) {
          const mergedSettings = {
            ...DEFAULT_USER_SETTINGS,
            ...(storedSettings ?? {}),
          };
          setUserSettings(mergedSettings);
          setActiveTab(mergedSettings.activeTab ?? DEFAULT_USER_SETTINGS.activeTab);
          setSelectedTagFilter(
            mergedSettings.selectedTagFilter ?? DEFAULT_USER_SETTINGS.selectedTagFilter
          );
          if (
            Array.isArray(storedTasks) &&
            storedTasks.length === 0 &&
            mergedSettings.onboardingCompleted !== true
          ) {
            setIsOnboardingOpen(true);
          }
        }

        if (Array.isArray(storedHistory)) {
          setHistory(storedHistory);
        }

        if (storedImages) {
          setCustomMonthImages(storedImages);
        }

        if (storedAppearance && typeof storedAppearance === 'object') {
          setMoodAppearance(storedAppearance);
        }

        if (storedMoods && typeof storedMoods === 'object') {
          setDayMoods(storedMoods);
        }
      } catch (error) {
        console.warn('Failed to load stored data', error);
        if (isMounted && !storageProtectionAlertShownRef.current) {
          storageProtectionAlertShownRef.current = true;
          const alertText = translations[DEFAULT_USER_SETTINGS.language] ?? translations.en;
          Alert.alert(
            alertText.dataProtection.loadErrorTitle,
            alertText.dataProtection.loadErrorMessage
          );
        }
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

  const showStorageWriteAlert = useCallback(() => {
    const retryFailedWrites = async () => {
      const pendingWrites = Array.from(failedStorageWritesRef.current.entries());
      await Promise.all(
        pendingWrites.map(async ([storeKey, entry]) => {
          const saved = await entry.operation();
          if (saved && failedStorageWritesRef.current.get(storeKey) === entry) {
            failedStorageWritesRef.current.delete(storeKey);
          }
        })
      );
      if (failedStorageWritesRef.current.size > 0) {
        showStorageWriteAlert();
      } else {
        pendingStorageWriteAlertRef.current = false;
      }
    };
    Alert.alert(
      t.dataProtection.saveErrorTitle,
      t.dataProtection.saveErrorMessage,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.retry, onPress: () => void retryFailedWrites() },
      ]
    );
  }, [t.common.cancel, t.common.retry, t.dataProtection]);

  const reportStorageWriteResult = useCallback(
    async (storeKey, operation) => {
      const sequence = storageWriteSequenceRef.current + 1;
      storageWriteSequenceRef.current = sequence;
      latestStorageWriteSequenceRef.current.set(storeKey, sequence);
      const saved = await operation();
      if (latestStorageWriteSequenceRef.current.get(storeKey) !== sequence) {
        return saved;
      }
      if (saved) {
        const failedEntry = failedStorageWritesRef.current.get(storeKey);
        if (failedEntry && sequence >= failedEntry.sequence) {
          failedStorageWritesRef.current.delete(storeKey);
        }
        if (failedStorageWritesRef.current.size === 0) {
          pendingStorageWriteAlertRef.current = false;
        }
        return true;
      }

      const shouldNotify = failedStorageWritesRef.current.size === 0;
      const failedEntry = failedStorageWritesRef.current.get(storeKey);
      if (!failedEntry || sequence >= failedEntry.sequence) {
        failedStorageWritesRef.current.set(storeKey, { operation, sequence });
      }
      if (shouldNotify) {
        if (AppState.currentState === 'active') {
          showStorageWriteAlert();
        } else {
          pendingStorageWriteAlertRef.current = true;
        }
      }
      return false;
    },
    [showStorageWriteAlert]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        nextState === 'active' &&
        pendingStorageWriteAlertRef.current &&
        failedStorageWritesRef.current.size > 0
      ) {
        pendingStorageWriteAlertRef.current = false;
        showStorageWriteAlert();
      }
    });
    return () => subscription.remove();
  }, [showStorageWriteAlert]);

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
      void reportStorageWriteResult('tasks', () => saveTasks(normalizedTasks));
    }, 500);

    saveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isHydrated, reportStorageWriteResult, tasks]);

  useEffect(() => {
    if (!isHydrated || loadFailuresRef.current.settings) {
      return undefined;
    }

    if (settingsSaveTimeoutRef.current) {
      clearTimeout(settingsSaveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      void reportStorageWriteResult('settings', () => saveUserSettings(userSettings));
    }, 500);

    settingsSaveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isHydrated, reportStorageWriteResult, userSettings]);

  useEffect(() => {
    if (!isHydrated || loadFailuresRef.current.history) {
      return undefined;
    }

    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      void reportStorageWriteResult('history', () => saveHistory(history));
    }, 500);

    historySaveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [history, isHydrated, reportStorageWriteResult]);

  useEffect(() => {
    if (!isHydrated || loadFailuresRef.current.moods) {
      return undefined;
    }

    if (dayMoodsSaveTimeoutRef.current) {
      clearTimeout(dayMoodsSaveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      void reportStorageWriteResult('moods', () => saveDayMoods(dayMoods));
    }, 500);

    dayMoodsSaveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [dayMoods, isHydrated, reportStorageWriteResult]);

  useEffect(() => {
    tasksRef.current = tasks;
    userSettingsRef.current = userSettings;
    historyRef.current = history;
    dayMoodsRef.current = dayMoods;
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
        void reportStorageWriteResult('tasks', () => saveTasks(normalizedTasks));
      }
      if (!failures.settings && userSettingsRef.current) {
        if (settingsSaveTimeoutRef.current) {
          clearTimeout(settingsSaveTimeoutRef.current);
          settingsSaveTimeoutRef.current = null;
        }
        void reportStorageWriteResult(
          'settings',
          () => saveUserSettings(userSettingsRef.current)
        );
      }
      if (!failures.history && Array.isArray(historyRef.current)) {
        if (historySaveTimeoutRef.current) {
          clearTimeout(historySaveTimeoutRef.current);
          historySaveTimeoutRef.current = null;
        }
        void reportStorageWriteResult('history', () => saveHistory(historyRef.current));
      }
      if (!failures.moods && dayMoodsRef.current) {
        if (dayMoodsSaveTimeoutRef.current) {
          clearTimeout(dayMoodsSaveTimeoutRef.current);
          dayMoodsSaveTimeoutRef.current = null;
        }
        void reportStorageWriteResult('moods', () => saveDayMoods(dayMoodsRef.current));
      }
    });

    return () => {
      subscription.remove();
    };
  }, [reportStorageWriteResult]);

  const showDataProtectionAlert = useCallback(() => {
    Alert.alert(
      t.dataProtection.loadErrorTitle,
      t.dataProtection.loadErrorMessage
    );
  }, [t.dataProtection]);

  const handleUpdateMonthImage = useCallback(
    async (monthIndex, uri) => {
      if (loadFailuresRef.current.images) {
        showDataProtectionAlert();
        return;
      }
      const updatedImages = {
        ...customMonthImages,
        [monthIndex]: uri,
      };

      setCustomMonthImages(updatedImages);
      await reportStorageWriteResult('images', () => saveMonthImages(updatedImages));
    },
    [customMonthImages, reportStorageWriteResult, showDataProtectionAlert]
  );

  const handleExportBackup = useCallback(async () => {
    try {
      const result = await exportAppBackup({
        tasks,
        userSettings,
        history,
        monthImages: customMonthImages,
        dayMoods,
        moodAppearance,
        loadFailures: { ...loadFailuresRef.current },
      });
      if (result.status === 'cancelled') {
        return;
      }
      const messageTemplate = result.includesRecoveryData
        ? t.backup.successWithRecovery
        : t.backup.successMessage;
      Alert.alert(
        t.backup.successTitle,
        messageTemplate.split('{fileName}').join(result.fileName)
      );
    } catch (error) {
      console.warn('Failed to export backup', error);
      Alert.alert(t.backup.errorTitle, t.backup.errorMessage);
    }
  }, [
    customMonthImages,
    dayMoods,
    history,
    moodAppearance,
    t.backup,
    tasks,
    userSettings,
  ]);

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
    closeFabMenu();
    setReflectionDateKey(selectedDateKey);
  }, [closeFabMenu, selectedDateKey]);

  const handleEditReflectionForDate = useCallback((dateKey) => {
    setReflectionDateKey(dateKey);
  }, []);

  const handleSelectTimelineReflection = useCallback((dateKey) => {
    const date = normalizeDateValue(dateKey);
    if (date) {
      setSelectedDate(date);
    }
    setActivityOpen(false);
    setReflectionDateKey(dateKey);
  }, []);

  const handleCloseReflection = useCallback(() => {
    setReflectionDateKey(null);
  }, []);

  const handleSaveDayMood = useCallback((dateKey, mood) => {
    setDayMoods((previous) => {
      const next = { ...previous };
      if (mood) {
        next[dateKey] = { ...mood, updatedAt: new Date().toISOString() };
      } else {
        delete next[dateKey];
      }
      return next;
    });
    setReflectionDateKey(null);
    triggerSelection();
  }, []);

  // Aparência é pequena e muda raramente: salva na hora, sem debounce.
  // Arquivo antigo substituído é apagado depois pela limpeza de órfãos.
  const handleSetMoodAppearance = useCallback(
    (level, uri) => {
      if (loadFailuresRef.current.appearance) {
        showDataProtectionAlert();
        return;
      }
      setMoodAppearance((previous) => {
        const next = { ...previous };
        if (uri) {
          next[level] = uri;
        } else {
          delete next[level];
        }
        void reportStorageWriteResult('appearance', () => saveMoodAppearance(next));
        return next;
      });
    },
    [reportStorageWriteResult, showDataProtectionAlert]
  );

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

  const handleChangeTab = useCallback(
    (tabKey) => {
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tabKey);
      updateUserSettings({ activeTab: tabKey });
      void applyNavigationBarThemeForTab(tabKey);
    },
    [applyNavigationBarThemeForTab, updateUserSettings]
  );

  const completeOnboarding = useCallback(() => {
    setIsOnboardingOpen(false);
    updateUserSettings({ onboardingCompleted: true });
  }, [updateUserSettings]);

  const handleExploreTemplates = useCallback(() => {
    completeOnboarding();
    handleChangeTab('discover');
  }, [completeOnboarding, handleChangeTab]);

  const handleCreateFromOnboarding = useCallback(() => {
    completeOnboarding();
    handleAddHabit();
  }, [completeOnboarding, handleAddHabit]);

  const handleSkipOnboarding = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  const handleViewToday = useCallback(() => {
    handleChangeTab('today');
  }, [handleChangeTab]);

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
      const targetTask = tasksRef.current?.find((task) => task.id === taskId);
      if (!targetTask || isPassiveTaskType(targetTask)) {
        return;
      }
      const resolvedDateKey =
        initialDateKey ??
        targetTask?.dateKey ??
        (targetTask?.date ? getDateKey(targetTask.date) : null);
      const wasCompleted = targetTask
        ? getTaskCompletionStatus(targetTask, resolvedDateKey)
        : false;

      pendingCompletionActionDateRef.current = !wasCompleted ? resolvedDateKey : null;

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

      appendHistoryEntry('task_completion_toggled', createTaskHistoryDetails(targetTask, {
        dateKey: resolvedDateKey,
        completed: !wasCompleted,
      }));
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

  const getReminderContent = useCallback(
    (task) =>
      buildTaskReminderContent(
        task,
        t.notifications,
        userSettings.privateNotificationContent
      ),
    [t.notifications, userSettings.privateNotificationContent]
  );

  const updateTaskReminderSchedule = useCallback((taskId, result) => {
    setTasks((previous) =>
      previous.map((task) => {
        if (
          task.id !== taskId ||
          getTaskReminderFingerprint(task) !== result.fingerprint
        ) {
          return task;
        }
        return {
          ...task,
          notificationIds: result.notificationIds ?? [],
          notificationId: result.notificationId ?? null,
          notificationScheduleMode: result.mode ?? null,
        };
      })
    );
  }, []);

  const showReminderSchedulingError = useCallback(
    (status) => {
      if (status === 'permission-denied') {
        Alert.alert(
          t.notifications.permissionTitle,
          t.notifications.permissionMessage
        );
        return;
      }
      if (status === 'invalid-time') {
        Alert.alert(
          t.notifications.timeRequiredTitle,
          t.notifications.timeRequiredMessage
        );
        return;
      }
      if (status === 'no-upcoming') {
        Alert.alert(
          t.notifications.noUpcomingTitle,
          t.notifications.noUpcomingMessage
        );
        return;
      }
      if (status === 'unsupported') {
        Alert.alert(
          t.notifications.unsupportedTitle,
          t.notifications.unsupportedMessage
        );
        return;
      }
      if (status === 'error') {
        Alert.alert(
          t.notifications.scheduleErrorTitle,
          t.notifications.scheduleErrorMessage
        );
      }
    },
    [t.notifications]
  );

  const refreshTaskReminder = useCallback(
    async (task, existingTask = null, { notifyOnFailure = false } = {}) => {
      try {
        if (existingTask) {
          await cancelTaskReminders(existingTask);
        }
        const result = await scheduleTaskReminders(task, {
          requestPermission: false,
          content: getReminderContent(task),
        });
        updateTaskReminderSchedule(task.id, result);
        if (notifyOnFailure) {
          showReminderSchedulingError(result.status);
        }
        return result;
      } catch (error) {
        const result = {
          status: 'error',
          mode: null,
          notificationIds: [],
          notificationId: null,
          fingerprint: getTaskReminderFingerprint(task),
          error,
        };
        updateTaskReminderSchedule(task.id, result);
        if (notifyOnFailure) {
          showReminderSchedulingError(result.status);
        }
        return result;
      }
    },
    [getReminderContent, showReminderSchedulingError, updateTaskReminderSchedule]
  );

  const handleUndoTaskDeletion = useCallback(() => {
    if (!pendingTaskDeletion) {
      return;
    }
    if (taskDeleteUndoTimeoutRef.current) {
      clearTimeout(taskDeleteUndoTimeoutRef.current);
      taskDeleteUndoTimeoutRef.current = null;
    }
    const restoredTask = {
      ...pendingTaskDeletion.task,
      notificationIds: [],
      notificationId: null,
      notificationScheduleMode: null,
    };
    setPendingTaskDeletion(null);
    setTasks((previous) =>
      restoreDeletedTaskAtIndex(
        previous,
        restoredTask,
        pendingTaskDeletion.originalIndex
      )
    );
    setHistory((previous) =>
      previous.filter((entry) => entry.id !== pendingTaskDeletion.historyEntryId)
    );
    void refreshTaskReminder(restoredTask, null, { notifyOnFailure: true });
    AccessibilityInfo.announceForAccessibility(t.taskCard.restoredTask);
  }, [pendingTaskDeletion, refreshTaskReminder, t.taskCard.restoredTask]);

  const pendingTaskDeletionMessage = pendingTaskDeletion
    ? t.taskCard.deletedTask.replace(
        '{title}',
        pendingTaskDeletion.task.title ?? t.common.untitledTask
      )
    : null;

  const reconcileAllTaskReminders = useCallback(
    async (taskSnapshot) => {
      pendingReminderReconciliationRef.current = {
        tasks: taskSnapshot,
        getContent: getReminderContent,
      };
      if (reminderReconciliationInFlightRef.current) {
        return;
      }
      reminderReconciliationInFlightRef.current = true;
      try {
        while (pendingReminderReconciliationRef.current) {
          const request = pendingReminderReconciliationRef.current;
          pendingReminderReconciliationRef.current = null;
          try {
            const result = await reconcileTaskReminderSchedules(request.tasks, {
              getContent: request.getContent,
            });
            if (result.errors.length) {
              console.warn('Failed to reconcile some task reminders', result.errors);
            }
            if (!result.updates.length) {
              continue;
            }

            const currentTasksById = new Map(
              (tasksRef.current ?? []).map((task) => [task.id, task])
            );
            const applicableUpdates = result.updates.filter((update) => {
              const currentTask = currentTasksById.get(update.taskId);
              const isCurrent =
                currentTask &&
                getTaskReminderFingerprint(currentTask) === update.fingerprint;
              if (!isCurrent && update.notificationIds?.length) {
                void cancelTaskReminders(update.notificationIds);
              }
              return isCurrent;
            });
            if (!applicableUpdates.length) {
              continue;
            }

            const updatesById = new Map(
              applicableUpdates.map((update) => [update.taskId, update])
            );
            setTasks((previous) =>
              previous.map((task) => {
                const update = updatesById.get(task.id);
                if (!update || getTaskReminderFingerprint(task) !== update.fingerprint) {
                  return task;
                }
                return {
                  ...task,
                  notificationIds: update.notificationIds,
                  notificationId: update.notificationId,
                  notificationScheduleMode: update.notificationScheduleMode,
                };
              })
            );
          } catch (error) {
            console.warn('Failed to reconcile task reminders', error);
          }
        }
      } finally {
        reminderReconciliationInFlightRef.current = false;
      }
    },
    [getReminderContent]
  );

  useEffect(() => {
    if (!isHydrated || didInitialReminderReconciliationRef.current) {
      return;
    }
    didInitialReminderReconciliationRef.current = true;
    void reconcileAllTaskReminders(tasks);
  }, [isHydrated, reconcileAllTaskReminders, tasks]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    const signature = `${language}:${userSettings.privateNotificationContent !== false}`;
    if (reminderContentSignatureRef.current === null) {
      reminderContentSignatureRef.current = signature;
      return;
    }
    if (reminderContentSignatureRef.current === signature) {
      return;
    }
    reminderContentSignatureRef.current = signature;
    void reconcileAllTaskReminders(tasksRef.current ?? []);
  }, [
    isHydrated,
    language,
    reconcileAllTaskReminders,
    userSettings.privateNotificationContent,
  ]);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void reconcileAllTaskReminders(tasksRef.current ?? []);
      }
    });
    const notificationSubscription = NOTIFICATIONS_SUPPORTED
      ? Notifications.addNotificationReceivedListener(() => {
          void reconcileAllTaskReminders(tasksRef.current ?? []);
        })
      : null;
    return () => {
      subscription.remove();
      notificationSubscription?.remove();
    };
  }, [isHydrated, reconcileAllTaskReminders]);

  useEffect(() => {
    if (!pendingImportedReminderReconciliationRef.current) {
      return;
    }
    pendingImportedReminderReconciliationRef.current = false;
    reminderContentSignatureRef.current =
      `${language}:${userSettings.privateNotificationContent !== false}`;
    void reconcileAllTaskReminders(tasks);
  }, [language, reconcileAllTaskReminders, tasks, userSettings.privateNotificationContent]);

  const applyImportedBackup = useCallback(
    async (importedData) => {
      const rawSettings = importedData.userSettings ?? {};
      const nextSettings = {
        ...DEFAULT_USER_SETTINGS,
        language: rawSettings.language === 'pt' ? 'pt' : 'en',
        activeTab: ['today', 'calendar', 'discover', 'profile'].includes(rawSettings.activeTab)
          ? rawSettings.activeTab
          : DEFAULT_USER_SETTINGS.activeTab,
        selectedTagFilter:
          typeof rawSettings.selectedTagFilter === 'string'
            ? rawSettings.selectedTagFilter
            : DEFAULT_USER_SETTINGS.selectedTagFilter,
        privateNotificationContent: rawSettings.privateNotificationContent !== false,
        onboardingCompleted: rawSettings.onboardingCompleted === true,
      };
      const normalizedTasks = normalizeStoredTasks(
        importedData.tasks.map((task) =>
          task?.type === 'list' || task?.type === 'normal'
            ? { ...task, type: 'default' }
            : task
        )
      ).map((task) => {
        const { typeLabel, ...restTask } = task;
        return {
          ...restTask,
          notificationIds: [],
          notificationId: null,
          notificationScheduleMode: null,
        };
      });
      const nextHistory = importedData.history.slice();
      const replacementData = {
        tasks: normalizedTasks,
        userSettings: nextSettings,
        history: nextHistory,
        monthImages: importedData.monthImages,
        dayMoods: importedData.dayMoods,
        moodAppearance: importedData.moodAppearance,
      };

      [
        saveTimeoutRef,
        settingsSaveTimeoutRef,
        historySaveTimeoutRef,
        dayMoodsSaveTimeoutRef,
      ].forEach((timeoutRef) => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      });

      const saved = await replaceStoredAppData(replacementData);
      if (!saved) {
        // Reagenda os autosaves atuais que foram cancelados antes da tentativa.
        setTasks((previous) => previous.slice());
        setUserSettings((previous) => ({ ...previous }));
        setHistory((previous) => previous.slice());
        setDayMoods((previous) => ({ ...previous }));
        Alert.alert(t.backup.restoreErrorTitle, t.backup.restoreErrorMessage);
        return;
      }

      await Promise.all(
        tasks.map((task) => cancelTaskReminders(task).catch(() => undefined))
      );
      loadFailuresRef.current = {
        tasks: false,
        settings: false,
        history: false,
        images: false,
        moods: false,
        appearance: false,
      };
      failedStorageWritesRef.current.clear();
      latestStorageWriteSequenceRef.current.clear();
      pendingStorageWriteAlertRef.current = false;
      storageProtectionAlertShownRef.current = false;
      pendingImportedReminderReconciliationRef.current = true;

      setTasks(normalizedTasks);
      setUserSettings(nextSettings);
      setActiveTab(nextSettings.activeTab);
      setSelectedTagFilter(nextSettings.selectedTagFilter);
      setHistory(nextHistory);
      setCustomMonthImages(importedData.monthImages);
      setDayMoods(importedData.dayMoods);
      setMoodAppearance(importedData.moodAppearance);
      setActiveTaskId(null);
      setActiveProfileTaskId(null);
      setProfileFilterId(null);
      setReportDate(null);
      setReflectionDateKey(null);
      setProfileTasksOpen(false);
      setActivityOpen(false);
      setLocalSummaryOpen(false);
      setSettingsOpen(false);
      Alert.alert(t.backup.restoreSuccessTitle, t.backup.restoreSuccessMessage);
    },
    [normalizeStoredTasks, t.backup, tasks]
  );

  const handleImportBackup = useCallback(async () => {
    try {
      const selected = await selectLatestAppBackupFromDirectory();
      if (selected.status === 'cancelled') {
        return;
      }
      if (selected.status === 'unsupported') {
        Alert.alert(t.backup.unsupportedTitle, t.backup.unsupportedMessage);
        return;
      }
      if (selected.status !== 'selected') {
        Alert.alert(t.backup.notFoundTitle, t.backup.notFoundMessage);
        return;
      }

      const prepared = await prepareImportedBackupData(selected.data);
      const locale = language === 'pt' ? 'pt-BR' : 'en-US';
      const exportedDate = new Date(selected.preview.exportedAt).toLocaleString(locale);
      const replaceToken = (value, token, replacement) =>
        value.split(token).join(String(replacement));
      let previewMessage = t.backup.previewMessage;
      [
        ['{date}', exportedDate],
        ['{tasks}', selected.preview.taskCount],
        ['{reflections}', selected.preview.reflectionCount],
        ['{history}', selected.preview.historyCount],
        ['{media}', selected.preview.referencedMediaCount],
      ].forEach(([token, value]) => {
        previewMessage = replaceToken(previewMessage, token, value);
      });
      if (prepared.missingMediaCount > 0) {
        previewMessage += prepared.missingMediaCount === 1
          ? t.backup.missingMediaOne
          : replaceToken(
              t.backup.missingMediaMany,
              '{count}',
              prepared.missingMediaCount
            );
      }
      previewMessage += t.backup.replaceWarning;

      Alert.alert(t.backup.previewTitle, previewMessage, [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.backup.restoreConfirm,
          style: 'destructive',
          onPress: () => void applyImportedBackup(prepared.data),
        },
      ]);
    } catch (error) {
      console.warn('Failed to import backup', error);
      Alert.alert(t.backup.importErrorTitle, t.backup.importErrorMessage);
    }
  }, [applyImportedBackup, language, t.backup, t.common.cancel]);

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
      type: habit?.type ?? 'default',
      quantum: habit?.type === 'quantum' ? habit?.quantum : null,
      profileLocked: false,
      notificationIds: [],
      notificationId: null,
      notificationScheduleMode: null,
    };
    setTasks((previous) => [...previous, newTask]);
    void refreshTaskReminder(newTask, null, { notifyOnFailure: true });
    setSelectedDate(normalizedDate);
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    appendHistoryEntry('task_created', {
      taskId: newTask.id,
      title,
      dateKey: newTask.dateKey,
    });
  }, [appendHistoryEntry, convertSubtasks, getUniqueTitle, refreshTaskReminder]);

  const handleImportTemplate = useCallback(
    (templateId, selectedTaskIds) => {
      const template = getTaskTemplateCollection(templateId);
      const localizedTemplate = t.discover.templates?.[templateId];
      if (!template || !localizedTemplate) {
        return 0;
      }

      const importedTasks = buildTemplateTasks({
        template,
        selectedTaskIds,
        localizedTemplate,
        existingTasks: tasks,
        startDate: today,
        fallbackTitle: t.common.untitledTask,
      });
      if (importedTasks.length === 0) {
        return 0;
      }

      setTasks((previous) => [...previous, ...importedTasks]);
      importedTasks.forEach((task) => {
        void refreshTaskReminder(task, null, { notifyOnFailure: true });
        appendHistoryEntry('task_created', {
          taskId: task.id,
          title: task.title,
          dateKey: task.dateKey,
        });
      });
      setSelectedDate(new Date(today));
      setIsOnboardingOpen(false);
      updateUserSettings({ onboardingCompleted: true });
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      return importedTasks.length;
    },
    [
      appendHistoryEntry,
      refreshTaskReminder,
      t.common.untitledTask,
      t.discover.templates,
      tasks,
      today,
      updateUserSettings,
    ]
  );

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
      const nextDate = normalizedDate ? new Date(normalizedDate) : new Date(existingTask.date);
      nextDate.setHours(0, 0, 0, 0);
      const nextType = habit?.type ?? existingTask.type;
      const nextQuantum = habit?.quantum ?? existingTask.quantum;
      const {
        completedDates: nextCompletedDates,
        quantum: mergedQuantum,
      } = reconcileTaskProgressOnEdit(existingTask, nextType, nextQuantum);
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
            type: nextType,
            typeLabel: undefined,
            completedDates: nextCompletedDates,
            quantum: mergedQuantum,
            date: nextDate,
            dateKey: getDateKey(nextDate),
            profileLocked: task.profileLocked ?? false,
            notificationIds: [],
            notificationId: null,
            notificationScheduleMode: null,
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
          type: nextType,
          typeLabel: undefined,
          completedDates: nextCompletedDates,
          quantum: mergedQuantum,
          date: nextDate,
          dateKey: getDateKey(nextDate),
          profileLocked: existingTask.profileLocked ?? false,
          notificationIds: [],
          notificationId: null,
          notificationScheduleMode: null,
        };
        void refreshTaskReminder(updatedTask, existingTask, { notifyOnFailure: true });
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
      appendHistoryEntry('subtask_completion_toggled', createTaskHistoryDetails(targetTask, {
        subtaskId,
        subtaskTitle: targetSubtask?.title,
        dateKey: targetDateKey,
        completed: !wasCompleted,
      }));
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
      const originalIndex = (tasksRef.current ?? []).findIndex(
        (current) => current.id === task.id
      );
      void cancelTaskReminders(task);
      preserveTaskTitlesInHistory([task]);
      setTasks((previous) => previous.filter((current) => current.id !== task.id));
      const historyEntryId = appendHistoryEntry(
        'task_deleted',
        createTaskHistoryDetails(task)
      );
      queueTaskDeletionUndo(task, originalIndex, historyEntryId);
    },
    [appendHistoryEntry, preserveTaskTitlesInHistory, queueTaskDeletionUndo]
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
        accessibilityLabel={t.common.tabAccessibility.replace('{label}', label)}
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
                      accessibilityLabel={t.today.showAllTags}
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
          ) : activeTab === 'calendar' ? null : activeTab === 'profile' ? (
             <ScrollView
               style={{ flex: 1 }}
               contentContainerStyle={styles.profileScrollContent}
               showsVerticalScrollIndicator={false}
             >
                {/* Cabeçalho compacto: título + data e atalho pras configurações */}
                <View style={styles.profileHeaderRow}>
                  <View>
                    <Text style={styles.todayDateEyebrow}>
                      {today
                        .toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', {
                          day: 'numeric',
                          month: 'long',
                        })
                        .toUpperCase()}
                    </Text>
                    <Text style={styles.profileHeaderTitle}>{t.tabs.profile}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.profileSettingsButton}
                    onPress={() => setSettingsOpen(true)}
                    hitSlop={8}
                    activeOpacity={0.75}
                    accessibilityLabel={t.profile.settings}
                  >
                    <Ionicons name="settings-outline" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>

                {/* Filtro: geral ou um hábito específico — alimenta gráfico e stats */}
                {tasks.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.profileChipsScroll}
                    contentContainerStyle={styles.profileChipsContent}
                  >
                    <TouchableOpacity
                      style={[
                        styles.profileFilterChip,
                        !profileFilterTask && styles.profileFilterChipSelected,
                      ]}
                      onPress={() => setProfileFilterId(null)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.profileFilterChipText,
                          !profileFilterTask && styles.profileFilterChipTextSelected,
                        ]}
                      >
                        {t.profile.overallSeries}
                      </Text>
                    </TouchableOpacity>
                    {tasks.map((task) => {
                      const isSelected = task.id === profileFilterId;
                      return (
                        <TouchableOpacity
                          key={task.id}
                          style={[
                            styles.profileFilterChip,
                            isSelected && styles.profileFilterChipSelected,
                          ]}
                          onPress={() => setProfileFilterId(isSelected ? null : task.id)}
                          activeOpacity={0.75}
                        >
                          {task.customImage ? (
                            <Image
                              source={{ uri: task.customImage }}
                              style={styles.profileFilterChipImage}
                            />
                          ) : null}
                          <Text
                            style={[
                              styles.profileFilterChipText,
                              isSelected && styles.profileFilterChipTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {task.customImage
                              ? task.title
                              : `${task.emoji ? `${task.emoji} ` : ''}${task.title}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : null}

                <PerformanceChart
                  tasks={tasks}
                  language={language}
                  selectedTask={profileFilterTask}
                />

                {profileFilterTask ? (
                  <PeriodGoalSummaryCard
                    task={profileFilterTask}
                    language={language}
                    referenceDate={today}
                    onEdit={setPeriodGoalTaskId}
                  />
                ) : null}

                <View style={styles.profileStatsSection}>
                  <Text style={styles.profileStatsTitle}>{t.profile.stats}</Text>
                  <View style={styles.profileStatsGrid}>
                    <View style={styles.profileStatCard}>
                      <View style={styles.profileStatHeaderRow}>
                        <Text style={styles.profileStatLabel}>{t.profile.totalDays}</Text>
                        <Ionicons name="calendar-outline" size={14} color="#8a86a8" />
                      </View>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.totalDays}</Text>
                        <Text style={styles.profileStatUnit}>{totalDaysUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <View style={styles.profileStatHeaderRow}>
                        <Text style={styles.profileStatLabel}>
                          {profileFilterTask ? t.profile.completions : t.profile.committedHabits}
                        </Text>
                        <Ionicons
                          name={profileFilterTask ? 'checkmark-done-outline' : 'list-outline'}
                          size={14}
                          color="#8a86a8"
                        />
                      </View>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>
                          {profileFilterTask ? profileStats.completions : profileStats.committedHabits}
                        </Text>
                        {!profileFilterTask ? (
                          <Text style={styles.profileStatUnit}>{habitsUnit}</Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <View style={styles.profileStatHeaderRow}>
                        <Text style={styles.profileStatLabel}>{t.profile.currentStreak}</Text>
                        <Ionicons name="flame" size={14} color="#f59e0b" />
                      </View>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.currentStreak}</Text>
                        <Text style={styles.profileStatUnit}>{currentStreakUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <View style={styles.profileStatHeaderRow}>
                        <Text style={styles.profileStatLabel}>{t.profile.bestStreak}</Text>
                        <Ionicons name="trophy-outline" size={14} color="#8a86a8" />
                      </View>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.bestStreak}</Text>
                        <Text style={styles.profileStatUnit}>{bestStreakUnit}</Text>
                      </View>
                    </View>
                  </View>
                  {profileStats.isStreakRangeLimited ? (
                    <Text style={styles.profileStatsRangeHint}>
                      {t.profile.streakWindowHint}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.profileMoodSection}>
                  <Text style={styles.profileStatsTitle}>{t.profile.moodWeek}</Text>
                  <View style={styles.profileMoodRow}>
                    {weekMoodDays.map((day) => (
                      <TouchableOpacity
                        key={day.key}
                        style={styles.profileMoodCell}
                        onPress={() => handleEditReflectionForDate(day.key)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.profileMoodDayLabel}>{day.label}</Text>
                        <View
                          style={[
                            styles.profileMoodEmojiCircle,
                            day.isToday && styles.profileMoodEmojiCircleToday,
                          ]}
                        >
                          {day.image ? (
                            <Image
                              source={{ uri: day.image }}
                              style={styles.profileMoodImage}
                            />
                          ) : day.emoji ? (
                            <Text style={styles.profileMoodEmoji}>{day.emoji}</Text>
                          ) : (
                            <Ionicons name="add" size={16} color="#c1bdd8" />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.profileSummaryActionCard}
                  onPress={() => setLocalSummaryOpen(true)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t.localSummary.open}
                  accessibilityHint={t.localSummary.openHint}
                >
                  <View style={styles.profileSummaryActionIcon}>
                    <Ionicons name="reader-outline" size={22} color="#3c2ba7" />
                  </View>
                  <View style={styles.profileSummaryActionText}>
                    <Text style={styles.profileSummaryActionTitle}>
                      {t.localSummary.open}
                    </Text>
                    <Text style={styles.profileSummaryActionHint}>
                      {t.localSummary.openHint}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color="#9693a8" />
                </TouchableOpacity>

                {/* Ações rápidas: cards leves em vez de botões roxos empilhados */}
                <View style={styles.profileActionsRow}>
                  <TouchableOpacity
                    style={styles.profileActionCard}
                    onPress={handleOpenProfileTasks}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="list-outline" size={20} color="#3c2ba7" />
                    <Text style={styles.profileActionText}>{t.profile.openTasks}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.profileActionCard}
                    onPress={() => setActivityOpen(true)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="time-outline" size={20} color="#3c2ba7" />
                    <Text style={styles.profileActionText}>{t.profile.activity}</Text>
                  </TouchableOpacity>
                </View>
             </ScrollView>
          ) : (
            <DiscoverScreen
              language={language}
              tasks={tasks}
              onImportTemplate={handleImportTemplate}
              onCreateTask={handleAddHabit}
              onViewToday={handleViewToday}
            />
          )}
          {(hasMountedCalendar || isCalendarTabActive) ? (
            <View
              key="calendar-tab"
              style={[{ flex: 1, width: '100%' }, !isCalendarTabActive && { display: 'none' }]}
              pointerEvents={isCalendarTabActive ? 'auto' : 'none'}
              importantForAccessibility={isCalendarTabActive ? 'auto' : 'no-hide-descendants'}
            >
              <StickyMonthHeader
                date={visibleCalendarDate}
                customImages={customMonthImages}
                language={language}
              />

              <FlatList
                ref={calendarListRef}
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
                onScrollToIndexFailed={handleCalendarScrollToIndexFailed}
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
          ) : null}
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
            accessibilityHint={t.common.closeAddMenuHint}
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
                    height: cardHeight,
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
                      paddingHorizontal: isCompact ? 14 : 18,
                      paddingVertical: isCompact ? 12 : 16,
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
                          marginBottom: isCompact ? 8 : 10,
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
                          lineHeight: isCompact ? 19 : 21,
                          marginBottom: isCompact ? 4 : 6,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {t.fab.addHabit}
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        {
                          fontSize: isCompact ? 11 : 12,
                          lineHeight: isCompact ? 15 : 17,
                        },
                      ]}
                      numberOfLines={3}
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
                    height: cardHeight,
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
                      paddingHorizontal: isCompact ? 14 : 18,
                      paddingVertical: isCompact ? 12 : 16,
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
                          marginBottom: isCompact ? 8 : 10,
                        },
                      ]}
                      resizeMode="contain"
                      accessible
                      accessibilityLabel={t.fab.addReflectionIllustration}
                    />
                    <Text
                      style={[
                        styles.fabCardTitle,
                        {
                          fontSize: isCompact ? 16 : 17,
                          lineHeight: isCompact ? 19 : 21,
                          marginBottom: isCompact ? 4 : 6,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {t.fab.addReflection}
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        {
                          fontSize: isCompact ? 11 : 12,
                          lineHeight: isCompact ? 15 : 17,
                        },
                      ]}
                      numberOfLines={3}
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
      {!isProfileTasksOpen ? (
        <UndoSnackbar
          message={pendingTaskDeletionMessage}
          actionLabel={t.common.undo}
          onAction={handleUndoTaskDeletion}
          bottom={insets.bottom + 112}
        />
      ) : null}
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
        mood={reportDate ? dayMoods[getDateKey(reportDate)] ?? null : null}
        moodAppearance={moodAppearance}
        onEditReflection={handleEditReflectionForDate}
      />
      <ReflectionSheet
        visible={Boolean(reflectionDateKey)}
        dateKey={reflectionDateKey}
        mood={reflectionDateKey ? dayMoods[reflectionDateKey] ?? null : null}
        onSave={handleSaveDayMood}
        onClose={handleCloseReflection}
        language={language}
        moodAppearance={moodAppearance}
        onSetAppearance={handleSetMoodAppearance}
      />
      <FirstRunOnboarding
        visible={isOnboardingOpen}
        language={language}
        onExploreTemplates={handleExploreTemplates}
        onCreateTask={handleCreateFromOnboarding}
        onSkip={handleSkipOnboarding}
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
      <SettingsSheet
        visible={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        privateNotificationContent={userSettings.privateNotificationContent !== false}
        onChangeLanguage={(key) => updateUserSettings({ language: key })}
        onChangePrivateNotificationContent={(value) =>
          updateUserSettings({ privateNotificationContent: value })
        }
        onCustomizeCalendar={() => setCustomizeCalendarOpen(true)}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
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
        undoMessage={pendingTaskDeletionMessage}
        undoActionLabel={t.common.undo}
        onUndoDelete={handleUndoTaskDeletion}
        language={language}
      />
      <ActivityTimelineModal
        visible={isActivityOpen}
        history={history}
        dayMoods={dayMoods}
        tasks={tasks}
        onClose={() => setActivityOpen(false)}
        onSelectReflection={handleSelectTimelineReflection}
        language={language}
      />
      <LocalSummaryModal
        visible={isLocalSummaryOpen}
        tasks={tasks}
        dayMoods={dayMoods}
        referenceDate={today}
        language={language}
        onClose={() => setLocalSummaryOpen(false)}
      />
      <ProfileTaskDetailModal
        language={language}
        visible={isProfileTasksOpen && !!activeProfileTaskId}
        task={activeProfileTask}
        onClose={() => setActiveProfileTaskId(null)}
        onToggleLock={handleToggleProfileTaskLock}
        onEditPeriodGoal={(taskId) => {
          setActiveProfileTaskId(null);
          setPeriodGoalTaskId(taskId);
        }}
      />
      <PeriodGoalModal
        visible={Boolean(periodGoalTask)}
        task={periodGoalTask}
        language={language}
        onClose={() => setPeriodGoalTaskId(null)}
        onSave={handleSavePeriodGoal}
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
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }, []);

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <ScheduleApp />
        </SafeAreaView>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
