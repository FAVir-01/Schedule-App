import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import { getQuantumProgressValues } from '../utils/taskUtils';
import { getDateKeyFromOccurrenceKey } from '../utils/taskTimeUtils';
import { getTimerTotalSeconds } from '../utils/timeUtils';
import { collectMetricRecords, normalizeMetrics } from './metrics';
import { compileMetricFormula, MetricFormulaError, runMetricFormula } from './metricFormula';
import { canonicalMetricReference } from './metricSources';

export const WORKSPACE_PERIODS = ['month', 'previousMonth', 'week', 'last30', 'year', 'all', 'custom'];
export const WORKSPACE_DISPLAYS = ['number', 'line', 'bars', 'table'];
export const WORKSPACE_FIELDS = ['completion', 'subtask', 'count', 'minutes', 'goal', 'subtasksCompleted', 'subtasksTotal'];
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === 'string' ? value.trim().slice(0, 120) : '';
const id = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && normalizeDateValue(value);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const bindingKey = (binding) => JSON.stringify([binding.taskId, binding.field, binding.subtaskId ?? null]);
export const nextReference = (bindings) => {
  const used = new Set(bindings.map((binding) => binding.ref));
  for (let index = 0; index < 1000; index += 1) {
    let remaining = index + 1;
    let name = '';
    while (remaining > 0) { remaining -= 1; name = String.fromCharCode(65 + remaining % 26) + name; remaining = Math.floor(remaining / 26); }
    if (!used.has(name)) return name;
  }
  return `V${bindings.length + 1}`;
};

export const availableMetricFields = (task) => {
  const fields = [{ field: 'completion' }];
  if (task.type === 'quantum' && task.quantum?.mode === 'count') fields.push({ field: 'count' }, { field: 'goal' });
  if (task.type === 'quantum' && task.quantum?.mode === 'timer') fields.push({ field: 'minutes' }, { field: 'goal' });
  if (array(task.subtasks).length) fields.push({ field: 'subtasksCompleted' }, { field: 'subtasksTotal' }, ...task.subtasks.map((subtask) => ({ field: 'subtask', subtaskId: String(subtask.id), subtaskTitle: subtask.title })));
  return fields;
};

export const describeMetricBinding = (binding, tasks, t) => {
  const task = tasks.find((item) => String(item.id) === binding.taskId);
  const subtask = array(task?.subtasks).find((item) => String(item.id) === binding.subtaskId);
  const field = binding.field === 'subtask' ? `${t.fields.subtask}: ${subtask?.title ?? binding.subtaskTitle}` : t.fields[binding.field];
  const unit = binding.field === 'minutes' || (binding.field === 'goal' && task?.quantum?.mode === 'timer') ? t.minutesUnit
    : binding.field === 'count' || binding.field === 'goal' ? task?.quantum?.count?.unit || binding.unit || '' : '';
  return { task, taskTitle: task?.title || binding.taskTitle || t.removed, field, unit, path: `${task?.title || binding.taskTitle || t.removed} → ${field}` };
};

const normalizeBinding = (binding) => {
  if (!binding || !id(binding.taskId) || !/^[A-Z][A-Z0-9_]*(?:\.(?:COUNT|TEMPO|TIME|MINUTES|META|GOAL|SUBTASKS|TOTAL_SUBTASKS|COMPLETED_SUBTASKS|SUBTASKS_TOTAL))?$/i.test(binding.ref ?? '') || !WORKSPACE_FIELDS.includes(binding.field)) return null;
  return { ref: canonicalMetricReference(binding.ref), ...(typeof binding.sourceRef === 'string' && /^[A-F]$/.test(binding.sourceRef) ? { sourceRef: binding.sourceRef } : {}), taskId: id(binding.taskId), field: binding.field,
    subtaskId: binding.field === 'subtask' ? id(binding.subtaskId) : null,
    taskTitle: text(binding.taskTitle), subtaskTitle: text(binding.subtaskTitle), unit: text(binding.unit) };
};

