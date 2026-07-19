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
  getTaskRepeatDisplayLabel,
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
const { translations } = require('../constants/i18n');
const { hasReflectionContent } = require('../utils/moodUtils');
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
  calculatePeriodGoalProgress,
  normalizePeriodGoal,
} = require('../utils/periodGoalUtils');
const { buildLocalPeriodSummary } = require('../utils/localSummaryUtils');
const {
  BACKUP_ERROR_CODES,
  parseAppBackupContents,
} = require('../utils/backupUtils');
const { AppErrorBoundary } = require('../components/AppErrorBoundary');
const { replaceStoredAppData, saveTasks } = require('../storage');

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('normaliza somente metas semanais ou mensais dentro do limite', () => {
  assert.deepEqual(normalizePeriodGoal({ period: 'weekly', target: '3' }), {
    period: 'weekly',
    target: 3,
  });
  assert.deepEqual(normalizePeriodGoal({ period: 'monthly', target: 12 }), {
    period: 'monthly',
    target: 12,
  });
  assert.equal(normalizePeriodGoal({ period: 'daily', target: 1 }), null);
  assert.equal(normalizePeriodGoal({ period: 'weekly', target: 0 }), null);
  assert.equal(normalizePeriodGoal({ period: 'monthly', target: 1000 }), null);
  assert.equal(normalizePeriodGoal({ enabled: false, period: 'weekly', target: 3 }), null);
});

test('calcula meta semanal contra o mesmo ponto da semana anterior', () => {
  const progress = calculatePeriodGoalProgress({
    task: {
      periodGoal: { period: 'weekly', target: 4 },
      completedDates: {
        '2026-07-05': true,
        '2026-07-06': true,
        '2026-07-10': true,
        '2026-07-12': true,
        '2026-07-13': true,
        '2026-07-15': true,
        '2026-07-18': true,
        '2026-07-19': true,
      },
    },
    referenceDate: '2026-07-18',
  });

  assert.equal(progress.completed, 3);
  assert.equal(progress.previousCompleted, 2);
  assert.equal(progress.delta, 1);
  assert.equal(progress.remaining, 1);
  assert.equal(progress.percentage, 75);
  assert.equal(progress.reached, false);
});

test('compara meta mensal respeitando o tamanho do mes anterior', () => {
  const progress = calculatePeriodGoalProgress({
    task: {
      periodGoal: { period: 'monthly', target: 3 },
      completedDates: {
        '2026-02-01': true,
        '2026-02-28': true,
        '2026-03-01': true,
        '2026-03-15': true,
        '2026-03-31': true,
      },
    },
    referenceDate: '2026-03-31',
  });

  assert.equal(progress.completed, 3);
  assert.equal(progress.previousCompleted, 2);
  assert.equal(progress.delta, 1);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.percentage, 100);
  assert.equal(progress.reached, true);
  assert.equal(progress.previousEnd.getDate(), 28);
});

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
    Object.keys(translations.pt.periodGoal).sort(),
    Object.keys(translations.en.periodGoal).sort()
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
