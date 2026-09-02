// Suíte mínima, sem Jest: transpila somente os módulos locais com o Babel que
// já acompanha o toolchain Expo e testa as mesmas funções usadas pelo app.
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const originalJsLoader = require.extensions['.js'];
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
    originalJsLoader(module, filename);
    return;
  }
  const source = fs.readFileSync(filename, 'utf8');
  const transformed = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
    sourceMaps: 'inline',
  });
  module._compile(transformed.code, filename);
};

// As regras de tarefa compartilham constantes com o app, mas a suíte não
// precisa carregar o bundle nativo (que contém sintaxe Flow). Um mock mínimo
// mantém o teste em Node e deixa explícita a única informação usada aqui.
const originalModuleLoader = Module._load;
const hapticsMockState = {
  calls: [],
  shouldReject: false,
};
const asyncStorageMockState = {
  calls: [],
  shouldReject: false,
  shouldRejectMultiSet: false,
};
const asyncStorageMock = {
  getItem: async () => null,
  multiGet: async () => [],
  multiRemove: async (keys) => {
    asyncStorageMockState.calls.push({ operation: 'multiRemove', keys });
  },
  multiSet: async (entries) => {
    asyncStorageMockState.calls.push({ operation: 'multiSet', entries });
    if (asyncStorageMockState.shouldRejectMultiSet) {
      throw new Error('storage unavailable');
    }
  },
  setItem: async (key, value) => {
    asyncStorageMockState.calls.push({ key, value });
    if (asyncStorageMockState.shouldReject) {
      throw new Error('storage unavailable');
    }
  },
};
const notificationsMockState = {
  cancelledIds: [],
  pendingRequests: [],
  scheduledRequests: [],
};
const notificationsMock = {
  SchedulableTriggerInputTypes: {
    DATE: 'date',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
  },
  getPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
  getAllScheduledNotificationsAsync: async () => notificationsMockState.pendingRequests,
  cancelScheduledNotificationAsync: async (notificationId) => {
    notificationsMockState.cancelledIds.push(notificationId);
  },
  scheduleNotificationAsync: async (request) => {
    notificationsMockState.scheduledRequests.push(request);
    return `scheduled-${notificationsMockState.scheduledRequests.length}`;
  },
};
const runHapticsMock = async (operation, value) => {
  hapticsMockState.calls.push({ operation, value });
  if (hapticsMockState.shouldReject) {
    throw new Error('haptics unavailable');
  }
};
Module._load = function loadWithReactNativeMock(request, parent, isMain) {
  if (request === 'react-native') {
    return {
      Platform: { OS: 'android' },
      Pressable: 'Pressable',
      StyleSheet: { create: (styles) => styles },
      Text: 'Text',
      View: 'View',
    };
  }
  if (request === 'expo-haptics') {
    return {
      ImpactFeedbackStyle: { Light: 'light' },
      NotificationFeedbackType: { Success: 'success' },
      impactAsync: (style) => runHapticsMock('impact', style),
      notificationAsync: (type) => runHapticsMock('notification', type),
      selectionAsync: () => runHapticsMock('selection'),
    };
  }
  if (request === '@react-native-async-storage/async-storage') {
    return asyncStorageMock;
  }
  if (request === 'expo-notifications') {
    return notificationsMock;
  }
  return originalModuleLoader.call(this, request, parent, isMain);
};

const {
  createCenteredWeekDates,
  getDateKey,
  isValidDateRange,
  normalizeDateValue,
  shouldTaskAppearOnDate,
} = require('../utils/dateUtils');
const {
  createCenteredDateWindow,
  getCalendarDayOffset,
} = require('../utils/todayNavigationUtils');
const { getInterruptedTaskReorderOffset } = require('../utils/taskReorderUtils');
const {
  getFinishedMilestoneValue,
  getTaskRepeatDisplayLabel,
  getTaskFinishedCount,
  getTaskFinishedMilestoneForDate,
  getTaskTagDisplayLabel,
  getTaskTypeDisplayLabel,
  getQuantumProgressLabel,
  getQuantumStepLabel,
  isValidQuantumDefinition,
  reconcileQuantumCompletionState,
  reconcileTaskProgressOnEdit,
  restoreDeletedTaskAtIndex,
  shouldResetTaskProgress,
} = require('../utils/taskUtils');
const {
  IMAGE_ERROR_CODES,
  IMAGE_LIMITS,
  formatImageSizeLimit,
  getImageErrorMessage,
  getPickedImageExtension,
  isGifImageUri,
  validatePickedImageAsset,
} = require('../utils/imageUtils');
const {
  backfillTaskTitlesInHistory,
  createTaskHistoryDetails,
  prependHistoryEntry,
  pruneSelectedTaskIds,
} = require('../utils/historyUtils');
const {
  buildSearchableTimelineItems,
  normalizeTimelineSearchText,
} = require('../utils/timelineUtils');
const {
  getChartEmptyStateKey,
  getChartMetricKey,
  getChartSeriesMetricKey,
} = require('../utils/chartSemanticsUtils');
const {
  shouldTriggerCompletionCelebration,
  willProgressReachCompletion,
} = require('../utils/celebrationUtils');
const {
  triggerImpact,
  triggerSelection,
  triggerSuccessFeedback,
} = require('../utils/feedbackUtils');
const {
  buildDailyCompletionSeries,
  calculateProfileStats,
  MAX_PROFILE_STREAK_DAYS,
} = require('../utils/profileStatsUtils');
const {
  clearPerformanceMetrics,
  getRecentPerformanceMetrics,
  measureSynchronous,
  recordPerformanceMetric,
} = require('../utils/performanceUtils');
const {
  buildTaskReminderContent,
  scheduledReminderContentMatches,
} = require('../utils/notificationUtils');
const {
  getTaskReminderFingerprint,
  getTaskReminderPlan,
  reconcileTaskReminderSchedules,
} = require('../services/reminderService');
const { translations } = require('../constants/i18n');
const {
  hasPrivateReflectionContent,
  hasReflectionContent,
} = require('../utils/moodUtils');
const {
  TASK_TEMPLATE_COLLECTIONS,
  TASK_TEMPLATE_VERSION,
  getTaskTemplateCollection,
} = require('../constants/taskTemplates');
const {
  buildTemplateTasks,
  getImportedTemplateTaskKeys,
  migrateImportedTemplateTasks,
} = require('../utils/templateUtils');
const { getTimerParts, getTimerTotalSeconds } = require('../utils/timeUtils');
const {
  getWaterDisplayPercent,
  WATER_IDLE_FILL_PERCENT,
  WATER_WAVE_AMPLITUDE,
  WATER_WAVE_DURATION_MS,
  WATER_WAVE_HORIZONTAL_OVERSCAN,
  WATER_WAVE_MIN_FILL_HEIGHT,
} = require('../utils/waveUtils');
const {
  createEmptyDraft,
  draftFromTask,
  draftToTask,
  ensureValidPeriod,
  getDraftError,
  taskDraftReducer,
  timeToMinutes,
  validateDraft,
} = require('../domain/taskDraft');
const { doesDateRepeat } = require('../utils/calendarMath');
const { buildLocalPeriodSummary } = require('../utils/localSummaryUtils');
const {
  BACKUP_ERROR_CODES,
  parseAppBackupContents,
} = require('../utils/backupUtils');
const { AppErrorBoundary } = require('../components/AppErrorBoundary');
const { replaceStoredAppData, saveTasks } = require('../storage');

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('resume o periodo local sem misturar lembretes ou inferir causalidade', () => {
  const dailyRepeat = { enabled: true, frequency: 'daily', interval: 1 };
  const summary = buildLocalPeriodSummary({
    tasks: [
      {
        id: 'task-a',
        title: 'A',
        type: 'default',
        date: '2026-07-01',
        repeat: dailyRepeat,
        completedDates: {
          '2026-07-06': true,
          '2026-07-07': true,
          '2026-07-13': true,
          '2026-07-14': true,
          '2026-07-15': true,
        },
      },
      {
        id: 'task-b',
        title: 'B',
        type: 'default',
        date: '2026-07-01',
        repeat: dailyRepeat,
        completedDates: { '2026-07-08': true },
      },
      {
        id: 'passive-reminder',
        title: 'Reminder',
        type: 'reminder',
        date: '2026-07-01',
        repeat: dailyRepeat,
        completedDates: {},
      },
    ],
    dayMoods: {
      '2026-07-13': { level: 4, note: 'nota', photo: null },
      '2026-07-14': { level: 2, note: '', photo: 'file://photo.jpg' },
    },
    period: 'weekly',
    referenceDate: '2026-07-15',
  });

  assert.equal(summary.current.planned, 6);
  assert.equal(summary.current.completed, 3);
  assert.equal(summary.current.rate, 50);
  assert.equal(summary.previous.planned, 6);
  assert.equal(summary.previous.completed, 3);
  assert.equal(summary.rateDelta, 0);
  assert.equal(summary.current.mostCompletedTask.taskId, 'task-a');
  assert.deepEqual(summary.current.noCompletionTasks.map((task) => task.taskId), ['task-b']);
  assert.equal(summary.current.bestDay.date.getDate(), 13);
  assert.equal(summary.current.reflections, 2);
  assert.equal(summary.current.averageMood, 3);
  assert.equal(summary.current.notes, 1);
  assert.equal(summary.current.photos, 1);
});

test('mantem o catalogo de templates completo nos dois idiomas', () => {
  assert.equal(TASK_TEMPLATE_COLLECTIONS.length, 3);
  TASK_TEMPLATE_COLLECTIONS.forEach((template) => {
    ['en', 'pt'].forEach((language) => {
      const localized = translations[language].discover.templates[template.id];
      assert.ok(localized?.title);
      assert.ok(localized?.description);
      template.tasks.forEach((task) => {
        assert.ok(localized.tasks[task.id]?.title);
        assert.ok(localized.tasks[task.id]?.description);
        if (task.type === 'quantum') {
          assert.equal(isValidQuantumDefinition(task.quantum), true);
          assert.notEqual(task.quantum.animation, 'defaut');
        }
      });
    });
  });
});

test('cria somente tarefas selecionadas e ainda nao importadas do template', () => {
  const template = getTaskTemplateCollection('morningReset');
  const localizedTemplate = translations.pt.discover.templates.morningReset;
  const existingTasks = [
    {
      id: 'existing-template-task',
      title: 'Beber um copo de água',
      templateSource: { templateId: 'morningReset', taskId: 'hydrate', version: 1 },
    },
    { id: 'existing-title', title: 'Escolher as prioridades de hoje' },
  ];
  const tasks = buildTemplateTasks({
    template,
    selectedTaskIds: ['hydrate', 'priorities', 'stretch'],
    localizedTemplate,
    existingTasks,
    startDate: '2026-07-17',
    fallbackTitle: 'Sem titulo',
    createTaskId: (templateId, taskId) => `${templateId}-${taskId}`,
  });

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => task.templateSource.taskId), ['priorities', 'stretch']);
  assert.equal(tasks[0].title, 'Escolher as prioridades de hoje 1');
  assert.equal(tasks[0].dateKey, '2026-07-17');
  assert.equal(tasks[0].repeat.frequency, 'daily');
  assert.equal(tasks[0].completedDates['2026-07-17'], undefined);
  assert.equal(tasks[1].type, 'default');
  assert.equal(tasks[1].quantum, null);
  assert.equal(tasks[1].templateSource.version, TASK_TEMPLATE_VERSION);
});

test('preserva minutos dos templates quantitativos ao criar e editar', () => {
  const template = getTaskTemplateCollection('focusFlow');
  const tasks = buildTemplateTasks({
    template,
    selectedTaskIds: ['focusBlock'],
    localizedTemplate: translations.en.discover.templates.focusFlow,
    startDate: '2026-07-18',
    createTaskId: () => 'focus-task',
  });

  assert.equal(tasks.length, 1);
  assert.deepEqual(getTimerParts(tasks[0].quantum.timer), { hours: 0, minutes: 25 });
  assert.equal(getTimerTotalSeconds(tasks[0].quantum.timer), 25 * 60);
  assert.equal(getQuantumStepLabel(tasks[0], 900), '15m');
});

