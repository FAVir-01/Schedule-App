import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  AccessibilityInfo,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Platform,
  Image,
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
import {
  createCenteredDateWindow,
  getCalendarDayOffset,
} from './utils/todayNavigationUtils';
import { getInterruptedTaskReorderOffset } from './utils/taskReorderUtils';
import { clampValue } from './utils/mathUtils';
import {
  getSubtaskCompletionStatus,
  getTaskCompletionStatus,
  getTaskTagDisplayLabel,
  normalizeTaskTagKey,
  isPassiveTaskType,
  isReminderExpiredForDate,
  isTaskArchived,
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
import ReflectionFeed from './components/ReflectionFeed';
import CustomizeCalendarModal from './components/CustomizeCalendarModal';
import DayReportModal from './components/DayReportModal';
import TaskDetailModal from './components/TaskDetailModal';
import ProfileTaskDetailModal from './components/ProfileTaskDetailModal';
import ActivityTimelineModal from './components/ActivityTimelineModal';
import LocalSummaryModal from './components/LocalSummaryModal';
import ProfileTasksModal from './components/ProfileTasksModal';
import ProfileFilterSheet from './components/ProfileFilterSheet';
import SwipeableTaskCard from './components/SwipeableTaskCard';
import ReflectionSheet from './components/ReflectionSheet';
import SettingsSheet from './components/SettingsSheet';
import PerformanceChart from './components/PerformanceChart';
import AppErrorBoundary from './components/AppErrorBoundary';
import UndoSnackbar from './components/UndoSnackbar';
import DiscoverScreen, { FirstRunOnboarding } from './components/DiscoverScreen';
import { CALENDAR_DAY_SIZE, WEEKDAY_ROW_HEIGHT } from './constants/layout';
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
import { authenticateDiaryAccess } from './services/diaryPrivacyService';
import { buildTemplateTasks, migrateImportedTemplateTasks } from './utils/templateUtils';


const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');
const TASK_DELETE_UNDO_DURATION_MS = 6000;
const PROFILE_OVERALL_FILTER_ITEM = Object.freeze({ id: '__overall__' });
const PROFILE_FILTER_MORE_ITEM = Object.freeze({ id: '__more__' });
const TODAY_VISIBLE_DATE_RADIUS = 3;
const TODAY_DATE_WINDOW_RADIUS = 45;
const TODAY_DATE_TRANSITION_OUT_MS = 240;
const TODAY_DATE_TRANSITION_IN_MS = 280;
const TODAY_TASK_REORDER_MS = 300;
const DIARY_BACKGROUND_LOCK_DELAY_MS = 5 * 60 * 1000;

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
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}




