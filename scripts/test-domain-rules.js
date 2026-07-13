// Suíte mínima, sem Jest: transpila somente os módulos locais com o Babel que
// já acompanha o toolchain Expo e testa as mesmas funções usadas pelo app.
const assert = require('assert/strict');
const fs = require('fs');
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

const {
  isValidDateRange,
  normalizeDateValue,
  shouldTaskAppearOnDate,
} = require('../utils/dateUtils');
const {
  isValidQuantumDefinition,
  reconcileTaskProgressOnEdit,
  shouldResetTaskProgress,
} = require('../utils/taskUtils');

const tests = [];
const test = (name, run) => tests.push({ name, run });

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

let failures = 0;
tests.forEach(({ name, run }) => {
  try {
    run();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
});

console.log(`\n${tests.length - failures}/${tests.length} testes passaram.`);
process.exitCode = failures > 0 ? 1 : 0;