export const normalizeMetricWorkspace = (input) => {
  const legacy = normalizeMetrics(input);
  const seen = new Set();
  const widgets = array(input?.widgets).flatMap((raw) => {
    if (!raw || !id(raw.id) || seen.has(id(raw.id))) return [];
    let widget = raw;
    if (!Array.isArray(raw.bindings)) {
      const source = legacy.sources.find((item) => item.id === id(raw.sourceId));
      if (!source) return [];
      const bindings = [];
      const terms = source.rules.map((rule) => {
        const ref = nextReference(bindings);
        bindings.push({ ref, taskId: rule.taskId, field: rule.subtaskId == null ? 'completion' : 'subtask', subtaskId: rule.subtaskId, taskTitle: rule.taskTitle, subtaskTitle: rule.subtaskTitle });
        return `${ref} * ${rule.value}`;
      });
      const total = terms.join(' + ') || '0';
      const daysWithActions = bindings.map((binding) => binding.ref).join(' + ') || '0';
      const formula = raw.calculation === 'dailyAverage' ? `(${total}) / DAYS()`
        : raw.calculation === 'activeDayAverage' ? `IF(ACTIVE_DAYS(${daysWithActions}) = 0, 0, (${total}) / ACTIVE_DAYS(${daysWithActions}))` : total;
      widget = { ...raw, unit: source.unit, formula, formulaLanguage: 'en', bindings };
    }
    const usedRefs = new Set();
    const bindings = widget.bindings.flatMap((binding) => {
      const normalized = normalizeBinding(binding);
      if (!normalized || usedRefs.has(normalized.ref)) return [];
      usedRefs.add(normalized.ref); return [normalized];
    });
    seen.add(id(widget.id));
    return [{ id: id(widget.id), title: text(widget.title), unit: text(widget.unit),
      formula: typeof widget.formula === 'string' ? widget.formula.slice(0, 500) : '',
      formulaLanguage: widget.formulaLanguage === 'pt' ? 'pt' : 'en', bindings,
      period: WORKSPACE_PERIODS.includes(widget.period) ? widget.period : 'month',
      display: WORKSPACE_DISPLAYS.includes(widget.display) ? widget.display : 'number',
      groupBy: ['auto', 'day', 'month'].includes(widget.groupBy) ? widget.groupBy : 'auto',
      startDate: validDay(widget.startDate) ? widget.startDate : '', endDate: validDay(widget.endDate) ? widget.endDate : '',
    }];
  });
  // Keep the original reusable definitions in backups when migrating an old
  // installation. The editor now exposes each underlying reference directly.
  return { version: 2, sources: legacy.sources, widgets };
};

export const collectBindingValues = (binding, tasks, history = []) => {
  const task = tasks.find((item) => String(item.id) === binding.taskId);
  if (task?.definitionHistory?.length && binding.field !== 'completion') {
    const versions = [...task.definitionHistory.map((item) => ({ ...task, ...item.definition, definitionHistory: [] })), { ...task, definitionHistory: [] }];
    const fields = versions.map((version) => collectBindingValues(binding, [version], history));
    const indexFor = (key) => {
      const index = task.definitionHistory.findIndex((item) => key < item.until);
      return index < 0 ? fields.length - 1 : index;
    };
    const values = new Map();
    fields.forEach((field, index) => field.values.forEach((value, key) => {
      if (indexFor(key) === index) values.set(key, value);
    }));
    return { ...fields[fields.length - 1], values,
      missing: fields.every((field) => field.missing),
      error: fields.every((field) => field.error) ? 'missingField' : null,
      valueForDate: ['goal', 'subtasksTotal'].includes(binding.field)
        ? (key) => fields[indexFor(key)].constant ?? 0 : null,
    };
  }
  const values = new Map();
  // A chave pode vir com o sufixo da ocorrencia: as duas aulas da segunda somam
  // no mesmo dia do grafico.
  const add = (rawKey, value) => { const key = getDateKeyFromOccurrenceKey(rawKey); if (validDay(key)) values.set(key, (values.get(key) ?? 0) + number(value)); };
  const result = { binding, values, constant: null, missing: false, error: null };
  if (binding.field === 'completion' || binding.field === 'subtask') {
    const records = collectMetricRecords({ rules: [{ ...binding, subtaskId: binding.field === 'subtask' ? binding.subtaskId : null, value: 1 }] }, tasks, history);
    records.records.forEach((record) => add(record.dateKey, 1));
    result.missing = records.missingRules.length > 0;
    return result;
  }
  if (!task) return { ...result, missing: true, error: 'missingField' };
  if (binding.field === 'subtasksTotal') return { ...result, constant: array(task.subtasks).length };
  if (binding.field === 'subtasksCompleted') {
    array(task.subtasks).forEach((subtask) => Object.entries(subtask.completedDates ?? {}).forEach(([key, completed]) => { if (completed === true) add(key, 1); }));
    return result;
  }
  if (task.type !== 'quantum' || !task.quantum || (binding.field === 'count' && task.quantum.mode !== 'count') || (binding.field === 'minutes' && task.quantum.mode !== 'timer')) return { ...result, error: 'missingField' };
  if (binding.field === 'goal') return { ...result, constant: task.quantum.mode === 'timer' ? getTimerTotalSeconds(task.quantum.timer) / 60 : number(task.quantum.count?.value) };
  const keys = new Set([...Object.keys(task.quantum.progressByDate ?? {}), ...Object.keys(task.completedDates ?? {})]);
  keys.forEach((key) => {
    const progress = getQuantumProgressValues(task, key);
    add(key, binding.field === 'minutes' ? progress.doneSeconds / 60 : progress.doneCount);
  });
  return result;
};