function ScheduleApp() {
  const [userSettings, setUserSettings] = useState(DEFAULT_USER_SETTINGS);
  const [activeTab, setActiveTab] = useState(DEFAULT_USER_SETTINGS.activeTab);
  // Aba calendar tem dois modos: grade de meses ou feed de reflexões.
  const [calendarViewMode, setCalendarViewMode] = useState('calendar');
  const [hasMountedFeed, setHasMountedFeed] = useState(false);
  const [hasShownCalendarList, setHasShownCalendarList] = useState(false);
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
  const [todayDateWindowAnchor, setTodayDateWindowAnchor] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [pendingTodayDateKey, setPendingTodayDateKey] = useState(null);
  const [isTodayPageTransitioning, setIsTodayPageTransitioning] = useState(false);
  const todayPageTransitioningRef = useRef(false);
  const todayPageTransitionSequenceRef = useRef(0);
  const todayDayStripRef = useRef(null);
  const todayPageTranslateX = useRef(new Animated.Value(0)).current;
  const todayPageOpacity = useRef(new Animated.Value(1)).current;
  // A troca de categoria movimenta apenas os cards. A troca de dia continua
  // usando os valores da pagina inteira (cabecalho, filtros e conteudo).
  const todayCardsTranslateX = useRef(new Animated.Value(0)).current;
  const todayCardsOpacity = useRef(new Animated.Value(1)).current;
  const todayContentTranslateX = useMemo(
    () => Animated.add(todayPageTranslateX, todayCardsTranslateX),
    [todayCardsTranslateX, todayPageTranslateX]
  );
  const todayContentOpacity = useMemo(
    () => Animated.multiply(todayPageOpacity, todayCardsOpacity),
    [todayCardsOpacity, todayPageOpacity]
  );
  const [tasks, setTasks] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeProfileTaskId, setActiveProfileTaskId] = useState(null);
  const [pendingTaskDeletion, setPendingTaskDeletion] = useState(null);
  // Undo do swipe "Arquivar" na aba Hoje (exclusão só existe em Arquivadas).
  const [pendingTaskArchive, setPendingTaskArchive] = useState(null);
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
  const [isProfileFilterSheetOpen, setProfileFilterSheetOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isDiaryUnlocked, setDiaryUnlocked] = useState(false);
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
  const taskArchiveUndoTimeoutRef = useRef(null);
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
  const diaryAuthenticationPromiseRef = useRef(null);
  const diaryBackgroundedAtRef = useRef(null);
  const pendingCompletionActionDateRef = useRef(null);
  const taskPositionsRef = useRef(new Map());
  const taskAnimationsRef = useRef(new Map());
  const taskReorderAnimationsRef = useRef(new Map());
  const taskReorderGenerationsRef = useRef(new Map());
  const taskPositionContextRef = useRef(null);
  const isDiaryPrivacyEnabled = userSettings.protectPrivateReflections === true;

  const runDiaryAuthentication = useCallback(async () => {
    if (diaryAuthenticationPromiseRef.current) {
      return diaryAuthenticationPromiseRef.current;
    }

    const authenticationPromise = (async () => {
      const result = await authenticateDiaryAccess(t.diaryPrivacy);
      if (result.success) {
        setDiaryUnlocked(true);
        return true;
      }
      if (result.reason === 'cancelled') {
        return false;
      }
      if (result.reason === 'not_configured') {
        Alert.alert(
          t.diaryPrivacy.notConfiguredTitle,
          t.diaryPrivacy.notConfiguredMessage
        );
        return false;
      }
      if (result.reason === 'unavailable') {
        Alert.alert(t.diaryPrivacy.unavailableTitle, t.diaryPrivacy.unavailableMessage);
        return false;
      }
      Alert.alert(t.diaryPrivacy.failedTitle, t.diaryPrivacy.failedMessage);
      return false;
    })();

    diaryAuthenticationPromiseRef.current = authenticationPromise;
    try {
      return await authenticationPromise;
    } finally {
      if (diaryAuthenticationPromiseRef.current === authenticationPromise) {
        diaryAuthenticationPromiseRef.current = null;
      }
    }
  }, [t.diaryPrivacy]);

  const requestDiaryUnlock = useCallback(async () => {
    if (!isDiaryPrivacyEnabled || isDiaryUnlocked) {
      return true;
    }
    return runDiaryAuthentication();
  }, [isDiaryPrivacyEnabled, isDiaryUnlocked, runDiaryAuthentication]);

  const handleChangeDiaryProtection = useCallback(
    async (shouldProtect) => {
      if (shouldProtect === isDiaryPrivacyEnabled) {
        return true;
      }
      if (!(await runDiaryAuthentication())) {
        return false;
      }
      updateUserSettings({ protectPrivateReflections: shouldProtect });
      setDiaryUnlocked(shouldProtect);
      return true;
    },
    [isDiaryPrivacyEnabled, runDiaryAuthentication, updateUserSettings]
  );

  const handleLockDiaryNow = useCallback(() => {
    setDiaryUnlocked(false);
  }, []);
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
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;
  const isBottomBarLargeText = fontScale >= 1.6;
  const profileContentWidth = Math.max(0, width - 48);
  const fabSize = isCompact ? 48 : 56;
  const centerGap = isBottomBarLargeText
    ? fabSize * 0.72
    : isCompact
      ? fabSize * 0.8
      : fabSize * 0.95;
  const horizontalPadding = useMemo(() => Math.max(16, Math.min(32, width * 0.06)), [width]);
  const todayDayItemWidth = Math.max(
    1,
    (width - insets.left - insets.right - horizontalPadding * 2) /
      (TODAY_VISIBLE_DATE_RADIUS * 2 + 1)
  );
  const todayPageTravelDistance = Math.max(28, Math.min(72, width * 0.16));
  const bottomBarPadding = useMemo(
    () =>
      isBottomBarLargeText
        ? Math.max(6, Math.min(10, width * 0.02))
        : Math.max(16, horizontalPadding * 0.75),
    [horizontalPadding, isBottomBarLargeText, width]
  );
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
  // A linha de iniciais dos dias da semana também conta p/ o getItemLayout.
  const MARGINS = 42;
  const BASE_HEIGHT = HEADER_HEIGHT + MARGINS + WEEKDAY_ROW_HEIGHT;
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

  useEffect(() => {
    if (!isDiaryPrivacyEnabled) {
      diaryBackgroundedAtRef.current = null;
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        if (diaryBackgroundedAtRef.current == null) {
          diaryBackgroundedAtRef.current = Date.now();
        }
        return;
      }
      if (nextState === 'active') {
        const backgroundedAt = diaryBackgroundedAtRef.current;
        diaryBackgroundedAtRef.current = null;
        if (
          backgroundedAt != null &&
          Date.now() - backgroundedAt >= DIARY_BACKGROUND_LOCK_DELAY_MS
        ) {
          setDiaryUnlocked(false);
        }
      }
    });

    return () => subscription.remove();
  }, [isDiaryPrivacyEnabled]);

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
    return createCenteredDateWindow(todayDateWindowAnchor, TODAY_DATE_WINDOW_RADIUS).map((date) => {
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
        accessibilityLabel: date.toLocaleDateString(
          language === 'pt' ? 'pt-BR' : 'en-US',
          { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
        ),
        allCompleted,
      };
    });
  }, [language, tasks, todayDateWindowAnchor]);
  const selectedDateOffsetFromWindow = getCalendarDayOffset(
    todayDateWindowAnchor,
    selectedDate
  );
  const selectedDateWindowIndex = clampValue(
    TODAY_DATE_WINDOW_RADIUS + selectedDateOffsetFromWindow,
    TODAY_VISIBLE_DATE_RADIUS,
    weekDays.length - TODAY_VISIBLE_DATE_RADIUS - 1
  );
  const selectedDateWindowOffset =
    (selectedDateWindowIndex - TODAY_VISIBLE_DATE_RADIUS) * todayDayItemWidth;

  useEffect(() => {
    if (isTodayPageTransitioning) {
      return;
    }
    if (
      Math.abs(selectedDateOffsetFromWindow) >
      TODAY_DATE_WINDOW_RADIUS - TODAY_VISIBLE_DATE_RADIUS
    ) {
      setTodayDateWindowAnchor(new Date(selectedDate));
      return;
    }
    todayDayStripRef.current?.scrollToOffset({
      offset: selectedDateWindowOffset,
      animated: false,
    });
  }, [
    isTodayPageTransitioning,
    selectedDate,
    selectedDateOffsetFromWindow,
    selectedDateWindowOffset,
  ]);
  // Calcula somente os meses visíveis e seus vizinhos. A primeira abertura
  // antes percorria 25 meses × dias × tarefas de forma síncrona, bloqueando a UI.
  const calendarStatusStoreRef = useRef({
    tasksRef: null,
    dayStatusCache: new Map(),
    lastResult: { calendarDayStatusByKey: {}, calendarMonthStatusSignatureById: {} },
  });
  const isCalendarTabActive = activeTab === 'calendar';
  const canAnimateCalendarSurface =
    isCalendarTabActive &&
    calendarViewMode === 'calendar' &&
    !prefersReducedMotion &&
    !reportDate &&
    !reflectionDateKey &&
    !isHabitSheetOpen &&
    !isSettingsOpen &&
    !isCustomizeCalendarOpen;
  const animatedCalendarMonthIds = useMemo(() => {
    if (!canAnimateCalendarSurface || calendarMonths.length === 0) {
      return new Set();
    }

    const visibleIndex = calendarMonths.findIndex((month) =>
      visibleCalendarMonthIds.has(month.monthId)
    );
    const centerIndex = visibleIndex >= 0
      ? visibleIndex
      : Math.max(0, initialCalendarIndex);
    const activeIds = new Set();
    for (let offset = -2; offset <= 2; offset += 1) {
      const month = calendarMonths[centerIndex + offset];
      if (month) {
        activeIds.add(month.monthId);
      }
    }
    return activeIds;
  }, [
    calendarMonths,
    canAnimateCalendarSurface,
    initialCalendarIndex,
    visibleCalendarMonthIds,
  ]);
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
      if (taskArchiveUndoTimeoutRef.current) {
        clearTimeout(taskArchiveUndoTimeoutRef.current);
      }
    },
    []
  );

  const handleOpenReport = useCallback((date) => {
    setReportDate(date);
  }, []);
  const handleOpenFeedDay = useCallback((dateKey) => {
    setReportDate(normalizeDateValue(dateKey));
  }, []);
  const handleSelectCalendarViewMode = useCallback((mode) => {
    if (mode === 'feed') {
      setHasMountedFeed(true);
    }
    setCalendarViewMode(mode);
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
        animateImage={animatedCalendarMonthIds.has(item.monthId)}
        reduceMotion={prefersReducedMotion}
      />
    ),
    [
      animatedCalendarMonthIds,
      calendarDayStatusByKey,
      calendarMonthStatusSignatureById,
      calendarMonthMoodSignatureById,
      customMonthImages,
      dayMoods,
      handleOpenReport,
      language,
      moodAppearance,
      prefersReducedMotion,
      todayKey,
    ]
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
  // Preserva a identidade das tasks que não mudaram. Sem esse cache, o spread
  // recriava todos os objetos a cada conclusão e anulava o React.memo dos cards.
  const visibleTaskStateCacheRef = useRef(new WeakMap());
  const visibleTasksForSelectedDay = useMemo(
    () =>
      visibleTasks.map((task) => {
        // Lembrete expirado conta como "resolvido" para ordenação/progresso,
        // mas ganha a flag `missed` para o card mostrar o visual de perdido.
        const missed = isReminderExpiredForDate(task, selectedDate, currentTime);
        const completed = getTaskCompletionStatus(task, selectedDateKey) || missed;
        const cached = visibleTaskStateCacheRef.current.get(task);
        if (
          cached &&
          cached.dateKey === selectedDateKey &&
          cached.completed === completed &&
          cached.missed === missed
        ) {
          return cached.value;
        }
        const value = { ...task, completed, missed };
        visibleTaskStateCacheRef.current.set(task, {
          dateKey: selectedDateKey,
          completed,
          missed,
          value,
        });
        return value;
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
  const resetTaskReorderAnimation = useCallback((taskId) => {
    const nextGeneration = (taskReorderGenerationsRef.current.get(taskId) ?? 0) + 1;
    taskReorderGenerationsRef.current.set(taskId, nextGeneration);
    taskReorderAnimationsRef.current.get(taskId)?.stop();
    taskReorderAnimationsRef.current.delete(taskId);
    const translateY = taskAnimationsRef.current.get(taskId);
    if (translateY) {
      translateY.stopAnimation();
      translateY.setValue(0);
    }
  }, []);
  const handleTaskLayout = useCallback(
    (taskId, index, event) => {
      const { height, y } = event.nativeEvent.layout;
      const previousPosition = taskPositionsRef.current.get(taskId);
      taskPositionsRef.current.set(taskId, { height, index, y });

      if (
        activeTab !== 'today' ||
        prefersReducedMotion ||
        !previousPosition ||
        // Expandir o painel quantum muda altura e posicao, mas nao a ordem.
        // Deixar o layout seguir naturalmente evita uma segunda animacao FLIP
        // disputando cada frame com a abertura/recolhimento do card.
        previousPosition.index === index ||
        (previousPosition.y === y && previousPosition.height === height)
      ) {
        return;
      }

      const translateY = getTaskTranslateY(taskId);
      const generation = (taskReorderGenerationsRef.current.get(taskId) ?? 0) + 1;
      taskReorderGenerationsRef.current.set(taskId, generation);
      taskReorderAnimationsRef.current.get(taskId)?.stop();
      taskReorderAnimationsRef.current.delete(taskId);

      // stopAnimation devolve o valor realmente apresentado pela thread nativa.
      // Assim um segundo toque continua da posição visual atual, sem salto.
      translateY.stopAnimation((currentOffset) => {
        if (taskReorderGenerationsRef.current.get(taskId) !== generation) {
          return;
        }
        const nextOffset = getInterruptedTaskReorderOffset({
          previousY: previousPosition.y,
          currentOffset,
          nextY: y,
        });
        if (Math.abs(nextOffset) < 0.5) {
          translateY.setValue(0);
          return;
        }

        translateY.setValue(nextOffset);
        const animation = Animated.timing(translateY, {
          toValue: 0,
          duration: TODAY_TASK_REORDER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        });
        taskReorderAnimationsRef.current.set(taskId, animation);
        animation.start(() => {
          if (taskReorderGenerationsRef.current.get(taskId) !== generation) {
            return;
          }
          taskReorderAnimationsRef.current.delete(taskId);
          translateY.setValue(0);
        });
      });
    },
    [activeTab, getTaskTranslateY, prefersReducedMotion]
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
  const visibleTaskOrder = useMemo(
    () => sortedVisibleTasksForSelectedDay.map((task) => task.id),
    [sortedVisibleTasksForSelectedDay]
  );
  const visibleTaskOrderKey = visibleTaskOrder.join(':');
  const visibleTaskOrderContext = `${selectedDateKey}:${selectedTagFilter}`;

  useLayoutEffect(() => {
    const contextChanged = taskPositionContextRef.current !== visibleTaskOrderContext;
    const visibleIds = new Set(visibleTaskOrder);
    if (activeTab !== 'today' || prefersReducedMotion || contextChanged) {
      taskPositionsRef.current.clear();
      taskAnimationsRef.current.forEach((_, taskId) => resetTaskReorderAnimation(taskId));
      taskPositionContextRef.current =
        activeTab === 'today' ? visibleTaskOrderContext : null;
      return;
    }

    Array.from(taskPositionsRef.current.keys()).forEach((taskId) => {
      if (!visibleIds.has(taskId)) {
        taskPositionsRef.current.delete(taskId);
        resetTaskReorderAnimation(taskId);
      }
    });
  }, [
    activeTab,
    prefersReducedMotion,
    resetTaskReorderAnimation,
    visibleTaskOrderContext,
    visibleTaskOrderKey,
    visibleTaskOrder,
  ]);
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
  const profileFilterTask = useMemo(
    () => tasks.find((task) => task.id === profileFilterId) ?? null,
    [profileFilterId, tasks]
  );
  // Ativas x arquivadas alimentam as abas de "Suas tarefas" e o sheet de filtro.
  const { profileActiveTasks, profileArchivedTasks } = useMemo(() => {
    const active = [];
    const archived = [];
    tasks.forEach((task) => {
      (isTaskArchived(task, todayKey) ? archived : active).push(task);
    });
    return { profileActiveTasks: active, profileArchivedTasks: archived };
  }, [tasks, todayKey]);
  // Chips do gráfico: Geral + hábitos ativos fixados (📌) + "⋯" abre o sheet.
  // Hábito filtrado mas não fixado ganha chip temporário para a seleção ficar visível.
  const profileFilterItems = useMemo(() => {
    const chips = profileActiveTasks.filter((task) => task.profilePinned);
    if (
      profileFilterTask &&
      !chips.some((task) => task.id === profileFilterTask.id)
    ) {
      chips.unshift(profileFilterTask);
    }
    return [PROFILE_OVERALL_FILTER_ITEM, ...chips, PROFILE_FILTER_MORE_ITEM];
  }, [profileActiveTasks, profileFilterTask]);
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
  // A lista precisa montar VISÍVEL. Dentro de um display:none ela nunca recebe
  // tamanho de conteúdo, e o salto do initialScrollIndex é limitado em 0 pelo
  // ScrollView: a lista fica no topo mostrando o espaçador vazio, com as células
  // do mês atual desenhadas milhares de pixels abaixo. O React Native tenta esse
  // salto uma única vez por instância, então a chance é perdida de vez.
  useEffect(() => {
    if (!isCalendarTabActive) {
      setHasShownCalendarList(false);
      return;
    }
    if (calendarViewMode === 'calendar') {
      setHasShownCalendarList(true);
    }
  }, [calendarViewMode, isCalendarTabActive]);
  // A faixa do topo mostra o mês que está fisicamente sob ela: o mês cujo bloco
  // contém o offset atual de scroll. A viewability (50% visível) trocava de mês
  // cedo demais — a faixa dizia "julho" com as últimas semanas de junho na tela.
  const visibleCalendarMonthIdRef = useRef(getMonthId(new Date()));
  const handleCalendarScroll = useCallback(
    (event) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const layouts = monthLayoutsRef.current;
      let index = 0;
      for (let i = 0; i < layouts.length; i += 1) {
        if (layouts[i].offset <= offsetY + 1) {
          index = i;
        } else {
          break;
        }
      }
      const month = calendarMonths[index];
      if (month && visibleCalendarMonthIdRef.current !== month.monthId) {
        visibleCalendarMonthIdRef.current = month.monthId;
        setVisibleCalendarMonthIds(new Set([month.monthId]));
        setVisibleCalendarDate(month.date);
      }
    },
    [calendarMonths]
  );
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

      // `periodGoal` pertence ao recurso removido; omiti-lo também migra dados antigos.
      const { completed, periodGoal: _removedPeriodGoal, ...restTask } = task;
      const notificationIds = getTaskNotificationIds(task);

      return {
        ...restTask,
        dateKey: baseDateKey,
        completedDates: reconciledQuantumState.completedDates,
        subtasks: normalizedSubtasks,
        repeat: normalizeRepeatConfig(task.repeat),
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
        paddingVertical: isBottomBarLargeText ? 8 : isCompact ? 8 : 10,
      },
      tabLabel: {
        fontSize: isCompact ? 10 : 11,
        lineHeight: isCompact ? 12 : 14,
        marginTop: isBottomBarLargeText || isCompact ? 2 : 4,
      },
      tabGroup: {
        gap: isBottomBarLargeText ? 2 : 12,
      },
      tabButton: {
        paddingHorizontal: isBottomBarLargeText ? 1 : 0,
      },
      tabGroupLeft: {
        paddingRight: centerGap / 2,
        marginRight: isBottomBarLargeText ? 0 : centerGap / 4,
      },
      tabGroupRight: {
        paddingLeft: centerGap / 2,
        marginLeft: isBottomBarLargeText ? 0 : centerGap / 4,
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
      isBottomBarLargeText,
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

  // Abrir uma folha nao pode esperar a animacao/debounce do menu central:
  // esses cards têm elevation propria no Android e poderiam atravessar o
  // editor por alguns frames. Desmontamos a camada no mesmo render.
  const dismissFabMenuImmediately = useCallback(() => {
    overlayOpacity.stopAnimation();
    actionsScale.stopAnimation();
    actionsOpacity.stopAnimation();
    actionsTranslateY.stopAnimation();
    overlayOpacity.setValue(0);
    actionsScale.setValue(0.85);
    actionsOpacity.setValue(0);
    actionsTranslateY.setValue(12);
    setIsFabOpen(false);
    setIsFabMenuMounted(false);
  }, [actionsOpacity, actionsScale, actionsTranslateY, overlayOpacity]);

  const handleToggleFab = useCallback(() => {
    if (isFabOpen) {
      closeFabMenu();
    } else {
      openFabMenu();
    }
  }, [closeFabMenu, isFabOpen, openFabMenu]);

  const handleAddHabit = useCallback(() => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    dismissFabMenuImmediately();
    setHabitSheetMode('create');
    setHabitSheetInitialTask(null);
    setIsHabitSheetOpen(true);
  }, [dismissFabMenuImmediately]);

  const handleAddReflection = useCallback(() => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    dismissFabMenuImmediately();
    setReflectionDateKey(selectedDateKey);
  }, [dismissFabMenuImmediately, selectedDateKey]);

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

  const handleSelectDate = useCallback(
    (date) => {
      const normalized = normalizeDateValue(date);
      const targetDateKey = normalized ? getDateKey(normalized) : null;
      if (
        !normalized ||
        !targetDateKey ||
        targetDateKey === selectedDateKey ||
        todayPageTransitioningRef.current
      ) {
        return;
      }

      triggerSelection();
      const dayOffset = getCalendarDayOffset(selectedDate, normalized);
      const shouldAnimate = activeTab === 'today' && !prefersReducedMotion && dayOffset !== 0;

      if (!shouldAnimate) {
        todayPageTransitionSequenceRef.current += 1;
        todayPageTranslateX.stopAnimation();
        todayPageOpacity.stopAnimation();
        todayPageTranslateX.setValue(0);
        todayPageOpacity.setValue(1);
        setPendingTodayDateKey(null);
        if (
          Math.abs(getCalendarDayOffset(todayDateWindowAnchor, normalized)) >
          TODAY_DATE_WINDOW_RADIUS - TODAY_VISIBLE_DATE_RADIUS
        ) {
          setTodayDateWindowAnchor(new Date(normalized));
        }
        setSelectedDate(normalized);
        return;
      }

      const direction = dayOffset > 0 ? 1 : -1;
      const targetDateOffsetFromWindow = getCalendarDayOffset(
        todayDateWindowAnchor,
        normalized
      );
      const canCenterTarget =
        Math.abs(targetDateOffsetFromWindow) <=
        TODAY_DATE_WINDOW_RADIUS - TODAY_VISIBLE_DATE_RADIUS;
      const transitionSequence = todayPageTransitionSequenceRef.current + 1;
      todayPageTransitionSequenceRef.current = transitionSequence;
      todayPageTransitioningRef.current = true;
      setIsTodayPageTransitioning(true);
      setPendingTodayDateKey(targetDateKey);

      if (canCenterTarget) {
        const targetIndex = TODAY_DATE_WINDOW_RADIUS + targetDateOffsetFromWindow;
        todayDayStripRef.current?.scrollToOffset({
          offset: (targetIndex - TODAY_VISIBLE_DATE_RADIUS) * todayDayItemWidth,
          animated: true,
        });
      }

      Animated.parallel([
        Animated.timing(todayPageTranslateX, {
          toValue: -direction * todayPageTravelDistance,
          duration: TODAY_DATE_TRANSITION_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(todayPageOpacity, {
          toValue: 0,
          duration: TODAY_DATE_TRANSITION_OUT_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (!finished || transitionSequence !== todayPageTransitionSequenceRef.current) {
          todayPageTransitioningRef.current = false;
          setIsTodayPageTransitioning(false);
          setPendingTodayDateKey(null);
          return;
        }

        if (!canCenterTarget) {
          setTodayDateWindowAnchor(new Date(normalized));
        }
        setSelectedDate(normalized);
        setPendingTodayDateKey(null);
        todayPageTranslateX.setValue(direction * todayPageTravelDistance);
        todayPageOpacity.setValue(0);

        requestAnimationFrame(() => {
          if (transitionSequence !== todayPageTransitionSequenceRef.current) {
            return;
          }
          Animated.parallel([
            Animated.timing(todayPageTranslateX, {
              toValue: 0,
              duration: TODAY_DATE_TRANSITION_IN_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(todayPageOpacity, {
              toValue: 1,
              duration: TODAY_DATE_TRANSITION_IN_MS,
              easing: Easing.out(Easing.quad),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]).start(({ finished: didFinishEntering }) => {
            if (transitionSequence === todayPageTransitionSequenceRef.current) {
              if (!didFinishEntering) {
                todayPageTranslateX.setValue(0);
                todayPageOpacity.setValue(1);
              }
              todayPageTransitioningRef.current = false;
              setIsTodayPageTransitioning(false);
            }
          });
        });
      });
    },
    [
      activeTab,
      prefersReducedMotion,
      selectedDate,
      selectedDateKey,
      todayDayItemWidth,
      todayDateWindowAnchor,
      todayPageOpacity,
      todayPageTranslateX,
      todayPageTravelDistance,
    ]
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
    handleSelectDate(today);
    handleChangeTab('today');
  }, [handleChangeTab, handleSelectDate, today]);

  const handleReturnToToday = useCallback(() => {
    handleSelectDate(today);
  }, [handleSelectDate, today]);

  const handleSelectTagFilter = useCallback(
    (filterKey) => {
      if (
        !filterKey ||
        filterKey === selectedTagFilter ||
        todayPageTransitioningRef.current
      ) {
        return;
      }

      triggerSelection();
      const filterOrder = ['all', ...tagOptions.map((option) => option.key)];
      const currentIndex = Math.max(0, filterOrder.indexOf(selectedTagFilter));
      const targetIndex = Math.max(0, filterOrder.indexOf(filterKey));
      const direction = targetIndex >= currentIndex ? 1 : -1;
      const shouldAnimate = activeTab === 'today' && !prefersReducedMotion;
      const applyFilter = () => {
        setSelectedTagFilter(filterKey);
        updateUserSettings({ selectedTagFilter: filterKey });
      };

      if (!shouldAnimate) {
        todayPageTransitionSequenceRef.current += 1;
        todayCardsTranslateX.stopAnimation();
        todayCardsOpacity.stopAnimation();
        todayCardsTranslateX.setValue(0);
        todayCardsOpacity.setValue(1);
        applyFilter();
        return;
      }

      const transitionSequence = todayPageTransitionSequenceRef.current + 1;
      todayPageTransitionSequenceRef.current = transitionSequence;
      todayPageTransitioningRef.current = true;
      setIsTodayPageTransitioning(true);

      Animated.parallel([
        Animated.timing(todayCardsTranslateX, {
          toValue: -direction * todayPageTravelDistance,
          duration: TODAY_DATE_TRANSITION_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(todayCardsOpacity, {
          toValue: 0,
          duration: TODAY_DATE_TRANSITION_OUT_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (!finished || transitionSequence !== todayPageTransitionSequenceRef.current) {
          todayCardsTranslateX.setValue(0);
          todayCardsOpacity.setValue(1);
          todayPageTransitioningRef.current = false;
          setIsTodayPageTransitioning(false);
          return;
        }

        applyFilter();
        todayCardsTranslateX.setValue(direction * todayPageTravelDistance);
        todayCardsOpacity.setValue(0);

        requestAnimationFrame(() => {
          if (transitionSequence !== todayPageTransitionSequenceRef.current) {
            return;
          }
          Animated.parallel([
            Animated.timing(todayCardsTranslateX, {
              toValue: 0,
              duration: TODAY_DATE_TRANSITION_IN_MS,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(todayCardsOpacity, {
              toValue: 1,
              duration: TODAY_DATE_TRANSITION_IN_MS,
              easing: Easing.out(Easing.quad),
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]).start(({ finished: didFinishEntering }) => {
            if (transitionSequence === todayPageTransitionSequenceRef.current) {
              if (!didFinishEntering) {
                todayCardsTranslateX.setValue(0);
                todayCardsOpacity.setValue(1);
              }
              todayPageTransitioningRef.current = false;
              setIsTodayPageTransitioning(false);
            }
          });
        });
      });
    },
    [
      activeTab,
      prefersReducedMotion,
      selectedTagFilter,
      tagOptions,
      todayCardsOpacity,
      todayCardsTranslateX,
      todayPageTravelDistance,
      updateUserSettings,
    ]
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

  // Arquivar tira a tarefa da agenda a partir de hoje, preservando o histórico.
  const handleArchiveProfileTasks = useCallback(
    (taskIds) => {
      const idSet = new Set(taskIds);
      tasks.forEach((task) => {
        if (idSet.has(task.id) && !task.archived) {
          void cancelTaskReminders(task);
        }
      });
      setTasks((previous) =>
        previous.map((task) =>
          idSet.has(task.id) && !task.archived
            ? {
                ...task,
                archived: true,
                archivedAt: todayKey,
                notificationIds: [],
                notificationId: null,
                notificationScheduleMode: null,
              }
            : task
        )
      );
    },
    [tasks, todayKey]
  );

  // Reativar limpa o arquivamento; tarefa avulsa com data passada volta para hoje.
  const handleUnarchiveProfileTasks = useCallback(
    (taskIds) => {
      const idSet = new Set(taskIds);
      const updatedById = new Map();
      tasks.forEach((task) => {
        if (!idSet.has(task.id)) {
          return;
        }
        const next = { ...task, archived: false, archivedAt: null };
        if (!normalizeRepeatConfig(task.repeat).enabled) {
          const startDate = normalizeDateValue(task.dateKey ?? task.date);
          if (startDate && getDateKey(startDate) < todayKey) {
            next.date = today;
            next.dateKey = todayKey;
          }
        }
        updatedById.set(task.id, next);
      });
      if (updatedById.size === 0) {
        return;
      }
      setTasks((previous) =>
        previous.map((task) => updatedById.get(task.id) ?? task)
      );
      updatedById.forEach((task) => {
        void refreshTaskReminder(task, null, { notifyOnFailure: false });
      });
    },
    [refreshTaskReminder, tasks, today, todayKey]
  );

  const handleToggleProfileTaskArchive = useCallback(
    (taskId) => {
      const task = tasks.find((current) => current.id === taskId);
      if (!task) {
        return;
      }
      // Mesmo critério do modal: avulsa com data passada conta como arquivada,
      // então "Reativar" nela move a data para hoje.
      if (isTaskArchived(task, todayKey)) {
        handleUnarchiveProfileTasks([taskId]);
      } else {
        handleArchiveProfileTasks([taskId]);
      }
    },
    [handleArchiveProfileTasks, handleUnarchiveProfileTasks, tasks, todayKey]
  );

  const handleToggleProfileTaskPin = useCallback((taskId) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId
          ? { ...task, profilePinned: !task.profilePinned }
          : task
      )
    );
  }, []);

  const pendingTaskDeletionMessage = pendingTaskDeletion
    ? t.taskCard.deletedTask.replace(
        '{title}',
        pendingTaskDeletion.task.title ?? t.common.untitledTask
      )
    : null;
  const pendingTaskArchiveMessage = pendingTaskArchive
    ? t.taskCard.archivedTask.replace(
        '{title}',
        pendingTaskArchive.title ?? t.common.untitledTask
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
        // This is a device security preference, so a data backup must not
        // silently enable or disable it when restored.
        protectPrivateReflections: isDiaryPrivacyEnabled,
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
    [isDiaryPrivacyEnabled, normalizeStoredTasks, t.backup, tasks]
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
    dismissFabMenuImmediately();
    setHabitSheetMode(mode);
    setHabitSheetInitialTask(task);
    setIsHabitSheetOpen(true);
  }, [dismissFabMenuImmediately]);

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
  // Swipe na aba Hoje arquiva (não exclui): reversível pelo snackbar ou
  // pela aba Arquivadas de "Suas tarefas".
  const handleCardArchive = useCallback(
    (task) => {
      if (task.profileLocked) {
        return;
      }
      handleArchiveProfileTasks([task.id]);
      if (taskArchiveUndoTimeoutRef.current) {
        clearTimeout(taskArchiveUndoTimeoutRef.current);
      }
      setPendingTaskArchive({ taskId: task.id, title: task.title });
      taskArchiveUndoTimeoutRef.current = setTimeout(() => {
        setPendingTaskArchive((current) =>
          current?.taskId === task.id ? null : current
        );
        taskArchiveUndoTimeoutRef.current = null;
      }, TASK_DELETE_UNDO_DURATION_MS);
    },
    [handleArchiveProfileTasks]
  );
  const handleUndoTaskArchive = useCallback(() => {
    if (!pendingTaskArchive) {
      return;
    }
    if (taskArchiveUndoTimeoutRef.current) {
      clearTimeout(taskArchiveUndoTimeoutRef.current);
      taskArchiveUndoTimeoutRef.current = null;
    }
    handleUnarchiveProfileTasks([pendingTaskArchive.taskId]);
    setPendingTaskArchive(null);
  }, [handleUnarchiveProfileTasks, pendingTaskArchive]);
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

  const renderTodayTask = useCallback(
    ({ item: task }) => (
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
        onArchive={handleCardArchive}
        language={language}
        isVisible={activeTab === 'today'}
        reduceMotion={prefersReducedMotion}
        onEdit={handleCardEdit}
      />
    ),
    [
      activeTab,
      handleCardArchive,
      handleCardCopy,
      handleCardEdit,
      handleCardPress,
      handleCardQuantumDelta,
      handleCardToggle,
      language,
      prefersReducedMotion,
      selectedDateKey,
    ]
  );
  const renderTodayCell = useCallback(
    ({ children, index, item, onFocusCapture, onLayout, style }) => (
      <Animated.View
        onFocusCapture={onFocusCapture}
        needsOffscreenAlphaCompositing
        renderToHardwareTextureAndroid={isTodayPageTransitioning}
        onLayout={(event) => {
          onLayout?.(event);
          handleTaskLayout(item.id, index, event);
        }}
        style={[
          style,
          styles.todayTaskCell,
          index === 0 && styles.todayFirstTask,
          {
            // Durante a troca de ordem, cards incompletos ficam acima do card
            // concluído que está descendo. Evita o efeito de duas superfícies
            // disputando o mesmo plano enquanto os layouts se cruzam.
            zIndex: item.completed ? 0 : 1,
            opacity: todayContentOpacity,
            transform: [
              { translateX: todayContentTranslateX },
              { translateY: getTaskTranslateY(item.id) },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    ),
    [
      getTaskTranslateY,
      handleTaskLayout,
      isTodayPageTransitioning,
      todayContentOpacity,
      todayContentTranslateX,
    ]
  );

  const renderProfileFilterChip = useCallback(
    ({ item }) => {
      if (item === PROFILE_FILTER_MORE_ITEM) {
        return (
          <TouchableOpacity
            style={styles.profileFilterChip}
            onPress={() => setProfileFilterSheetOpen(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t.profile.filterMoreAccessibility}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color="#3c2ba7" />
          </TouchableOpacity>
        );
      }
      const isOverall = item === PROFILE_OVERALL_FILTER_ITEM;
      const isSelected = isOverall ? !profileFilterTask : item.id === profileFilterId;
      const label = isOverall
        ? t.profile.overallSeries
        : item.customImage
          ? item.title
          : `${item.emoji ? `${item.emoji} ` : ''}${item.title}`;

      return (
        <TouchableOpacity
          style={[
            styles.profileFilterChip,
            isSelected && styles.profileFilterChipSelected,
          ]}
          onPress={() => setProfileFilterId(isSelected || isOverall ? null : item.id)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: isSelected }}
        >
          {!isOverall && item.customImage ? (
            <Image source={{ uri: item.customImage }} style={styles.profileFilterChipImage} />
          ) : null}
          <Text
            style={[
              styles.profileFilterChipText,
              isSelected && styles.profileFilterChipTextSelected,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </TouchableOpacity>
      );
    },
    [
      profileFilterId,
      profileFilterTask,
      t.profile.filterMoreAccessibility,
      t.profile.overallSeries,
    ]
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
        style={[
          styles.tabButton,
          !isBottomBarLargeText &&
            (key === 'calendar' || key === 'discover') &&
            styles.tabButtonWide,
          dynamicStyles.tabButton,
        ]}
        onPress={() => handleChangeTab(key)}
        accessibilityRole="tab"
        accessibilityLabel={t.common.tabAccessibility.replace('{label}', label)}
        accessibilityState={{ selected: isActive, disabled: isFabOpen }}
        disabled={isFabOpen}
      >
        <Ionicons
          name={isActive ? icon.replace('-outline', '') : icon}
          size={iconSize}
          color={isActive ? styles.activeColor.color : styles.inactiveColor.color}
        />
        <Text
          numberOfLines={isBottomBarLargeText ? 2 : 1}
          maxFontSizeMultiplier={2}
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
  const displayedTodayDateKey = pendingTodayDateKey ?? selectedDateKey;
  const todayPageTransitionStyle = {
    opacity: todayPageOpacity,
    transform: [{ translateX: todayPageTranslateX }],
  };
  const todayContentTransitionStyle = {
    opacity: todayContentOpacity,
    transform: [{ translateX: todayContentTranslateX }],
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
            <FlatList
              data={visibleTasksWithStats}
              renderItem={renderTodayTask}
              CellRendererComponent={renderTodayCell}
              keyExtractor={(task) => String(task.id)}
              contentContainerStyle={styles.todayContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              updateCellsBatchingPeriod={16}
              windowSize={5}
              removeClippedSubviews={false}
              ListHeaderComponent={
                <>
              <Animated.View style={[styles.todayHeader, todayPageTransitionStyle]}>
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
              </Animated.View>

              <View style={styles.daySelector}>
                <FlatList
                  ref={todayDayStripRef}
                  horizontal
                  data={weekDays}
                  renderItem={({ item: day }) => {
                    const isSelected = day.key === displayedTodayDateKey;
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
                        style={[styles.dayItem, { width: todayDayItemWidth }]}
                        onPress={() => handleSelectDate(day.date)}
                        disabled={isTodayPageTransitioning}
                        accessibilityRole="button"
                        accessibilityLabel={day.accessibilityLabel}
                        accessibilityState={{
                          selected: isSelected,
                          disabled: isTodayPageTransitioning,
                        }}
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
                  }}
                  keyExtractor={(day) => day.key}
                  extraData={`${displayedTodayDateKey}:${isTodayPageTransitioning}`}
                  initialScrollIndex={selectedDateWindowIndex - TODAY_VISIBLE_DATE_RADIUS}
                  getItemLayout={(_, index) => ({
                    length: todayDayItemWidth,
                    offset: todayDayItemWidth * index,
                    index,
                  })}
                  scrollEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={9}
                  maxToRenderPerBatch={9}
                  windowSize={3}
                  removeClippedSubviews={Platform.OS === 'android'}
                  style={styles.daySelectorList}
                />
              </View>

              {!isSelectedToday ? (
                <Animated.View
                  style={[styles.todayTemporalActions, todayPageTransitionStyle]}
                >
                  <TouchableOpacity
                    style={[
                      styles.todayTemporalButton,
                      styles.todayTemporalButtonPrimary,
                    ]}
                    onPress={handleReturnToToday}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={t.today.backToToday}
                  >
                    <Ionicons name="return-up-back" size={16} color="#ffffff" />
                    <Text style={styles.todayTemporalButtonPrimaryText}>
                      {t.today.backToToday}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              ) : null}

              {tagOptions.length > 0 && (
                <Animated.View
                  style={[styles.tagFilterContainer, todayPageTransitionStyle]}
                >
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
                          handleSelectTagFilter('all');
                        }
                      }}
                      disabled={isTodayPageTransitioning}
                      accessibilityRole="button"
                      accessibilityLabel={t.today.showAllTags}
                      accessibilityState={{
                        selected: selectedTagFilter === 'all',
                        disabled: isTodayPageTransitioning,
                      }}
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
                              handleSelectTagFilter(option.key);
                            }
                          }}
                          disabled={isTodayPageTransitioning}
                          accessibilityRole="button"
                          accessibilityLabel={t.today.showTasksTagged.replace('{tag}', option.label)}
                          accessibilityState={{
                            selected: isSelected,
                            disabled: isTodayPageTransitioning,
                          }}
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
                </Animated.View>
              )}
                </>
              }
              ListEmptyComponent={
                <Animated.View style={[styles.tasksSection, todayContentTransitionStyle]}>
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
                </Animated.View>
              }
            />
          ) : activeTab === 'calendar' ? null : activeTab === 'profile' ? (
             <ScrollView
               style={{ flex: 1 }}
               contentContainerStyle={styles.profileScrollContent}
               showsVerticalScrollIndicator={false}
             >
                {/* Cabeçalho compacto: título + data e atalho pras configurações */}
                <View style={[styles.profileHeaderRow, { width: profileContentWidth }]}>
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
                    accessibilityRole="button"
                    accessibilityLabel={t.profile.settings}
                  >
                    <Ionicons name="settings-outline" size={20} color="#1a1a2e" />
                  </TouchableOpacity>
                </View>

                {/* Filtro: geral ou um hábito específico — alimenta gráfico e stats */}
                {tasks.length > 0 ? (
                  <FlatList
                    horizontal
                    data={profileFilterItems}
                    renderItem={renderProfileFilterChip}
                    keyExtractor={(item) =>
                      item === PROFILE_OVERALL_FILTER_ITEM
                        ? 'overall'
                        : item === PROFILE_FILTER_MORE_ITEM
                          ? 'more'
                          : `task:${item.id}`
                    }
                    showsHorizontalScrollIndicator={false}
                    style={styles.profileChipsScroll}
                    contentContainerStyle={styles.profileChipsContent}
                    initialNumToRender={8}
                    maxToRenderPerBatch={8}
                    windowSize={5}
                    removeClippedSubviews={Platform.OS === 'android'}
                  />
                ) : null}

                <View style={[styles.profileBody, { width: profileContentWidth }]}>
                <PerformanceChart
                  tasks={tasks}
                  language={language}
                  selectedTask={profileFilterTask}
                />

                <View style={styles.profileStatsSection}>
                  <Text style={styles.profileStatsTitle}>{t.profile.stats}</Text>
                  <View style={styles.profileStatsGrid}>
                    <View style={styles.profileStatCard}>
                      <View style={styles.profileStatHeaderRow}>
                        <Text style={styles.profileStatLabel}>{t.profile.totalDays}</Text>
                        <Ionicons name="calendar-outline" size={14} color="#625f79" />
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
                          color="#625f79"
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
                        <Ionicons name="trophy-outline" size={14} color="#625f79" />
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
          {isCalendarTabActive ? (
            <View
              key="calendar-tab"
              style={{ flex: 1, width: '100%' }}
            >
              {/* Seletor Calendário/Feed: pílula centralizada no topo */}
              <View style={styles.calendarViewSwitcherWrapper}>
                <View style={styles.calendarViewSwitcher} accessibilityRole="tablist">
                  {[
                    { key: 'calendar', label: t.calendar.viewCalendar, icon: 'calendar-clear' },
                    { key: 'feed', label: t.calendar.viewFeed, icon: 'newspaper' },
                  ].map((segment) => {
                    const isActive = calendarViewMode === segment.key;
                    return (
                      <Pressable
                        key={segment.key}
                        style={[
                          styles.calendarViewSwitcherSegment,
                          isActive && styles.calendarViewSwitcherSegmentActive,
                        ]}
                        onPress={() => handleSelectCalendarViewMode(segment.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Ionicons
                          name={isActive ? segment.icon : `${segment.icon}-outline`}
                          size={14}
                          color={isActive ? '#ffffff' : '#59636f'}
                        />
                        <Text
                          style={[
                            styles.calendarViewSwitcherText,
                            isActive && styles.calendarViewSwitcherTextActive,
                          ]}
                        >
                          {segment.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* display:none preserva a posição de scroll ao alternar */}
              <View
                style={[{ flex: 1 }, calendarViewMode !== 'calendar' && { display: 'none' }]}
                pointerEvents={calendarViewMode === 'calendar' ? 'auto' : 'none'}
                importantForAccessibility={
                  calendarViewMode === 'calendar' ? 'auto' : 'no-hide-descendants'
                }
              >
                <View style={styles.calendarStickyHeaderSlot}>
                  {!isHabitSheetOpen ? (
                    <StickyMonthHeader
                      date={visibleCalendarDate}
                      customImages={customMonthImages}
                      language={language}
                      animateImage={canAnimateCalendarSurface}
                      reduceMotion={prefersReducedMotion}
                    />
                  ) : null}
                </View>

                {/* Montar escondida faz a lista perder o salto inicial: só entra visível. */}
                {calendarViewMode === 'calendar' || hasShownCalendarList ? (
                  <FlatList
                    ref={calendarListRef}
                    data={calendarMonths}
                    renderItem={renderCalendarMonth}
                    extraData={animatedCalendarMonthIds}
                    keyExtractor={(item) => item.id.toString()}
                    showsVerticalScrollIndicator={false}
                    removeClippedSubviews={Platform.OS === 'android'}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    initialScrollIndex={initialCalendarIndex !== -1 ? initialCalendarIndex : 12}
                    initialNumToRender={2}
                    updateCellsBatchingPeriod={16}
                    onScroll={handleCalendarScroll}
                    scrollEventThrottle={48}
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
                ) : null}
              </View>

              {hasMountedFeed ? (
                <View
                  style={[{ flex: 1 }, calendarViewMode !== 'feed' && { display: 'none' }]}
                  pointerEvents={calendarViewMode === 'feed' ? 'auto' : 'none'}
                  importantForAccessibility={
                    calendarViewMode === 'feed' ? 'auto' : 'no-hide-descendants'
                  }
                >
                  <ReflectionFeed
                    dayMoods={dayMoods}
                    moodAppearance={moodAppearance}
                    language={language}
                    todayKey={todayKey}
                    onOpenDay={handleOpenFeedDay}
                    onEditReflection={handleEditReflectionForDate}
                    isDiaryPrivacyEnabled={isDiaryPrivacyEnabled}
                    isDiaryUnlocked={isDiaryUnlocked}
                    onRequestDiaryUnlock={requestDiaryUnlock}
                    bottomPadding={isCompact ? 56 : 72}
                  />
                </View>
              ) : null}
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
            <View style={[styles.tabGroup, dynamicStyles.tabGroup, dynamicStyles.tabGroupLeft]}>
              {[
                { key: 'today', label: t.tabs.today, icon: 'time-outline' },
                { key: 'calendar', label: t.tabs.calendar, icon: 'calendar-clear-outline' },
              ].map(renderTabButton)}
            </View>
            <View style={[styles.tabGroup, dynamicStyles.tabGroup, dynamicStyles.tabGroupRight]}>
              {[
                { key: 'discover', label: t.tabs.discover, icon: 'compass-outline' },
                { key: 'profile', label: t.tabs.profile, icon: 'person-outline' },
              ].map(renderTabButton)}
            </View>
          </View>

          <TouchableOpacity
            // O editor de tarefas cobre a tela inteira sem usar elevation no
            // wrapper (isso quebrava o scroll dele no Android), entao o FAB,
            // que tem elevation 12, ficaria desenhado por cima. Some com ele
            // enquanto a folha esta aberta.
            style={[
              styles.addButton,
              dynamicStyles.addButton,
              isFabOpen && styles.addButtonActive,
              (isHabitSheetOpen || reflectionDateKey) && { opacity: 0 },
            ]}
            pointerEvents={isHabitSheetOpen || reflectionDateKey ? 'none' : 'auto'}
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

        {isFabMenuMounted && !isHabitSheetOpen && !reflectionDateKey && (
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

        {isFabMenuMounted && !isHabitSheetOpen && !reflectionDateKey && (
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
                        styles.fabCardTextOnLight,
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
                        styles.fabCardTextOnLight,
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
          message={pendingTaskDeletionMessage ?? pendingTaskArchiveMessage}
          actionLabel={t.common.undo}
          onAction={
            pendingTaskDeletion ? handleUndoTaskDeletion : handleUndoTaskArchive
          }
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
        isDiaryPrivacyEnabled={isDiaryPrivacyEnabled}
        isDiaryUnlocked={isDiaryUnlocked}
        onRequestDiaryUnlock={requestDiaryUnlock}
        reduceMotion={prefersReducedMotion}
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
        isDiaryPrivacyEnabled={isDiaryPrivacyEnabled}
        isDiaryUnlocked={isDiaryUnlocked}
        onRequestDiaryUnlock={requestDiaryUnlock}
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
        reduceMotion={prefersReducedMotion}
      />
      <SettingsSheet
        visible={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        privateNotificationContent={userSettings.privateNotificationContent !== false}
        protectPrivateReflections={isDiaryPrivacyEnabled}
        isDiaryUnlocked={isDiaryUnlocked}
        onChangeLanguage={(key) => updateUserSettings({ language: key })}
        onChangePrivateNotificationContent={(value) =>
          updateUserSettings({ privateNotificationContent: value })
        }
        onChangeDiaryProtection={handleChangeDiaryProtection}
        onLockDiaryNow={handleLockDiaryNow}
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
        reduceMotion={prefersReducedMotion}
      />
      <ProfileTasksModal
        visible={isProfileTasksOpen}
        tasks={profileTasks}
        todayKey={todayKey}
        onClose={handleCloseProfileTasks}
        onSelectTask={(taskId) => setActiveProfileTaskId(taskId)}
        onDeleteSelected={handleDeleteProfileTasks}
        onArchiveSelected={handleArchiveProfileTasks}
        onUnarchiveSelected={handleUnarchiveProfileTasks}
        undoMessage={pendingTaskDeletionMessage}
        undoActionLabel={t.common.undo}
        onUndoDelete={handleUndoTaskDeletion}
        language={language}
      />
      <ProfileFilterSheet
        visible={isProfileFilterSheetOpen}
        activeTasks={profileActiveTasks}
        archivedTasks={profileArchivedTasks}
        selectedId={profileFilterId}
        onSelect={setProfileFilterId}
        onTogglePin={handleToggleProfileTaskPin}
        onClose={() => setProfileFilterSheetOpen(false)}
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
        onToggleArchive={handleToggleProfileTaskArchive}
        onTogglePin={handleToggleProfileTaskPin}
        onDelete={handleDeleteProfileTask}
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