test('migra imports com duracao incorreta sem alterar tarefas manuais', () => {
  const migrated = migrateImportedTemplateTasks([
    {
      id: 'stretch',
      type: 'quantum',
      completedDates: {},
      quantum: { mode: 'timer', timer: { hours: 0, minutes: 5, seconds: 0 } },
      templateSource: { templateId: 'morningReset', taskId: 'stretch', version: 1 },
    },
    {
      id: 'focus',
      type: 'quantum',
      quantum: { mode: 'timer', timer: { hours: 0, minutes: 25, seconds: 0 } },
      templateSource: { templateId: 'focusFlow', taskId: 'focusBlock', version: 1 },
    },
    {
      id: 'manual',
      type: 'quantum',
      quantum: { mode: 'timer', timer: { minutes: 5, seconds: 0 } },
    },
  ]);

  assert.equal(migrated[0].type, 'default');
  assert.equal(migrated[0].quantum, null);
  assert.equal(migrated[0].templateSource.version, TASK_TEMPLATE_VERSION);
  assert.deepEqual(migrated[1].quantum.timer, { hours: 0, minutesPart: 25 });
  assert.equal(getTimerTotalSeconds(migrated[1].quantum.timer), 25 * 60);
  assert.equal(migrated[2].quantum.timer.minutes, 5);
  assert.equal(migrated[2].templateSource, undefined);
});

test('mantem progresso quantum e conclusao coerentes em dados antigos', () => {
  const completedWithoutProgress = reconcileQuantumCompletionState(
    {
      mode: 'count',
      count: { value: 1, unit: 'cup' },
      progressByDate: { '2026-07-18': { doneCount: 0 } },
    },
    { '2026-07-18': true }
  );
  assert.equal(
    completedWithoutProgress.quantum.progressByDate['2026-07-18'].doneCount,
    1
  );

  const progressWithoutCompletion = reconcileQuantumCompletionState(
    {
      mode: 'timer',
      timer: { hours: 0, minutesPart: 20 },
      progressByDate: { '2026-07-18': { doneSeconds: 1200 } },
    },
    {}
  );
  assert.equal(progressWithoutCompletion.completedDates['2026-07-18'], true);
  assert.equal(
    getQuantumProgressLabel(
      {
        type: 'quantum',
        completedDates: { '2026-07-18': true },
        quantum: {
          mode: 'count',
          count: { value: 1, unit: 'cup' },
          progressByDate: { '2026-07-18': { doneCount: 0 } },
        },
      },
      '2026-07-18'
    ),
    '1/1 cup'
  );
});

test('deriva os selos de conclusao nos marcos 10 e multiplos de 50', () => {
  assert.equal(getFinishedMilestoneValue(9), null);
  assert.equal(getFinishedMilestoneValue(10), 10);
  assert.equal(getFinishedMilestoneValue(11), null);
  assert.equal(getFinishedMilestoneValue(49), null);
  assert.equal(getFinishedMilestoneValue(50), 50);
  assert.equal(getFinishedMilestoneValue(100), 100);
  assert.equal(getFinishedMilestoneValue(150), 150);
  assert.equal(getFinishedMilestoneValue(0), null);
  assert.equal(getFinishedMilestoneValue(-50), null);
  assert.equal(getFinishedMilestoneValue(50.5), null);

  const completionKeys = Array.from({ length: 55 }, (_, index) => {
    const date = new Date(2026, 0, 1);
    date.setDate(date.getDate() + index);
    return getDateKey(date);
  });
  const completedDates = Object.fromEntries(
    completionKeys
      .slice()
      .reverse()
      .map((dateKey) => [dateKey, true])
  );
  completedDates['2025-12-31'] = false;
  const task = { completedDates };

  assert.equal(getTaskFinishedCount(task), 55);
  assert.equal(getTaskFinishedMilestoneForDate(task, completionKeys[8]), null);
  assert.equal(getTaskFinishedMilestoneForDate(task, completionKeys[9]), 10);
  assert.equal(getTaskFinishedMilestoneForDate(task, completionKeys[49]), 50);
  assert.equal(getTaskFinishedMilestoneForDate(task, completionKeys[50]), null);
  assert.equal(getTaskFinishedMilestoneForDate(task, '2025-12-31'), null);

  completedDates[completionKeys[9]] = false;
  assert.equal(getTaskFinishedCount(task), 54);
  assert.equal(getTaskFinishedMilestoneForDate(task, completionKeys[10]), 10);
  assert.equal(getTaskFinishedMilestoneForDate(task, completionKeys[50]), 50);
});

test('reconhece fontes importadas sem confundir tarefas comuns', () => {
  const keys = getImportedTemplateTaskKeys([
    { id: 'ordinary', title: 'Tarefa comum' },
    { templateSource: { templateId: 'focusFlow', taskId: 'focusBlock' } },
    { templateSource: { templateId: 'focusFlow' } },
  ]);
  assert.deepEqual([...keys], ['focusFlow:focusBlock']);
});

test('traduz rotulos de tarefa pela chave semantica atual', () => {
  assert.equal(
    getTaskTagDisplayLabel(
      { tag: 'workout', tagLabel: 'Workout' },
      { workout: 'Treino' }
    ),
    'Treino'
  );
  assert.equal(
    getTaskTagDisplayLabel(
      { tag: 'workout' },
      { workout: 'Treino' }
    ),
    'Treino'
  );
  assert.equal(
    getTaskTypeDisplayLabel(
      { type: 'quantum', typeLabel: 'Goal' },
      { default: 'Habito', quantum: 'Meta', reminder: 'Lembrete' }
    ),
    'Meta'
  );
  assert.equal(
    getTaskTypeDisplayLabel(
      { type: 'quantum' },
      { default: 'Habito', quantum: 'Meta', reminder: 'Lembrete' }
    ),
    'Meta'
  );
  assert.equal(
    getTaskRepeatDisplayLabel(
      { enabled: true, frequency: 'weekly', interval: 3 },
      { weekly: 'Semanal', everyWeeks: 'A cada {count} semanas' }
    ),
    'A cada 3 semanas'
  );
  assert.equal(
    getTaskRepeatDisplayLabel(
      { enabled: false },
      { oneTime: 'Uma vez' }
    ),
    'Uma vez'
  );
});

test('restaura tarefa excluida na posicao original sem duplicar', () => {
  const deletedTask = { id: 'task-2', title: 'Segunda' };
  const restored = restoreDeletedTaskAtIndex(
    [{ id: 'task-1' }, { id: 'task-3' }],
    deletedTask,
    1
  );
  assert.deepEqual(restored.map((task) => task.id), ['task-1', 'task-2', 'task-3']);
  assert.equal(restoreDeletedTaskAtIndex(restored, deletedTask, 1), restored);
});

test('valida backup versionado e monta previa sem alterar dados', () => {
  const result = parseAppBackupContents(JSON.stringify({
    format: 'favit-backup',
    version: 1,
    exportedAt: '2026-07-16T12:00:00.000Z',
    platform: 'android',
    data: {
      tasks: [{ id: 'task-1', title: 'Ler' }, { id: 'task-2', title: 'Treinar' }],
      userSettings: { language: 'pt' },
      history: [{ id: 'history-1' }],
      monthImages: { 0: 'file://month.png' },
      dayMoods: { '2026-07-16': { level: 4 } },
      moodAppearance: {},
    },
    recovery: {},
    media: {
      filesIncluded: false,
      referencedUris: ['file://month.png'],
    },
  }));

  assert.equal(result.preview.taskCount, 2);
  assert.equal(result.preview.historyCount, 1);
  assert.equal(result.preview.reflectionCount, 1);
  assert.equal(result.preview.referencedMediaCount, 1);
  assert.equal(result.data.userSettings.language, 'pt');
});

test('rejeita backup incorreto, futuro ou com tarefas duplicadas', () => {
  const buildContents = (overrides = {}) => JSON.stringify({
    format: 'favit-backup',
    version: 1,
    exportedAt: '2026-07-16T12:00:00.000Z',
    data: {
      tasks: [],
      userSettings: null,
      history: [],
      monthImages: {},
      dayMoods: {},
      moodAppearance: {},
    },
    media: { filesIncluded: false, referencedUris: [] },
    ...overrides,
  });

  assert.throws(
    () => parseAppBackupContents('{'),
    (error) => error.code === BACKUP_ERROR_CODES.INVALID_JSON
  );
  assert.throws(
    () => parseAppBackupContents(buildContents({ version: 2 })),
    (error) => error.code === BACKUP_ERROR_CODES.UNSUPPORTED_VERSION
  );
  assert.throws(
    () => parseAppBackupContents(buildContents({
      data: {
        tasks: [{ id: 'same' }, { id: 'same' }],
        userSettings: null,
        history: [],
        monthImages: {},
        dayMoods: {},
        moodAppearance: {},
      },
    })),
    (error) => error.code === BACKUP_ERROR_CODES.INVALID_DATA
  );
});

test('informa sucesso ou falha ao gravar dados locais', async () => {
  asyncStorageMockState.calls = [];
  asyncStorageMockState.shouldReject = false;
  assert.equal(await saveTasks([{ id: 'task-1' }]), true);
  assert.deepEqual(asyncStorageMockState.calls.at(-1), {
    key: '@schedule_app/tasks',
    value: '[{"id":"task-1"}]',
  });

  const originalWarn = console.warn;
  console.warn = () => undefined;
  asyncStorageMockState.shouldReject = true;
  try {
    assert.equal(await saveTasks([]), false);
  } finally {
    asyncStorageMockState.shouldReject = false;
    console.warn = originalWarn;
  }
});

test('protege estado anterior antes de substituir dados restaurados', async () => {
  asyncStorageMockState.calls = [];
  const saved = await replaceStoredAppData({
    tasks: [{ id: 'restored' }],
    userSettings: { language: 'pt' },
    history: [],
    monthImages: {},
    dayMoods: {},
    moodAppearance: {},
  });

  assert.equal(saved, true);
  assert.equal(asyncStorageMockState.calls[0].key, '@schedule_app/pre_restore_backup');
  const replacement = asyncStorageMockState.calls.find(
    (call) => call.operation === 'multiSet'
  );
  assert.equal(replacement.entries.length, 6);
  assert.equal(JSON.parse(replacement.entries[0][1])[0].id, 'restored');
});

test('tenta rollback quando a substituicao restaurada falha', async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  asyncStorageMockState.calls = [];
  asyncStorageMockState.shouldRejectMultiSet = true;
  try {
    assert.equal(await replaceStoredAppData({ tasks: [] }), false);
  } finally {
    asyncStorageMockState.shouldRejectMultiSet = false;
    console.warn = originalWarn;
  }
  assert.equal(
    asyncStorageMockState.calls.some((call) => call.operation === 'multiRemove'),
    true
  );
});

const collectTranslationLeafPaths = (value, prefix = '') =>
  Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return entry && typeof entry === 'object'
      ? collectTranslationLeafPaths(entry, path)
      : [path];
  });

const getTranslationValue = (language, path) =>
  path.split('.').reduce((value, key) => value?.[key], translations[language]);

test('mantem toda a arvore de traducoes completa nos dois idiomas', () => {
  const portuguesePaths = collectTranslationLeafPaths(translations.pt).sort();
  const englishPaths = collectTranslationLeafPaths(translations.en).sort();
  assert.deepEqual(portuguesePaths, englishPaths);

  englishPaths.forEach((path) => {
    const englishTokens = `${getTranslationValue('en', path)}`.match(/\{[^}]+\}/g) ?? [];
    const portugueseTokens = `${getTranslationValue('pt', path)}`.match(/\{[^}]+\}/g) ?? [];
    assert.deepEqual(portugueseTokens.sort(), englishTokens.sort(), path);
  });
});

test('permite salvar reflexoes com qualquer conteudo significativo', () => {
  assert.equal(hasReflectionContent({ tags: ['calm'] }), true);
  assert.equal(hasReflectionContent({ note: '   ' }), false);
  assert.equal(hasReflectionContent({ level: 4 }), true);
  assert.equal(hasReflectionContent({ emoji: 'legacy' }), true);
  assert.equal(hasReflectionContent({}), false);
});

