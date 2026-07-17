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
  return originalModuleLoader.call(this, request, parent, isMain);
};

const {
  isValidDateRange,
  normalizeDateValue,
  shouldTaskAppearOnDate,
} = require('../utils/dateUtils');
const {
  getTaskRepeatDisplayLabel,
  getTaskTagDisplayLabel,
  getTaskTypeDisplayLabel,
  isValidQuantumDefinition,
  reconcileTaskProgressOnEdit,
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
  pruneSelectedTaskIds,
} = require('../utils/historyUtils');
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
const { AppErrorBoundary } = require('../components/AppErrorBoundary');

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('traduz rotulos de tarefa pela chave semantica atual', () => {
  assert.equal(
    getTaskTagDisplayLabel(
      { tag: 'workout', tagLabel: 'Workout' },
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
    Object.keys(translations.pt.developer).sort(),
    Object.keys(translations.en.developer).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.profile).sort(),
    Object.keys(translations.en.profile).sort()
  );
  assert.deepEqual(
    Object.keys(translations.pt.sheet).sort(),
    Object.keys(translations.en.sheet).sort()
  );
  assert.equal(translations.pt.taskCard.copy, 'Copiar');
  assert.equal(translations.pt.sheet.interval, 'Intervalo');
  assert.equal(translations.pt.sheet.endDate, 'Data final');
  assert.equal(translations.pt.sheet.goBack, 'Voltar');
  assert.equal(translations.pt.sheet.timerHoursAccessibility, 'Horas do temporizador');
  assert.equal(translations.pt.common.closeAddMenuHint, 'Toque para fechar as opções de adição');
  assert.equal(translations.pt.fab.addReflectionIllustration, 'Ilustração para adicionar uma reflexão');
  assert.equal(translations.pt.profile.showBarChart, 'Mostrar gráfico de barras');
  assert.equal(translations.pt.profile.periodAll, 'Todo o histórico disponível');
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