export const metricPeriodRange = (widget, today, collected = []) => {
  const now = normalizeDateValue(today) ?? normalizeDateValue(new Date());
  let start = new Date(now);
  let end = new Date(now);
  switch (widget.period) {
    case 'previousMonth': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break;
    case 'week': start.setDate(now.getDate() - (now.getDay() + 6) % 7); break;
    case 'last30': start.setDate(now.getDate() - 29); break;
    case 'year': start = new Date(now.getFullYear(), 0, 1); break;
    case 'all': collected.forEach((field) => field.values.forEach((value, key) => { const date = normalizeDateValue(key); if (value !== 0 && date < start) start = date; })); break;
    case 'custom':
      start = validDay(widget.startDate); end = validDay(widget.endDate);
      if (!start || !end || end < start || start > now) throw new MetricFormulaError('invalidRange');
      if (end > now) end = now;
      break;
    default: start.setDate(1);
  }
  const dateKeys = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (dateKeys.length >= 36600) throw new MetricFormulaError('rangeTooLong');
    dateKeys.push(getDateKey(cursor));
  }
  return { dateKeys, startKey: getDateKey(start), endKey: getDateKey(end) };
};

const scopeFields = (collected, dateKeys) => new Map(collected.map((field) => {
  if (field.valueForDate) {
    const values = new Map(dateKeys.map((key) => [key, field.valueForDate(key)]));
    const distinct = new Set(values.values());
    const constant = distinct.size === 1 ? [...distinct][0] : null;
    return [field.binding.ref, { ...field, constant, values, total: constant ?? [...values.values()].reduce((sum, value) => sum + value, 0) }];
  }
  const values = new Map(dateKeys.filter((key) => field.values.has(key)).map((key) => [key, field.values.get(key)]));
  return [field.binding.ref, { ...field, values, total: field.constant ?? [...values.values()].reduce((sum, value) => sum + value, 0) }];
}));
const attempt = (compiled, fields, dateKeys) => {
  try { return { value: runMetricFormula(compiled, { fields, dateKeys }), error: null }; }
  catch (error) { return { value: null, error: { code: error.code || 'incompleteFormula', detail: error.detail || '' } }; }
};

export const evaluateMetricWidget = (widget, tasks, { today = new Date(), history = [] } = {}) => {
  const collected = widget.bindings.map((binding) => collectBindingValues(binding, tasks, history));
  let range;
  let compiled;
  try {
    range = metricPeriodRange(widget, today, collected);
    compiled = compileMetricFormula(widget.formula, widget.formulaLanguage);
    const missing = compiled.references.find((ref) => !widget.bindings.some((binding) => binding.ref === ref));
    if (missing) throw new MetricFormulaError('unknownReference', missing);
    range = metricPeriodRange(widget, today, collected.filter((field) => compiled.references.includes(field.binding.ref)));
  } catch (error) {
    const fields = range ? scopeFields(collected, range.dateKeys) : new Map();
    const rows = (range?.dateKeys ?? []).map((key) => ({ dateKey: key, values: Object.fromEntries([...fields].map(([ref, field]) => [ref, field.error ? null : field.constant ?? field.values.get(key) ?? 0])) }));
    return { value: null, error: { code: error.code || 'incompleteFormula', detail: error.detail || '' }, fields, rows, buckets: [], usedReferences: [], startKey: range?.startKey ?? '', endKey: range?.endKey ?? '' };
  }
  const fields = scopeFields(collected, range.dateKeys);
  const main = attempt(compiled, fields, range.dateKeys);
  const monthly = widget.groupBy === 'month' || (widget.groupBy !== 'day' && range.dateKeys.length > 45);
  const groups = new Map();
  range.dateKeys.forEach((key) => { const group = monthly ? key.slice(0, 7) : key; if (!groups.has(group)) groups.set(group, []); groups.get(group).push(key); });
  const buckets = [...groups].map(([key, days]) => ({ key, dateKey: days[0], ...attempt(compiled, scopeFields(collected, days), days) }));
  const rows = range.dateKeys.map((key) => ({ dateKey: key, values: Object.fromEntries([...fields].map(([ref, field]) => [ref, field.error ? null : field.constant ?? field.values.get(key) ?? 0])) }));
  return { ...main, ...range, fields, rows, buckets, monthly, usedReferences: compiled.references,
    missing: collected.filter((field) => field.missing && compiled.references.includes(field.binding.ref)),
  };
};