test('protege somente texto e foto privados da reflexao', () => {
  assert.equal(hasPrivateReflectionContent({ level: 4, tags: ['calm'] }), false);
  assert.equal(hasPrivateReflectionContent({ emoji: 'legacy', image: 'file://mood.png' }), false);
  assert.equal(hasPrivateReflectionContent({ note: '   ' }), false);
  assert.equal(hasPrivateReflectionContent({ note: 'Meu dia' }), true);
  assert.equal(hasPrivateReflectionContent({ photo: 'file://reflection.jpg' }), true);
});

test('usa o bloqueio do Android sem renderizar o conteudo real sob o blur', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const serviceSource = fs.readFileSync(
    path.join(root, 'services/diaryPrivacyService.js'),
    'utf8'
  );
  const maskSource = fs.readFileSync(
    path.join(root, 'components/DiaryPrivacyMask.js'),
    'utf8'
  );
  const defaultsSource = fs.readFileSync(
    path.join(root, 'constants/userSettings.js'),
    'utf8'
  );

  assert.equal(serviceSource.includes('disableDeviceFallback: false'), true);
  assert.equal(serviceSource.includes('getEnrolledLevelAsync()'), true);
  assert.equal(maskSource.includes('BlurView'), true);
  assert.equal(maskSource.includes('note'), false);
  assert.equal(maskSource.includes('source={{ uri:'), false);
  assert.equal(defaultsSource.includes('protectPrivateReflections: false'), true);
  assert.equal(appSource.includes('const DIARY_BACKGROUND_LOCK_DELAY_MS = 5 * 60 * 1000;'), true);
});

test('mantem acoes de tarefa completas nos dois idiomas', () => {
  assert.deepEqual(
    Object.keys(translations.pt.taskCard).sort(),
    Object.keys(translations.en.taskCard).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.taskModal).sort(),
    Object.keys(translations.en.taskModal).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.profileTasks).sort(),
    Object.keys(translations.en.profileTasks).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.reflection).sort(),
    Object.keys(translations.en.reflection).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.report).sort(),
    Object.keys(translations.en.report).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.dataProtection).sort(),
    Object.keys(translations.en.dataProtection).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.backup).sort(),
    Object.keys(translations.en.backup).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.common).sort(),
    Object.keys(translations.en.common).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.developer).sort(),
    Object.keys(translations.en.developer).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.profile).sort(),
    Object.keys(translations.en.profile).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.localSummary).sort(),
    Object.keys(translations.en.localSummary).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.taskDetails).sort(),
    Object.keys(translations.en.taskDetails).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.calendar).sort(),
    Object.keys(translations.en.calendar).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.today).sort(),
    Object.keys(translations.en.today).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.sheet).sort(),
    Object.keys(translations.en.sheet).sort()
  );
  assert.equal(translations.pt.taskCard.copy, 'Copiar');
  assert.equal(translations.pt.taskCard.deletedTask, 'Tarefa excluída: {title}');
  assert.equal(translations.pt.taskCard.restoredTask, 'Tarefa restaurada');
  assert.equal(translations.pt.sheet.interval, 'Intervalo');
  assert.equal(translations.pt.sheet.endDate, 'Data final');
  assert.equal(translations.pt.sheet.goBack, 'Voltar');
  assert.equal(translations.pt.sheet.duplicateHabitAnnouncement, 'Duplicar hábito');
  assert.equal(translations.pt.sheet.closeEditHabit, 'Fechar edição de hábito');
  assert.equal(translations.pt.sheet.timerHoursAccessibility, 'Horas do temporizador');
  assert.equal(translations.pt.sheet.selectColor, 'Selecionar cor {color}');
  assert.equal(translations.pt.sheet.removeSubtask, 'Remover subtarefa');
  assert.equal(translations.pt.sheet.removeReminder, 'Remover lembrete');
  assert.deepEqual(
    Object.keys(translations.pt.sheet.weekdayFullLabels).sort(),
    Object.keys(translations.en.sheet.weekdayFullLabels).sort()
  );
  assert.equal(translations.pt.sheet.weekdayFullLabels.wed, 'Quarta-feira');
  assert.equal(translations.pt.common.closeAddMenuHint, 'Toque para fechar as opções de adição');
  assert.equal(translations.pt.common.tabAccessibility, 'Aba {label}');
  assert.equal(translations.pt.fab.addReflectionIllustration, 'Ilustração para adicionar uma reflexão');
  assert.equal(translations.pt.profile.showBarChart, 'Mostrar gráfico de barras');
  assert.equal(translations.pt.profile.periodAll, 'Todo o histórico disponível');
  assert.equal(translations.pt.profile.nextChartPoint, 'Próximo ponto do gráfico');
  assert.equal(translations.pt.calendar.openDayReport, 'Abre o relatório diário');
  assert.equal(translations.pt.today.showAllTags, 'Mostrar todos os rótulos');
  assert.equal(translations.pt.reflection.removeConfirmTitle, 'Remover esta reflexão?');
  assert.equal(translations.pt.reflection.openPhoto, 'Abrir foto da reflexão');
  assert.equal(translations.pt.report.close, 'Fechar relatório diário');
  assert.equal(translations.pt.dataProtection.saveErrorTitle, 'As alterações não foram salvas');
  assert.equal(translations.pt.backup.importLabel, 'Restaurar backup');
  assert.equal(translations.pt.backup.restoreConfirm, 'Restaurar');
  assert.equal(translations.pt.common.retry, 'Tentar novamente');
  assert.equal(translations.pt.common.undo, 'Desfazer');
  assert.equal(
    translations.pt.taskModal.subtasksCompleted
      .replace('{completed}', '2')
      .replace('{total}', '3'),
    '2/3 subtarefas concluídas'
  );
});

test('oculta o titulo da tarefa em notificacoes privadas', () => {
  const strings = {
    reminderTitle: 'Lembrete',
    reminderBody: 'Hora de: {title}',
    reminderFallbackBody: 'Tarefa pendente.',
    privateReminderBody: 'Você tem um lembrete no Favit.',
  };
  const privateContent = buildTaskReminderContent(
    { title: 'Consulta médica' },
    strings,
    true
  );
  const publicContent = buildTaskReminderContent(
    { title: 'Consulta médica' },
    strings,
    false
  );

  assert.deepEqual(privateContent, {
    title: 'Lembrete',
    body: 'Você tem um lembrete no Favit.',
  });
  assert.equal(JSON.stringify(privateContent).includes('Consulta médica'), false);
  assert.equal(publicContent.body, 'Hora de: Consulta médica');
  assert.equal(scheduledReminderContentMatches(privateContent, privateContent), true);
  assert.equal(scheduledReminderContentMatches(publicContent, privateContent), false);
});

test('nao reagenda lembrete arquivado nem aceita resultado iniciado antes do arquivo', async () => {
  const activeTask = {
    id: 'task-reminder',
    title: 'Lembrete recorrente',
    date: '2026-08-11',
    dateKey: '2026-08-11',
    reminder: 'at_time',
    time: {
      specified: true,
      mode: 'point',
      point: { hour: 9, minute: 0, meridiem: 'AM' },
    },
    repeat: { enabled: true, frequency: 'daily', interval: 1 },
    notificationIds: ['existing-notification'],
    notificationId: 'existing-notification',
    notificationScheduleMode: 'recurring',
  };
  const archivedTask = { ...activeTask, archived: true, archivedAt: '2026-08-11' };

  assert.notEqual(
    getTaskReminderFingerprint(activeTask),
    getTaskReminderFingerprint(archivedTask)
  );
  assert.deepEqual(getTaskReminderPlan(archivedTask, new Date(2026, 7, 11, 8)), {
    status: 'disabled',
    mode: null,
    triggers: [],
  });

  notificationsMockState.cancelledIds = [];
  notificationsMockState.scheduledRequests = [];
  notificationsMockState.pendingRequests = [
    {
      identifier: 'existing-notification',
      content: { data: { scheduleAppTaskId: activeTask.id } },
    },
  ];
  const result = await reconcileTaskReminderSchedules([archivedTask]);

  assert.deepEqual(notificationsMockState.cancelledIds, ['existing-notification']);
  assert.equal(notificationsMockState.scheduledRequests.length, 0);
  assert.deepEqual(result.updates, [
    {
      taskId: activeTask.id,
      fingerprint: getTaskReminderFingerprint(archivedTask),
      notificationIds: [],
      notificationId: null,
      notificationScheduleMode: null,
    },
  ]);
});

test('usa o som padrao do Android sem trata-lo como arquivo customizado', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const channelStart = appSource.indexOf("setNotificationChannelAsync('default'");
  const channelEnd = appSource.indexOf('});', channelStart);
  const channelSource = appSource.slice(channelStart, channelEnd);

  assert.notEqual(channelStart, -1);
  assert.equal(channelSource.includes("sound: 'default'"), false);
});

test('celebra apenas uma nova conclusão causada pelo usuário na data visível', () => {
  const validTransition = {
    isHydrated: true,
    wasComplete: false,
    isComplete: true,
    actionDateKey: '2026-07-13',
    selectedDateKey: '2026-07-13',
  };

  assert.equal(shouldTriggerCompletionCelebration(validTransition), true);
  assert.equal(
    shouldTriggerCompletionCelebration({ ...validTransition, isHydrated: false }),
    false
  );
  assert.equal(
    shouldTriggerCompletionCelebration({ ...validTransition, wasComplete: true }),
    false
  );
  assert.equal(
    shouldTriggerCompletionCelebration({ ...validTransition, actionDateKey: null }),
    false
  );
  assert.equal(
    shouldTriggerCompletionCelebration({ ...validTransition, actionDateKey: '2026-07-12' }),
    false
  );
});

test('reconhece quando um ajuste quantum alcança a meta', () => {
  assert.equal(
    willProgressReachCompletion({ currentValue: 8, limitValue: 10, direction: 1, amount: 2 }),
    true
  );
  assert.equal(
    willProgressReachCompletion({ currentValue: 8, limitValue: 10, direction: 1, amount: 1 }),
    false
  );
  assert.equal(
    willProgressReachCompletion({ currentValue: 10, limitValue: 10, direction: 1, amount: 1 }),
    false
  );
  assert.equal(
    willProgressReachCompletion({ currentValue: 2, limitValue: 10, direction: -1, amount: 2 }),
    false
  );
  assert.equal(
    willProgressReachCompletion({ currentValue: NaN, limitValue: 10, direction: 1, amount: 2 }),
    false
  );
  assert.equal(
    willProgressReachCompletion({ currentValue: 8, limitValue: 10, direction: 0, amount: 2 }),
    false
  );
});

test('feedback haptico absorve rejeicoes assincronas sem quebrar a acao', async () => {
  hapticsMockState.calls = [];
  hapticsMockState.shouldReject = false;
  assert.equal(await triggerImpact('light'), true);
  assert.equal(await triggerSelection(), true);
  assert.equal(await triggerSuccessFeedback(), true);
  assert.deepEqual(
    hapticsMockState.calls.map(({ operation }) => operation),
    ['impact', 'selection', 'notification']
  );

  hapticsMockState.shouldReject = true;
  assert.equal(await triggerImpact('light'), false);
  assert.equal(await triggerSelection(), false);
  assert.equal(await triggerSuccessFeedback(), false);
  hapticsMockState.shouldReject = false;
});

test('calcula sequencias do perfil sem contar lembretes como pendencias', () => {
  const today = new Date(2026, 6, 15);
  const task = {
    id: 'habit-1',
    type: 'habit',
    dateKey: '2026-07-10',
    completedDates: {
      '2026-07-10': true,
      '2026-07-11': true,
      '2026-07-13': true,
      '2026-07-14': true,
    },
  };
  const reminder = {
    id: 'reminder-1',
    type: 'reminder',
    dateKey: '2026-07-10',
  };
  const stats = calculateProfileStats({ tasks: [task, reminder], history: [], today });
  const selectedStats = calculateProfileStats({
    tasks: [task, reminder],
    history: [],
    selectedTask: task,
    today,
  });

  assert.equal(stats.totalDays, 6);
  assert.equal(stats.committedHabits, 2);
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.bestStreak, 2);
  assert.equal(selectedStats.completions, 4);
});

test('limita a janela de sequencia e ignora datas invalidas sem alterar o total', () => {
  const stats = calculateProfileStats({
    tasks: [{ id: 'old', type: 'habit', dateKey: '1900-01-01', completedDates: {} }],
    history: [{ timestamp: 'data-invalida' }],
    today: new Date(2026, 6, 15),
  });

  assert.ok(stats.totalDays > MAX_PROFILE_STREAK_DAYS);
  assert.equal(stats.evaluatedDays, MAX_PROFILE_STREAK_DAYS);
  assert.equal(stats.isStreakRangeLimited, true);
});

test('processa fixtures de perfil com 0, 50, 500 e 2.000 tarefas', () => {
  const today = new Date(2026, 6, 15);
  const todayKey = '2026-07-15';

  [0, 50, 500, 2000].forEach((taskCount) => {
    const tasks = Array.from({ length: taskCount }, (_, index) => ({
      id: `fixture-${taskCount}-${index}`,
      type: 'habit',
      dateKey: '2024-07-16',
      completedDates: index % 2 === 0 ? { [todayKey]: true } : {},
    }));
    const stats = calculateProfileStats({ tasks, history: [], today });
    const series = buildDailyCompletionSeries({ tasks, endDate: today, days: 30 });

    assert.equal(stats.committedHabits, taskCount);
    assert.equal(
      stats.evaluatedDays,
      taskCount === 0 ? 0 : MAX_PROFILE_STREAK_DAYS
    );
    assert.equal(series.entries.length, 30);
    assert.equal(series.entries[29].total, taskCount);
    assert.equal(series.entries[29].completed, Math.ceil(taskCount / 2));
  });
});

test('registra somente metadados de performance nao sensiveis', () => {
  clearPerformanceMetrics();
  const result = measureSynchronous(
    'profile.test',
    () => ({ taskCount: 2 }),
    (value) => ({
      taskCount: value.taskCount,
      filtered: false,
      preciseValue: 1.234,
      title: 'segredo',
      nested: { note: 'segredo' },
      InvalidKey: 1,
    }),
    { log: false }
  );
  const metrics = getRecentPerformanceMetrics();

  assert.equal(result.taskCount, 2);
  assert.equal(metrics.length, 1);
  assert.deepEqual(metrics[0].metadata, {
    taskCount: 2,
    filtered: false,
    preciseValue: 1.23,
  });
  metrics[0].metadata.taskCount = 999;
  assert.equal(getRecentPerformanceMetrics()[0].metadata.taskCount, 2);
});

test('observabilidade nao substitui o resultado nem o erro real da operacao', () => {
  clearPerformanceMetrics();
  assert.equal(
    measureSynchronous('profile.metadata-failure', () => 42, () => {
      throw new Error('metadata failure');
    }, { log: false }),
    42
  );

  const operationError = new Error('operation failure');
  assert.throws(
    () =>
      measureSynchronous(
        'profile.operation-failure',
        () => {
          throw operationError;
        },
        { taskCount: 3 },
        { log: false }
      ),
    (error) => error === operationError
  );
  const failureMetric = getRecentPerformanceMetrics().at(-1);
  assert.equal(failureMetric.metadata.taskCount, 3);
  assert.equal(failureMetric.metadata.failed, true);
});

test('limita o buffer de observabilidade as 100 metricas mais recentes', () => {
  clearPerformanceMetrics();
  for (let index = 0; index < 105; index += 1) {
    recordPerformanceMetric(`profile.buffer-${index}`, index, {}, { log: false });
  }
  const metrics = getRecentPerformanceMetrics();
  assert.equal(metrics.length, 100);
  assert.equal(metrics[0].name, 'profile.buffer-5');
  assert.equal(metrics[99].name, 'profile.buffer-104');
  clearPerformanceMetrics();
});

test('error boundary registra falha sanitizada e remonta no retry', () => {
  clearPerformanceMetrics();
  const boundary = new AppErrorBoundary({ children: 'app' });
  boundary.state = {
    hasError: true,
    recoveryAttempt: 0,
    contentKey: 0,
  };
  boundary.setState = (update, onComplete) => {
    const nextState = typeof update === 'function' ? update(boundary.state) : update;
    boundary.state = { ...boundary.state, ...nextState };
    onComplete?.();
  };

  assert.deepEqual(AppErrorBoundary.getDerivedStateFromError(new Error('secret')), {
    hasError: true,
  });
  boundary.componentDidCatch(new TypeError('secret'), { componentStack: 'private stack' });
  boundary.handleRetry();

  assert.equal(boundary.state.hasError, false);
  assert.equal(boundary.state.recoveryAttempt, 1);
  assert.equal(boundary.state.contentKey, 1);
  const metrics = getRecentPerformanceMetrics();
  assert.deepEqual(metrics.map(({ name }) => name), [
    'app.render-error',
    'app.render-retry',
  ]);
  assert.deepEqual(metrics[0].metadata, {
    recoveryAttempt: 0,
    errorTypeKnown: true,
    componentStackAvailable: true,
  });
  assert.equal(JSON.stringify(metrics).includes('secret'), false);
  assert.equal(JSON.stringify(metrics).includes('private stack'), false);
  clearPerformanceMetrics();
});

test('rejeita datas de calendário inexistentes', () => {
  assert.equal(normalizeDateValue('2026-02-29'), null);
  assert.equal(normalizeDateValue('2026-02-31'), null);
  assert.equal(normalizeDateValue('2024-02-29')?.getDate(), 29);
});

test('mantem a data selecionada no centro da faixa de sete dias', () => {
  const julyDates = createCenteredWeekDates('2026-07-19').map(getDateKey);
  assert.deepEqual(julyDates, [
    '2026-07-16',
    '2026-07-17',
    '2026-07-18',
    '2026-07-19',
    '2026-07-20',
    '2026-07-21',
    '2026-07-22',
  ]);

  const yearBoundaryDates = createCenteredWeekDates('2026-01-01').map(getDateKey);
  assert.equal(yearBoundaryDates[0], '2025-12-29');
  assert.equal(yearBoundaryDates[3], '2026-01-01');
  assert.equal(yearBoundaryDates[6], '2026-01-04');
  assert.deepEqual(createCenteredWeekDates('2026-02-29'), []);
});

test('prepara datas laterais para centralizacao animada do Today', () => {
  const dates = createCenteredDateWindow('2026-07-19', 6).map(getDateKey);

  assert.equal(dates.length, 13);
  assert.equal(dates[0], '2026-07-13');
  assert.equal(dates[6], '2026-07-19');
  assert.equal(dates[12], '2026-07-25');
  assert.deepEqual(createCenteredDateWindow('2026-02-29', 6), []);
  assert.deepEqual(createCenteredDateWindow('2026-07-19', -1), []);
  assert.equal(getCalendarDayOffset('2026-07-19', '2026-07-22'), 3);
  assert.equal(getCalendarDayOffset('2026-01-01', '2025-12-29'), -3);
});

test('aceita somente data final igual ou posterior ao início', () => {
  assert.equal(isValidDateRange('2026-07-13', '2026-07-13'), true);
  assert.equal(isValidDateRange('2026-07-13', '2026-07-14'), true);
  assert.equal(isValidDateRange('2026-07-13', '2026-07-12'), false);
});

test('não exibe nem o dia inicial quando o fim é anterior ao início', () => {
  const task = {
    dateKey: '2026-07-13',
    repeat: { enabled: true, frequency: 'daily', interval: 1, endDate: '2026-07-12' },
  };
  assert.equal(shouldTaskAppearOnDate(task, '2026-07-13'), false);
});

test('considera a data final inclusiva e bloqueia o dia seguinte', () => {
  const task = {
    dateKey: '2026-07-13',
    repeat: { enabled: true, frequency: 'daily', interval: 1, endDate: '2026-07-15' },
  };
  assert.equal(shouldTaskAppearOnDate(task, '2026-07-15'), true);
  assert.equal(shouldTaskAppearOnDate(task, '2026-07-16'), false);
});

test('respeita intervalo e dias da recorrência semanal', () => {
  const task = {
    dateKey: '2026-07-13',
    repeat: {
      enabled: true,
      frequency: 'weekly',
      interval: 2,
      weekdays: ['mon', 'wed'],
    },
  };
  assert.equal(shouldTaskAppearOnDate(task, '2026-07-15'), true);
  assert.equal(shouldTaskAppearOnDate(task, '2026-07-20'), false);
  assert.equal(shouldTaskAppearOnDate(task, '2026-07-27'), true);
});

test('exige meta quantum positiva no modo ativo', () => {
  assert.equal(
    isValidQuantumDefinition({ mode: 'timer', timer: { minutes: 0, seconds: 0 } }),
    false
  );
  assert.equal(
    isValidQuantumDefinition({ mode: 'timer', timer: { minutes: 0, seconds: 1 } }),
    true
  );
  assert.equal(
    isValidQuantumDefinition({ mode: 'count', count: { value: 0 } }),
    false
  );
  assert.equal(
    isValidQuantumDefinition({ mode: 'count', count: { value: 1 } }),
    true
  );
});

const existingQuantumTask = {
  type: 'quantum',
  completedDates: { '2026-07-13': true },
  quantum: {
    mode: 'count',
    animation: 'water',
    count: { value: 10, unit: 'pages' },
    progressByDate: { '2026-07-13': { doneCount: 6 } },
    doneCount: 6,
  },
};

test('preserva progresso quando somente a apresentação muda', () => {
  const nextQuantum = {
    mode: 'count',
    animation: 'default',
    count: { value: 10, unit: 'Pages' },
  };
  assert.equal(shouldResetTaskProgress(existingQuantumTask, 'quantum', nextQuantum), false);
  const reconciled = reconcileTaskProgressOnEdit(
    existingQuantumTask,
    'quantum',
    nextQuantum
  );
  assert.equal(reconciled.quantum.progressByDate['2026-07-13'].doneCount, 6);
  assert.equal(reconciled.completedDates['2026-07-13'], true);
});

test('reinicia progresso quando meta, unidade, modo ou tipo muda', () => {
  assert.equal(
    shouldResetTaskProgress(existingQuantumTask, 'quantum', {
      mode: 'count',
      count: { value: 20, unit: 'pages' },
    }),
    true
  );
  assert.equal(
    shouldResetTaskProgress(existingQuantumTask, 'quantum', {
      mode: 'count',
      count: { value: 10, unit: 'books' },
    }),
    true
  );
  assert.equal(
    shouldResetTaskProgress(existingQuantumTask, 'quantum', {
      mode: 'timer',
      timer: { minutes: 1, seconds: 0 },
    }),
    true
  );
  const reconciled = reconcileTaskProgressOnEdit(existingQuantumTask, 'default', null);
  assert.deepEqual(reconciled.completedDates, {});
  assert.equal(reconciled.quantum, null);
  assert.equal(reconciled.progressReset, true);
});

test('guarda um snapshot mínimo da tarefa nos eventos de histórico', () => {
  assert.deepEqual(
    createTaskHistoryDetails(
      { id: 'task-1', title: 'Ler' },
      { dateKey: '2026-07-13', completed: true }
    ),
    {
      taskId: 'task-1',
      title: 'Ler',
      dateKey: '2026-07-13',
      completed: true,
    }
  );
  assert.equal(
    createTaskHistoryDetails(
      { id: 'task-1', title: 'Nome atual' },
      { title: 'Nome do evento' }
    ).title,
    'Nome do evento'
  );
});

test('preserva nomes antigos antes de uma tarefa ser excluída', () => {
  const history = [
    { id: 'missing-title', details: { taskId: 'task-1', completed: true } },
    { id: 'existing-title', details: { taskId: 'task-1', title: 'Nome anterior' } },
    { id: 'unknown-task', details: { taskId: 'task-2' } },
  ];
  const result = backfillTaskTitlesInHistory(history, [
    { id: 'task-1', title: 'Nome atual' },
  ]);

  assert.equal(result[0].details.title, 'Nome atual');
  assert.equal(result[1].details.title, 'Nome anterior');
  assert.equal(result[2].details.title, undefined);
  assert.strictEqual(
    backfillTaskTitlesInHistory(result, [{ id: 'task-1', title: 'Outro nome' }]),
    result
  );
});

test('remove da seleção em massa IDs de tarefas que não existem mais', () => {
  const selectedTaskIds = ['task-1', 'task-2'];
  const tasks = [{ id: 'task-1' }];
  const unchangedSelection = ['task-1'];

  assert.deepEqual(pruneSelectedTaskIds(selectedTaskIds, tasks), ['task-1']);
  assert.strictEqual(
    pruneSelectedTaskIds(unchangedSelection, tasks),
    unchangedSelection
  );
});

test('preserva todo o histórico que alimenta a linha do tempo', () => {
  const existingHistory = Array.from({ length: 250 }, (_, index) => ({
    id: `event-${index}`,
  }));
  const newEntry = { id: 'new-event' };
  const result = prependHistoryEntry(existingHistory, newEntry);

  assert.equal(result.length, 251);
  assert.strictEqual(result[0], newEntry);
  assert.equal(result.at(-1).id, 'event-249');
});

test('combina reflexões e ações em uma linha do tempo pesquisável', () => {
  const result = buildSearchableTimelineItems({
    history: [
      {
        id: 'activity-1',
        type: 'task_completion_toggled',
        timestamp: '2026-07-18T10:00:00.000Z',
        details: { taskId: 'task-1', completed: true },
      },
    ],
    tasks: [{ id: 'task-1', title: 'Ler um livro' }],
    dayMoods: {
      '2026-07-17': {
        level: 4,
        tags: ['focused'],
        note: 'Meditação antes do trabalho',
      },
    },
    now: new Date(2026, 6, 19, 12),
    tagLabels: { focused: 'Focado' },
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].source, 'activity');
  assert.equal(result[1].source, 'reflection');
  assert.equal(result[1].dateKey, '2026-07-17');
});

test('busca notas e rótulos sem diferenciar acentos', () => {
  const base = {
    history: [],
    dayMoods: {
      '2026-07-18': {
        level: 5,
        tags: ['focused'],
        note: 'Meditação concluída',
      },
    },
    now: new Date(2026, 6, 19, 12),
    tagLabels: { focused: 'Focado' },
  };

  assert.equal(normalizeTimelineSearchText('Meditação'), 'meditacao');
  assert.equal(buildSearchableTimelineItems({ ...base, query: 'meditacao' }).length, 1);
  assert.equal(buildSearchableTimelineItems({ ...base, query: 'focado' }).length, 1);
  assert.equal(buildSearchableTimelineItems({ ...base, query: 'ansioso' }).length, 0);
});

test('filtra a linha do tempo por período, humor e conteúdo', () => {
  const base = {
    history: [
      {
        id: 'old-activity',
        type: 'task_created',
        timestamp: new Date(2026, 5, 1, 10).toISOString(),
        details: { title: 'Evento antigo' },
      },
    ],
    dayMoods: {
      '2026-07-18': { level: 4, note: 'Dia produtivo', photo: 'file://photo.jpg' },
      '2026-07-17': { level: 2, note: 'Dia difícil' },
      '2026-06-01': { level: 5, note: 'Fora do período', photo: 'file://old.jpg' },
    },
    now: new Date(2026, 6, 19, 12),
  };
  const result = buildSearchableTimelineItems({
    ...base,
    period: '7',
    mood: 'positive',
    requireNote: true,
    requirePhoto: true,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].dateKey, '2026-07-18');
  assert.equal(result[0].source, 'reflection');
});

test('diferencia o resumo do período das métricas desenhadas no gráfico', () => {
  assert.equal(
    getChartMetricKey({ mode: 'percent', chartType: 'line', isFocused: false }),
    'periodRate'
  );
  assert.equal(
    getChartMetricKey({ mode: 'values', chartType: 'bars', isFocused: false }),
    'periodCompletions'
  );
  assert.equal(
    getChartSeriesMetricKey({ mode: 'percent', chartType: 'line' }),
    'movingAverage'
  );
  assert.equal(
    getChartSeriesMetricKey({ mode: 'percent', chartType: 'bars' }),
    'intervalRate'
  );
  assert.equal(
    getChartSeriesMetricKey({ mode: 'values', chartType: 'line' }),
    'dailyCompletions'
  );
  assert.equal(
    getChartSeriesMetricKey({ mode: 'values', chartType: 'bars' }),
    'intervalCompletions'
  );
  assert.equal(
    getChartSeriesMetricKey({ mode: 'accum', chartType: 'line' }),
    'cumulativeCompletions'
  );
  assert.equal(getChartEmptyStateKey('percent'), 'percent');
  assert.equal(getChartEmptyStateKey('values'), 'values');
  assert.equal(getChartEmptyStateKey('accum'), 'accum');
});

test('valida tamanho, dimensoes e tipo das imagens selecionadas', () => {
  const limits = IMAGE_LIMITS.habitIcon;
  assert.equal(
    validatePickedImageAsset(
      {
        uri: 'file:///cache/icon.png',
        type: 'image',
        mimeType: 'image/png',
        fileSize: limits.maxBytes,
        width: limits.maxDimension,
        height: limits.maxDimension,
      },
      limits
    ).valid,
    true
  );
  assert.equal(
    validatePickedImageAsset(
      { uri: 'file:///cache/icon.png', fileSize: limits.maxBytes + 1 },
      limits
    ).code,
    IMAGE_ERROR_CODES.FILE_TOO_LARGE
  );
  assert.equal(
    validatePickedImageAsset(
      { uri: 'file:///cache/icon.png', width: limits.maxDimension + 1 },
      limits
    ).code,
    IMAGE_ERROR_CODES.DIMENSIONS_TOO_LARGE
  );
  assert.equal(
    validatePickedImageAsset(
      { uri: 'file:///cache/file.pdf', mimeType: 'application/pdf' },
      limits
    ).code,
    IMAGE_ERROR_CODES.UNSUPPORTED_TYPE
  );
});

test('normaliza a extensao da imagem sem confiar apenas na URI', () => {
  assert.equal(
    getPickedImageExtension({ uri: 'content://gallery/12', fileName: 'photo.JPEG' }),
    'jpg'
  );
  assert.equal(
    getPickedImageExtension({ uri: 'content://gallery/13', mimeType: 'image/webp' }),
    'webp'
  );
  assert.equal(getPickedImageExtension({ uri: 'content://gallery/14' }), 'jpg');
});

test('reconhece GIFs persistidos para respeitar reduzir movimento', () => {
  assert.equal(isGifImageUri('file:///documents/custom_month_7.gif'), true);
  assert.equal(isGifImageUri('file:///documents/custom_month_7.GIF?version=2'), true);
  assert.equal(isGifImageUri('file:///documents/custom_month_7.png'), false);
  assert.equal(isGifImageUri(null), false);
});

test('formata mensagens localizadas com os limites aplicados', () => {
  const strings = {
    genericError: 'erro',
    fileTooLarge: 'maximo {maxSize}',
    dimensionsTooLarge: 'maximo {maxDimension}',
  };
  assert.equal(formatImageSizeLimit(8 * 1024 * 1024), '8 MB');
  assert.equal(
    getImageErrorMessage(
      strings,
      { code: IMAGE_ERROR_CODES.FILE_TOO_LARGE },
      IMAGE_LIMITS.habitIcon
    ),
    'maximo 8 MB'
  );
  assert.equal(
    getImageErrorMessage(
      strings,
      { code: IMAGE_ERROR_CODES.DIMENSIONS_TOO_LARGE },
      IMAGE_LIMITS.habitIcon
    ),
    'maximo 4096'
  );
});

test('mantem listas extensas virtualizadas na tela principal e no perfil', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');

  assert.equal(appSource.includes('data={visibleTasksWithStats}'), true);
  assert.equal(appSource.includes('renderItem={renderTodayTask}'), true);
  assert.equal(appSource.includes('visibleTasksWithStats.map('), false);
  assert.equal(appSource.includes('data={profileFilterItems}'), true);
  assert.equal(appSource.includes('renderItem={renderProfileFilterChip}'), true);
});

test('fecha o filtro do perfil pelo X ou backdrop escurecido', () => {
  const sheetSource = fs.readFileSync(
    path.join(root, 'components/ProfileFilterSheet.js'),
    'utf8'
  );
  const stylesSource = fs.readFileSync(path.join(root, 'styles/appStyles.js'), 'utf8');

  assert.equal(sheetSource.includes('statusBarTranslucent'), true);
  assert.equal(sheetSource.includes('navigationBarTranslucent'), true);
  assert.equal(sheetSource.includes('style={styles.profileFilterSheetBackdrop}'), true);
  assert.equal(sheetSource.includes('name="close-circle"'), true);
  assert.equal(
    (sheetSource.match(/accessibilityLabel=\{t\.profile\.filterSheetClose\}/g)?.length ?? 0),
    2
  );
  assert.match(
    stylesSource,
    /profileFilterSheetOverlay:\s*\{[\s\S]*?backgroundColor: 'rgba\(0, 0, 0, 0\.55\)'/
  );
});

test('mantem o detalhe da task acima da navegacao inferior do aparelho', () => {
  const detailSource = fs.readFileSync(
    path.join(root, 'components/TaskDetailModal.js'),
    'utf8'
  );

  assert.equal(
    detailSource.includes("import { useSafeAreaInsets } from 'react-native-safe-area-context';"),
    true
  );
  assert.equal(detailSource.includes('const insets = useSafeAreaInsets();'), true);
  assert.equal(
    detailSource.includes('paddingBottom: Math.max(28, insets.bottom + 16)'),
    true
  );
});

test('mantem o corpo do perfil com margens horizontais simetricas', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(root, 'styles/appStyles.js'), 'utf8');

  assert.equal(
    appSource.includes('const profileContentWidth = Math.max(0, width - 48);'),
    true
  );
  assert.equal(
    appSource.includes('style={[styles.profileBody, { width: profileContentWidth }]}'),
    true
  );
  assert.match(stylesSource, /profileBody:\s*\{\s*alignSelf: 'center'/);
});

test('expoe abas e acoes de reflexao ao leitor de tela', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const feedSource = fs.readFileSync(path.join(root, 'components/ReflectionFeed.js'), 'utf8');
  const reportSource = fs.readFileSync(path.join(root, 'components/DayReportModal.js'), 'utf8');

  assert.equal(appSource.includes('accessibilityRole="tab"'), true);
  assert.equal(
    appSource.includes('accessibilityState={{ selected: isActive, disabled: isFabOpen }}'),
    true
  );
  assert.equal(feedSource.includes('accessibilityLabel={t.reflection.closePhoto}'), true);
  assert.equal(reportSource.includes('accessibilityLabel={t.report.close}'), true);
  assert.equal(reportSource.includes('accessibilityLabel={t.reflection.openPhoto}'), true);
});

test('mantem a barra inferior legivel com fonte ampliada em portugues', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(root, 'styles/appStyles.js'), 'utf8');

  assert.equal(appSource.includes('const { width, fontScale } = useWindowDimensions();'), true);
  assert.equal(appSource.includes('const isBottomBarLargeText = fontScale >= 1.6;'), true);
  assert.equal(appSource.includes('numberOfLines={isBottomBarLargeText ? 2 : 1}'), true);
  assert.equal(appSource.includes('maxFontSizeMultiplier={2}'), true);
  assert.match(
    appSource,
    /!isBottomBarLargeText &&\r?\n\s+\(key === 'calendar' \|\| key === 'discover'\) &&/
  );
  assert.match(stylesSource, /tabButtonWide:\s*\{\s*flex: 1\.5/);
  assert.equal(stylesSource.includes("textAlign: 'center'"), true);
  assert.equal(translations.pt.tabs.calendar, 'CALENDÁRIO');
  assert.equal(translations.pt.tabs.discover, 'DESCUBRA');
});

test('anima cinco meses do calendario e mantem os demais estaticos', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(root, 'styles/appStyles.js'), 'utf8');
  const monthsSource = fs.readFileSync(path.join(root, 'constants/months.js'), 'utf8');
  const calendarSource = fs.readFileSync(
    path.join(root, 'components/CalendarMonthItem.js'),
    'utf8'
  );
  const stickyHeaderSource = fs.readFileSync(
    path.join(root, 'components/StickyMonthHeader.js'),
    'utf8'
  );
  const reportSource = fs.readFileSync(path.join(root, 'components/DayReportModal.js'), 'utf8');
  const customizeSource = fs.readFileSync(
    path.join(root, 'components/CustomizeCalendarModal.js'),
    'utf8'
  );

  assert.equal(
    monthsSource.match(/assets\/months\/static\/[a-z]{3}\.webp/g)?.length,
    12
  );
  assert.equal(
    monthsSource.match(/assets\/months\/[a-z]{3}\.gif/g)?.length,
    12
  );
  assert.equal(monthsSource.includes('return isGifImageUri(customImageUri) ? null'), true);
  assert.equal(monthsSource.includes('return animate && !reduceMotion'), true);
  assert.equal(monthsSource.includes('? MONTH_ANIMATED_IMAGES[index]'), true);
  assert.equal(monthsSource.includes(': MONTH_STATIC_IMAGES[index]'), true);
  assert.equal(appSource.includes('for (let offset = -2; offset <= 2; offset += 1)'), true);
  assert.equal(appSource.includes('animateImage={animatedCalendarMonthIds.has(item.monthId)}'), true);
  assert.equal(appSource.includes('extraData={animatedCalendarMonthIds}'), true);
  assert.equal(calendarSource.includes('animate: animateImage'), true);
  assert.equal(calendarSource.includes('getMonthReducedMotionColor(item.monthIndex)'), true);
  assert.equal(stickyHeaderSource.includes('animate: animateImage'), true);
  assert.equal(stickyHeaderSource.includes('getMonthReducedMotionColor(monthIndex)'), true);
  assert.equal(appSource.includes('<View style={styles.calendarStickyHeaderSlot}>'), true);
  assert.equal(appSource.includes('{!isHabitSheetOpen ? ('), true);
  assert.match(stylesSource, /calendarStickyHeaderSlot:\s*\{[\s\S]*?height: 50/);
  assert.equal(reportSource.includes('animate: visible'), true);
  assert.equal(reportSource.includes('getMonthReducedMotionColor(monthIndex)'), true);
  assert.equal(customizeSource.includes('getMonthReducedMotionColor(index)'), true);
  assert.equal((appSource.match(/reduceMotion=\{prefersReducedMotion\}/g)?.length ?? 0) >= 4, true);
  assert.equal(appSource.includes('hasMountedCalendar'), false);
  assert.equal(appSource.includes('{isCalendarTabActive ? ('), true);
  assert.equal(appSource.includes('windowSize={3}'), true);
  assert.equal(customizeSource.includes('IMAGE_ERROR_CODES.UNSUPPORTED_TYPE'), true);
});

test('abre o teclado do titulo somente por interacao do usuario', () => {
  const sheetSource = fs.readFileSync(
    path.join(root, 'components/AddHabitSheet.js'),
    'utf8'
  );

  assert.equal(sheetSource.includes('const handleTitleInputLayout = useCallback(() => {'), false);
  assert.equal(sheetSource.includes('onLayout={handleTitleInputLayout}'), false);
  assert.equal(sheetSource.includes('hasFocusedTitleRef.current = true;'), false);
  assert.equal(sheetSource.includes('titleInputRef.current?.focus();'), false);
  assert.equal(sheetSource.includes('ref={titleInputRef}'), true);
});

test('mantem a troca de dias do Today animada e sensivel a reduzir movimento', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');

  assert.equal(appSource.includes('todayDayStripRef.current?.scrollToOffset'), true);
  assert.equal(appSource.includes('animated: true'), true);
  assert.equal(appSource.includes('Animated.timing(todayPageTranslateX'), true);
  assert.equal(
    appSource.includes("activeTab === 'today' && !prefersReducedMotion && dayOffset !== 0"),
    true
  );
  assert.equal(appSource.includes('setPendingTodayDateKey(targetDateKey)'), true);
});

test('anima a troca de categoria do Today com o mesmo gesto lateral dos dias', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const handlerSource = appSource.match(
    /const handleSelectTagFilter = useCallback\([\s\S]*?\n  \);/
  )?.[0] ?? '';

  assert.equal(handlerSource.includes("const filterOrder = ['all', ...tagOptions.map"), true);
  assert.equal(handlerSource.includes("activeTab === 'today' && !prefersReducedMotion"), true);
  assert.equal(handlerSource.includes('Animated.timing(todayCardsTranslateX'), true);
  assert.equal(handlerSource.includes('Animated.timing(todayPageTranslateX'), false);
  assert.equal(handlerSource.includes('toValue: -direction * todayPageTravelDistance'), true);
  assert.equal(handlerSource.includes('toValue: direction * todayPageTravelDistance'), false);
  assert.equal(handlerSource.includes('todayCardsTranslateX.setValue(direction * todayPageTravelDistance)'), true);
  assert.equal(handlerSource.includes('setSelectedTagFilter(filterKey)'), true);
  assert.equal(appSource.includes('opacity: todayContentOpacity'), true);
  assert.equal(appSource.includes('{ translateX: todayContentTranslateX }'), true);
  assert.equal(
    appSource.includes('style={[styles.tagFilterContainer, todayPageTransitionStyle]}'),
    true
  );
  assert.equal(appSource.includes('disabled={isTodayPageTransitioning}'), true);
  assert.equal(
    appSource.includes('needsOffscreenAlphaCompositing'),
    true
  );
  assert.equal(
    appSource.includes('renderToHardwareTextureAndroid={isTodayPageTransitioning}'),
    true
  );
});

test('mostra o selo Finished somente na data do marco, na linha da frequencia', () => {
  const badgeSource = fs.readFileSync(
    path.join(root, 'components/FinishedMilestoneBadge.js'),
    'utf8'
  );
  const taskCardSource = fs.readFileSync(
    path.join(root, 'components/SwipeableTaskCard.js'),
    'utf8'
  );
  const reportSource = fs.readFileSync(
    path.join(root, 'components/DayReportModal.js'),
    'utf8'
  );
  const profileDetailSource = fs.readFileSync(
    path.join(root, 'components/ProfileTaskDetailModal.js'),
    'utf8'
  );

  assert.equal(badgeSource.includes('const MESSAGE_HOLD_MS = 3500'), true);
  assert.equal(badgeSource.includes('const SLIDE_DURATION_MS = 1200'), true);
  assert.equal(badgeSource.includes('onPress={(event) => {'), true);
  assert.equal(badgeSource.includes('event.stopPropagation?.();'), true);
  assert.equal(badgeSource.includes('backgroundColor'), false);
  // O selo em repouso ja esta assentado: abrir a tela nao anima nada e o toque
  // move so a frase.
  assert.equal(badgeSource.includes('useRef(new Animated.Value(1)).current'), true);
  assert.equal(badgeSource.includes('playMessage(0);'), true);
  assert.equal(badgeSource.includes('playEntrance();'), true);
  // A frase flutua, entao entrar e sair dela nao pode mexer no layout do card.
  assert.equal(badgeSource.includes("position: 'absolute'"), true);
  assert.equal(taskCardSource.includes('getTaskFinishedMilestoneForDate(task, dateKey)'), true);
  assert.equal(taskCardSource.includes('animationToken={finishedMilestoneAnimationToken}'), true);
  assert.equal(taskCardSource.includes('style={styles.taskTimeRow}'), true);
  assert.equal(taskCardSource.includes('message={finishedMilestoneMessage}'), true);
  assert.equal(reportSource.includes('getTaskFinishedMilestoneForDate(task, dateKey)'), true);
  assert.equal(reportSource.includes('animationToken='), false);
  assert.equal(profileDetailSource.includes('>{streak}</Text>'), true);
  assert.equal(profileDetailSource.includes('>{finished}</Text>'), true);
});

test('desenha crista e corpo da agua no mesmo path animado sem emenda', () => {
  const taskCardSource = fs.readFileSync(
    path.join(root, 'components/SwipeableTaskCard.js'),
    'utf8'
  );

  assert.equal(taskCardSource.includes('WATER_WAVE_MIN_FILL_HEIGHT'), true);
  assert.equal(taskCardSource.includes('<SvgLinearGradient'), true);
  assert.equal(taskCardSource.includes('stopColor={WATER_GRADIENT_TOP_COLOR}'), true);
  assert.equal(taskCardSource.includes('stopColor={WATER_GRADIENT_BOTTOM_COLOR}'), true);
  assert.equal(taskCardSource.includes('fill={`url(#${waterGradientId})`}'), true);
  assert.equal(taskCardSource.includes('const AnimatedPath = Animated.createAnimatedComponent(Path)'), true);
  assert.equal(taskCardSource.includes('styles.waterFallbackFill'), true);
  assert.equal(taskCardSource.includes('waveCombinedShift'), true);
  assert.equal(taskCardSource.includes('WATER_WAVE_HORIZONTAL_OVERSCAN'), true);
  assert.equal(taskCardSource.includes('translateX: waveCombinedShift'), true);
  assert.equal(taskCardSource.includes('styles.waterFallbackBody'), false);
  assert.equal(taskCardSource.includes('AnimatedLinearGradient'), false);
  assert.equal(taskCardSource.includes('waterSurfaceBridge'), false);
});

test('mantem agua visivel em progresso zero sem distorcer a conclusao', () => {
  assert.equal(WATER_WAVE_MIN_FILL_HEIGHT, 19);
  assert.equal(WATER_WAVE_AMPLITUDE, 4);
  assert.equal(WATER_WAVE_DURATION_MS, 4500);
  assert.equal(WATER_WAVE_HORIZONTAL_OVERSCAN > 10, true);
  assert.equal(getWaterDisplayPercent(0), WATER_IDLE_FILL_PERCENT);
  assert.equal(getWaterDisplayPercent(1), 1);
  assert.equal(getWaterDisplayPercent(-1), WATER_IDLE_FILL_PERCENT);
  assert.equal(getWaterDisplayPercent(2), 1);
  assert.equal(getWaterDisplayPercent(Number.NaN), WATER_IDLE_FILL_PERCENT);
  assert.equal(getWaterDisplayPercent(0.5), 0.58);
});

test('mantem a previa de agua nativa e limitada ao painel de tipo', () => {
  const previewSource = fs.readFileSync(
    path.join(root, 'components/taskEditor/TypePreviewCard.js'),
    'utf8'
  );
  const editorStylesSource = fs.readFileSync(
    path.join(root, 'components/taskEditor/styles.js'),
    'utf8'
  );
  const sheetSource = fs.readFileSync(
    path.join(root, 'components/AddHabitSheet.js'),
    'utf8'
  );
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const addHabitMarkup = appSource.match(/<AddHabitSheet[\s\S]*?\/>/)?.[0] ?? '';

  assert.equal(previewSource.includes('buildRepeatingWavePath'), true);
  // A animacao so roda com o painel de tipo aberto: a folha informa isso pelo
  // `isActive`, e o componente exige a flag antes de iniciar o loop.
  assert.equal(sheetSource.includes("isActive={panel?.key === 'type'}"), true);
  assert.equal(previewSource.includes('if (!isActive || !isWater || reduceMotion'), true);
  assert.equal(previewSource.includes('previewWavePhaseAnim.addListener'), false);
  assert.equal(previewSource.includes('setPreviewWavePath'), false);
  assert.equal(previewSource.includes('Animated.loop('), true);
  assert.equal(previewSource.includes('const AnimatedPath = Animated.createAnimatedComponent(Path)'), true);
  assert.equal(previewSource.includes('translateX: previewWaveShift'), true);
  assert.equal(previewSource.includes('previewWaveGeometry.fillPath'), true);
  assert.equal(previewSource.includes('previewWaveGeometry.backPath'), false);
  assert.equal(previewSource.includes('previewWaveGeometry.frontPath'), false);
  assert.equal(previewSource.includes('WATER_WAVE_MIN_FILL_HEIGHT'), true);
  assert.equal(previewSource.includes('amplitude: WATER_WAVE_AMPLITUDE'), true);
  assert.equal(previewSource.includes('duration: WATER_WAVE_DURATION_MS'), true);
  assert.equal(previewSource.includes('easing: Easing.linear'), true);
  assert.equal(previewSource.includes('stopColor={WATER_GRADIENT_TOP_COLOR}'), true);
  assert.equal(previewSource.includes('stopColor={WATER_GRADIENT_BOTTOM_COLOR}'), true);
  assert.match(editorStylesSource, /typePreviewCard:\s*\{[\s\S]*?overflow: 'hidden'/);
  assert.match(
    editorStylesSource,
    /typePreviewWaterFallbackFill:\s*\{[\s\S]*?borderBottomLeftRadius: 18[\s\S]*?borderBottomRightRadius: 18/
  );
  assert.equal(
    previewSource.includes('previous.width === width && previous.height === height'),
    true
  );
  assert.equal(addHabitMarkup.includes('reduceMotion={prefersReducedMotion}'), true);
});

test('anima a folha pela base sem elevar o wrapper durante a edicao', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const sheetSource = fs.readFileSync(
    path.join(root, 'components/AddHabitSheet.js'),
    'utf8'
  );
  const editorStylesSource = fs.readFileSync(
    path.join(root, 'components/taskEditor/styles.js'),
    'utf8'
  );
  assert.equal(sheetSource.includes('Animated.timing(sheetTranslateY'), true);
  assert.equal(sheetSource.includes('transform: [{ translateY: sheetTranslateY }]'), true);
  assert.equal(sheetSource.includes('Animated.parallel(['), true);
  assert.equal(sheetSource.includes('if (reduceMotion) {'), true);
  assert.equal(sheetSource.includes('<Animated.View'), true);
  assert.match(editorStylesSource, /container:\s*\{\s*\.\.\.StyleSheet\.absoluteFillObject,?\s*\}/);
  assert.match(editorStylesSource, /containerClosing:\s*\{\s*elevation: 30/);
  assert.equal(sheetSource.includes('titleInputRef.current.focus()'), false);
  assert.equal(sheetSource.includes("behavior={Platform.OS === 'ios' ? 'padding' : undefined}"), true);
  assert.equal(sheetSource.includes('Keyboard.dismiss();'), true);
  assert.equal(sheetSource.includes('const EDITOR_BACKGROUND_COLOR ='), true);
  assert.equal(sheetSource.includes('<View style={styles.identityCard}>'), true);
  assert.equal(sheetSource.includes('{t.photoOrGif}'), true);
  assert.equal(sheetSource.includes('name="camera-outline"'), true);
  assert.equal(sheetSource.includes('<Text style={styles.mediaActionText}>{t.photoOrGif}</Text>'), false);
  assert.equal(sheetSource.includes('styles.mediaActionsRow'), false);
  assert.equal(sheetSource.includes('allowsEditing: true'), true);
  assert.equal(sheetSource.includes('aspect: [1, 1]'), true);
  assert.equal(sheetSource.includes("shape: 'rectangle'"), true);
  assert.equal(sheetSource.includes('quality: 1'), true);
  assert.equal(sheetSource.includes('pickRandomEmoji'), false);
  assert.equal(sheetSource.includes('handleShuffleEmoji'), false);
  assert.equal(sheetSource.includes('styles.mediaBadge'), false);
  assert.equal(sheetSource.includes('placeholder={t.taskNamePlaceholder}'), true);
  assert.equal(sheetSource.match(/\bt\.newTask\b/g)?.length ?? 0, 1);
  assert.equal(sheetSource.match(/\bt\.taskName\b/g)?.length ?? 0, 1);
  assert.equal(sheetSource.includes('const sheetHeight = height;'), true);
  assert.equal(editorStylesSource.includes('appearanceSection: {'), true);
  assert.equal(editorStylesSource.includes('colorDotOuterSelected: {'), true);

  const partsSource = fs.readFileSync(
    path.join(root, 'components/taskEditor/parts.js'),
    'utf8'
  );
  assert.equal(partsSource.includes('presentationStyle="overFullScreen"'), true);
  assert.equal(partsSource.includes('onRequestClose={() => leave(onClose)}'), true);
  assert.equal(partsSource.includes('Animated.timing(transition'), true);
  assert.equal(partsSource.includes('function SoftPressable'), true);
  assert.equal(partsSource.includes('function InlineInfo'), true);
  assert.equal(partsSource.includes('function AnimatedReveal'), true);
  assert.equal(partsSource.includes('TaskEditorMotionContext'), true);
  assert.equal(sheetSource.includes('<TaskEditorMotionProvider reduceMotion={reduceMotion}>'), true);
  assert.equal(partsSource.includes('styles.floatingInfoBubble'), false);
  assert.equal(partsSource.includes('style={styles.rowTextColumn}'), true);

  const editorHelpSources = [
    sheetSource,
    partsSource,
    fs.readFileSync(path.join(root, 'components/taskEditor/QuantumFields.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'components/taskEditor/SubtasksPanel.js'), 'utf8'),
  ].join('\n');
  assert.equal(editorHelpSources.includes('floatingInfoBubble'), false);
  assert.equal(editorHelpSources.includes('name="information-circle-outline"'), true);
  assert.equal(editorHelpSources.includes("name={isInfoVisible ? 'close' : 'help'}"), false);
  assert.equal(editorHelpSources.includes('styles.infoIconButtonActive'), false);
  assert.equal(editorStylesSource.includes('infoIconButtonActive: {'), false);
  assert.equal(partsSource.includes('outputRange: [32, 0]'), true);
  assert.equal(appSource.includes('const dismissFabMenuImmediately = useCallback'), true);
  assert.equal(appSource.includes('setIsFabMenuMounted(false);'), true);
  assert.equal(
    (appSource.match(/isFabMenuMounted && !isHabitSheetOpen && !reflectionDateKey/g)?.length ?? 0) >= 2,
    true
  );
});

test('recorta icones quadrados e restaura o zoom das fotos ao soltar', () => {
  const taskEditorSource = fs.readFileSync(
    path.join(root, 'components/AddHabitSheet.js'),
    'utf8'
  );
  const reflectionSource = fs.readFileSync(
    path.join(root, 'components/ReflectionSheet.js'),
    'utf8'
  );
  const calendarSource = fs.readFileSync(
    path.join(root, 'components/CustomizeCalendarModal.js'),
    'utf8'
  );
  const zoomSource = fs.readFileSync(
    path.join(root, 'components/PinchToZoomImage.js'),
    'utf8'
  );
  const feedSource = fs.readFileSync(
    path.join(root, 'components/ReflectionFeed.js'),
    'utf8'
  );
  const reportSource = fs.readFileSync(
    path.join(root, 'components/DayReportModal.js'),
    'utf8'
  );

  assert.equal(taskEditorSource.includes('allowsEditing: true'), true);
  assert.equal(taskEditorSource.includes('aspect: [1, 1]'), true);
  assert.equal(reflectionSource.includes('cropSquare: true'), true);
  assert.equal(reflectionSource.includes("aspect: [1, 1], shape: 'rectangle'"), true);
  assert.equal(calendarSource.includes('allowsEditing: false'), true);
  assert.equal(zoomSource.includes('PanResponder.create({'), true);
  assert.equal(zoomSource.includes('Math.min(MAX_SCALE'), true);
  assert.equal(zoomSource.includes('focalOffsetX'), true);
  assert.equal(zoomSource.includes('(1 - nextScale) * gesture.focalOffsetX'), true);
  assert.equal(zoomSource.includes('nextPageX - gesture.pinchStartPageX'), true);
  assert.equal(zoomSource.includes('PINCH_SMOOTHING'), true);
  assert.equal(zoomSource.includes('scale.stopAnimation();'), true);
  assert.equal(zoomSource.includes('overshootClamping: true'), true);
  assert.equal(zoomSource.includes('Animated.parallel(['), true);
  assert.equal(zoomSource.includes('toValue: 1'), true);
  assert.equal(zoomSource.includes('toValue: 0'), true);
  assert.equal(zoomSource.includes('onPanResponderRelease:'), true);
  assert.equal(feedSource.includes('<PinchToZoomImage'), true);
  assert.equal(reportSource.includes('<PinchToZoomImage'), true);
});

test('encerra animacoes decorativas e respeita reduzir movimento', () => {
  const taskCardSource = fs.readFileSync(
    path.join(root, 'components/SwipeableTaskCard.js'),
    'utf8'
  );
  const reportSource = fs.readFileSync(
    path.join(root, 'components/DayReportModal.js'),
    'utf8'
  );

  assert.equal(taskCardSource.includes('Animated.loop('), true);
  assert.equal(taskCardSource.includes('!isVisible || reduceMotion'), true);
  assert.equal(taskCardSource.includes('waveShiftAnim.addListener'), false);
  assert.equal(taskCardSource.includes('task.quantum?.wavePulse'), true);
  assert.equal(reportSource.includes('progressAnim.stopAnimation();'), true);
  assert.equal(reportSource.includes('if (reduceMotion) {'), true);
});

test('preserva a posicao visual quando uma reordenacao interrompe outra', () => {
  assert.equal(
    getInterruptedTaskReorderOffset({ previousY: 0, currentOffset: 0, nextY: 300 }),
    -300
  );
  assert.equal(
    getInterruptedTaskReorderOffset({
      previousY: 300,
      currentOffset: -180,
      nextY: 0,
    }),
    120
  );
  assert.equal(
    getInterruptedTaskReorderOffset({ previousY: NaN, currentOffset: 12, nextY: 4 }),
    8
  );
});

test('anima o painel quantum e reordena cards sem saltos interrompidos', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const taskCardSource = fs.readFileSync(
    path.join(root, 'components/SwipeableTaskCard.js'),
    'utf8'
  );

  assert.equal(appSource.includes('useLayoutEffect(() => {'), true);
  assert.equal(appSource.includes('taskPositionsRef'), true);
  assert.equal(appSource.includes('visibleTaskStateCacheRef'), true);
  assert.equal(appSource.includes('translateY.stopAnimation((currentOffset) =>'), true);
  assert.equal(appSource.includes('getInterruptedTaskReorderOffset({'), true);
  assert.equal(appSource.includes('duration: TODAY_TASK_REORDER_MS'), true);
  assert.equal(appSource.includes('easing: Easing.out(Easing.cubic)'), true);
  assert.equal(appSource.includes('TODAY_TASK_REORDER_DELAY_MS'), false);
  assert.equal(appSource.includes('zIndex: item.completed ? 0 : 1'), true);
  assert.equal(appSource.includes('CellRendererComponent={renderTodayCell}'), true);
  assert.equal(appSource.includes('previousPosition.index === index'), true);
  assert.equal(appSource.includes('handleTaskLayout(item.id, index, event)'), true);
  assert.equal(taskCardSource.includes('Animated.timing(adjustPanelProgress'), true);
  assert.equal(taskCardSource.includes('hasMeasuredCollapsedCardRef'), true);
  assert.equal(taskCardSource.includes('const waterRenderHeight = cardSize.height + QUANTUM_STEPPER_EXPANSION'), true);
  assert.equal(taskCardSource.includes('height: waterRenderHeight'), true);
  assert.equal(taskCardSource.includes('transform: [{ translateY: waterTranslateY }]'), true);
  assert.equal(taskCardSource.includes('QUANTUM_STEPPER_OPEN_MS = 320'), true);
  assert.equal(taskCardSource.includes('QUANTUM_STEPPER_CLOSE_MS = 280'), true);
  assert.equal(taskCardSource.includes("pointerEvents={isAdjustOpen ? 'auto' : 'none'}"), true);
  assert.equal(taskCardSource.includes('outputRange: [0, QUANTUM_STEPPER_HEIGHT]'), true);
});

test('migra formatos antigos de tarefa ao abrir o editor', () => {
  const today = new Date(2026, 7, 19);

  const weekend = draftFromTask(
    { title: 'x', startDate: today, repeat: { option: 'weekend' } },
    { today }
  );
  assert.equal(weekend.repeat.enabled, true);
  assert.equal(weekend.repeat.frequency, 'weekly');
  assert.deepEqual(weekend.repeat.weekdays, ['sun', 'sat']);

  const desligado = draftFromTask(
    { title: 'x', startDate: today, repeat: { option: 'off' } },
    { today }
  );
  assert.equal(desligado.repeat.enabled, false);

  // O typo 'defaut' e o timer gravado como minutes/seconds continuam legiveis.
  const meta = draftFromTask(
    {
      title: 'y',
      type: 'quantum',
      quantum: { mode: 'timer', animation: 'defaut', timer: { minutes: 2, seconds: 30 } },
    },
    { today }
  );
  assert.equal(meta.quantum.animation, 'default');
  assert.equal(meta.quantum.timerHours, '2');
  assert.equal(meta.quantum.timerMinutes, '30');

  // Data final anterior ao inicio e dado inconsistente: colapsa no inicio.
  const invertido = draftFromTask(
    {
      title: 'z',
      startDate: today,
      repeat: { enabled: true, frequency: 'daily', endDate: new Date(2026, 6, 1).toISOString() },
    },
    { today }
  );
  assert.equal(invertido.repeat.endDate.getTime(), invertido.startDate.getTime());
});

test('converte subtarefas persistidas em titulos antes de exibir', () => {
  const today = new Date(2026, 7, 19);
  const draft = draftFromTask(
    {
      title: 'Rotina',
      subtasks: [
        { id: 'a', title: 'Alongar', completedDates: { '2026-08-18': true } },
        { id: 'b', title: '  ', completedDates: {} },
        { id: 'c', title: 'Beber agua', completedDates: {} },
      ],
    },
    { today }
  );

  // O painel desenha <Text>{item}</Text> e o App reconcilia por titulo, entao o
  // editor precisa entregar texto puro nos dois sentidos.
  assert.deepEqual(draft.subtasks, ['Alongar', 'Beber agua']);
  assert.deepEqual(draftToTask(draft).subtasks, ['Alongar', 'Beber agua']);
  assert.equal(draft.subtasks.every((item) => typeof item === 'string'), true);
});

test('valida o rascunho por campo em vez de um alerta generico', () => {
  const today = new Date(2026, 7, 19);
  let draft = createEmptyDraft({ today });

  assert.equal(getDraftError(validateDraft(draft), 'title').code, 'titleRequired');

  draft = taskDraftReducer(draft, { type: 'setTitle', value: 'Correr' });
  assert.deepEqual(validateDraft(draft), []);

  // Lembrete sem horario marca o campo; nada e desfeito em silencio.
  draft = taskDraftReducer(draft, { type: 'patch', value: { reminder: '15m' } });
  assert.equal(draft.reminder, '15m');
  assert.equal(getDraftError(validateDraft(draft), 'reminder').code, 'reminderNeedsTime');

  draft = taskDraftReducer(draft, { type: 'patchTime', value: { specified: true } });
  assert.deepEqual(validateDraft(draft), []);

  // Meta zerada nao passa.
  draft = taskDraftReducer(draft, { type: 'patch', value: { type: 'quantum' } });
  draft = taskDraftReducer(draft, {
    type: 'patchQuantum',
    value: { mode: 'timer', timerHours: '0', timerMinutes: '0' },
  });
  assert.equal(getDraftError(validateDraft(draft), 'quantum').code, 'invalidTimerTarget');

  draft = taskDraftReducer(draft, { type: 'patchQuantum', value: { timerMinutes: '20' } });
  assert.deepEqual(validateDraft(draft), []);

  // Semana sem nenhum dia marcado tambem e sinalizado.
  draft = taskDraftReducer(draft, {
    type: 'patchRepeat',
    value: { enabled: true, frequency: 'weekly' },
  });
  const semDias = draft.repeat.weekdays.reduce(
    (current, weekday) => taskDraftReducer(current, { type: 'toggleWeekday', value: weekday }),
    draft
  );
  assert.deepEqual(semDias.repeat.weekdays, []);
  assert.equal(getDraftError(validateDraft(semDias), 'repeat').code, 'weekdayRequired');
});

test('mantem as invariantes do rascunho num lugar so', () => {
  const today = new Date(2026, 7, 19);
  let draft = taskDraftReducer(createEmptyDraft({ today }), {
    type: 'setTitle',
    value: 'Ler',
  });

  // Trocar para semanal semeia o dia da data de inicio em vez de ficar vazio.
  draft = taskDraftReducer(draft, {
    type: 'patchRepeat',
    value: { enabled: true, frequency: 'weekly', weekdays: [] },
  });
  assert.deepEqual(draft.repeat.weekdays, ['wed']);

  // Intervalo fora da faixa e limitado, nao aceito e quebrado depois.
  assert.equal(
    taskDraftReducer(draft, { type: 'patchRepeat', value: { interval: 500 } }).repeat.interval,
    99
  );
  assert.equal(
    taskDraftReducer(draft, { type: 'patchRepeat', value: { interval: 0 } }).repeat.interval,
    1
  );

  // Adiar o inicio para depois do fim corrige o fim junto.
  draft = taskDraftReducer(draft, {
    type: 'patchRepeat',
    value: { hasEndDate: true, endDate: new Date(2026, 7, 25) },
  });
  draft = taskDraftReducer(draft, { type: 'setStartDate', value: new Date(2026, 8, 10) });
  assert.equal(draft.repeat.endDate.getTime(), draft.startDate.getTime());

  // Desligar a data final zera o valor guardado.
  draft = taskDraftReducer(draft, { type: 'patchRepeat', value: { hasEndDate: false } });
  assert.equal(draft.repeat.endDate, null);

  // Campo numerico vazio continua vazio: 0 forcado no meio da digitacao
  // impedia apagar para digitar outro valor.
  const vazio = taskDraftReducer(draft, { type: 'patchQuantum', value: { timerHours: '' } });
  assert.equal(vazio.quantum.timerHours, '');
  assert.equal(
    taskDraftReducer(draft, { type: 'patchQuantum', value: { timerMinutes: '99' } }).quantum
      .timerMinutes,
    '59'
  );
});

test('nao persiste configuracao quantum fora do tipo de meta', () => {
  const today = new Date(2026, 7, 19);
  let draft = taskDraftReducer(createEmptyDraft({ today }), { type: 'setTitle', value: 'Agua' });
  draft = taskDraftReducer(draft, { type: 'patch', value: { type: 'quantum' } });
  draft = taskDraftReducer(draft, {
    type: 'patchQuantum',
    value: { mode: 'count', countValue: '8', countUnit: 'copos' },
  });
  assert.equal(draftToTask(draft).quantum.count.value, 8);

  // Trocar de tipo nao apaga o que foi digitado, mas tambem nao vai para o disco.
  const comoHabito = taskDraftReducer(draft, { type: 'patch', value: { type: 'default' } });
  assert.equal(comoHabito.quantum.countValue, '8');
  assert.equal(draftToTask(comoHabito).quantum, null);
});

test('so persiste rotulo de tag criada pelo usuario', () => {
  const today = new Date(2026, 7, 19);
  const tagOptions = [
    { key: 'workout', label: 'Treino' },
    { key: 'leitura_noturna', label: 'Leitura noturna', isCustom: true },
  ];
  let draft = taskDraftReducer(createEmptyDraft({ today }), { type: 'setTitle', value: 'x' });

  // Tags padrao sao resolvidas pelo idioma atual na exibicao; gravar o texto
  // traduzido congelaria a tarefa no idioma da criacao.
  draft = taskDraftReducer(draft, { type: 'patch', value: { tag: 'workout' } });
  assert.equal(draftToTask(draft, { tagOptions }).tagLabel, undefined);

  draft = taskDraftReducer(draft, { type: 'patch', value: { tag: 'leitura_noturna' } });
  assert.equal(draftToTask(draft, { tagOptions }).tagLabel, 'Leitura noturna');
});

test('empurra o fim do periodo em vez de descartar a escolha', () => {
  const corrigido = ensureValidPeriod({
    start: { hour: 10, minute: 0, meridiem: 'AM' },
    end: { hour: 9, minute: 0, meridiem: 'AM' },
  });
  assert.equal(timeToMinutes(corrigido.end) - timeToMinutes(corrigido.start), 60);

  // Um periodo ja valido nao e mexido.
  const intacto = ensureValidPeriod({
    start: { hour: 9, minute: 0, meridiem: 'AM' },
    end: { hour: 11, minute: 30, meridiem: 'AM' },
  });
  assert.deepEqual(intacto.end, { hour: 11, minute: 30, meridiem: 'AM' });
});

test('projeta a repeticao do calendario com listas em vez de Set', () => {
  const start = new Date(2026, 7, 19); // quarta
  const config = { enabled: true, frequency: 'weekly', interval: 1, weekdays: ['wed'] };

  assert.equal(doesDateRepeat(new Date(2026, 7, 26), start, config), true);
  assert.equal(doesDateRepeat(new Date(2026, 7, 27), start, config), false);
  // Nada antes da data de inicio.
  assert.equal(doesDateRepeat(new Date(2026, 7, 12), start, config), false);
  // A data final fecha a projecao.
  assert.equal(
    doesDateRepeat(new Date(2026, 8, 2), start, { ...config, endDate: new Date(2026, 7, 26) }),
    false
  );
  // Intervalo de duas semanas pula a semana intermediaria.
  const quinzenal = { ...config, interval: 2 };
  assert.equal(doesDateRepeat(new Date(2026, 7, 26), start, quinzenal), false);
  assert.equal(doesDateRepeat(new Date(2026, 8, 2), start, quinzenal), true);
});

test('resolve idioma do editor pela prop, nao comparando texto traduzido', () => {
  const sheetSource = fs.readFileSync(path.join(root, 'components/AddHabitSheet.js'), 'utf8');
  const datePanelSource = fs.readFileSync(
    path.join(root, 'components/taskEditor/DatePanel.js'),
    'utf8'
  );
  const repeatPanelSource = fs.readFileSync(
    path.join(root, 'components/taskEditor/RepeatPanel.js'),
    'utf8'
  );

  // O idioma vinha de comparar um rotulo traduzido com a string 'Hoje', e a
  // lista de dias da semana era uma constante fixa em ingles: o seletor de
  // repeticao ficava em ingles mesmo com o app em portugues.
  for (const source of [sheetSource, datePanelSource, repeatPanelSource]) {
    assert.equal(source.includes("=== 'Hoje'"), false);
    assert.equal(source.includes('WEEKDAYS_EN'), false);
    assert.equal(source.includes('WEEKDAYS_PT'), false);
  }

  assert.equal(datePanelSource.includes("language === 'pt' ? 'pt-BR' : 'en-US'"), true);
  assert.equal(datePanelSource.includes('resolvedLabels.weekdayShortLabels?.[weekdayKey]'), true);
  assert.equal(repeatPanelSource.includes('labels.weekdayShortLabels?.[weekdayKey]'), true);
  // O calendario da data final tambem precisa receber o idioma.
  assert.equal(repeatPanelSource.includes('language={language}'), true);

  // Os dois idiomas precisam ter os rotulos curtos e longos.
  for (const language of ['en', 'pt']) {
    const labels = translations[language].sheet;
    assert.equal(Object.keys(labels.weekdayShortLabels).length, 7);
    assert.equal(Object.keys(labels.weekdayFullLabels).length, 7);
    assert.equal(typeof labels.weekdayRequiredMessage, 'string');
    assert.equal(typeof labels.monthDayRequiredMessage, 'string');
  }
});

const runTests = async () => {
  let failures = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      console.log(`✓ ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  console.log(`\n${tests.length - failures}/${tests.length} testes passaram.`);
  process.exitCode = failures > 0 ? 1 : 0;
};

void runTests();
