export const SOURCE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const METRIC_PROPERTIES = { count: 'COUNT', minutes: 'TEMPO', goal: 'META', subtasksCompleted: 'SUBTASKS', subtasksTotal: 'TOTAL_SUBTASKS' };
export const canonicalMetricReference = (ref) => ref.toUpperCase().replace(/\.(TIME|MINUTES|GOAL|COMPLETED_SUBTASKS|SUBTASKS_TOTAL)$/, (match, name) => `.${({ TIME: 'TEMPO', MINUTES: 'TEMPO', GOAL: 'META', COMPLETED_SUBTASKS: 'SUBTASKS', SUBTASKS_TOTAL: 'TOTAL_SUBTASKS' })[name]}`);
export const displayMetricReference = (ref) => ref.replace(/\..+$/, (property) => property.toLowerCase());
const rewriteReferences = (formula, mapping) => formula.replace(/[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_0-9]*(?:\.[A-Za-z_]+)?/g, (token, offset, input) => /^\s*\(/.test(input.slice(offset + token.length)) ? token : mapping.get(canonicalMetricReference(token)) || token);
export const sourceOf = (binding) => binding.sourceRef || binding.ref;
export const metricSources = (bindings) => bindings.filter((binding) => sourceOf(binding) === binding.ref);
export const nextSourceLetter = (bindings) => SOURCE_LETTERS.find((ref) => !bindings.some((binding) => sourceOf(binding) === ref)) ?? null;

export function buildMetricSource(task, ref, field = 'completion', previous = []) {
  const base = { sourceRef: ref, taskId: String(task.id), taskTitle: task.title || '', unit: task.quantum?.count?.unit || '' };
  const children = previous.filter((binding) => binding.sourceRef === ref && binding.field === 'subtask');
  const used = new Set(children.map((binding) => binding.ref));
  const bindings = [{ ...base, ref, field, subtaskId: null, subtaskTitle: '' }];
  (task.subtasks ?? []).forEach((subtask, index) => {
    const existing = children.find((binding) => binding.subtaskId === String(subtask.id));
    let subRef = existing?.ref;
    if (!subRef) {
      let ordinal = index + 1;
      while (used.has(`${ref}${ordinal}`)) ordinal += 1;
      subRef = `${ref}${ordinal}`;
      used.add(subRef);
    }
    bindings.push({ ...base, ref: subRef, field: 'subtask', subtaskId: String(subtask.id), subtaskTitle: subtask.title || '' });
  });
  // Keep removed subtask identities reserved so a formula never silently
  // starts reading another subtask after a deletion or reorder.
  children.forEach((binding) => { if (!bindings.some((item) => item.ref === binding.ref)) bindings.push(binding); });
  const fields = [];
  if (task.type === 'quantum') {
    if (task.quantum?.mode === 'count') fields.push('count', 'goal');
    if (task.quantum?.mode === 'timer') fields.push('minutes', 'goal');
  }
  if (task.subtasks?.length) fields.push('subtasksCompleted', 'subtasksTotal');
  fields.forEach((property) => bindings.push({ ...base, ref: `${ref}.${METRIC_PROPERTIES[property]}`, field: property, subtaskId: null, subtaskTitle: '' }));
  previous.filter((binding) => binding.sourceRef === ref && binding.ref.includes('.')).forEach((binding) => {
    if (!bindings.some((item) => item.ref === binding.ref)) bindings.push(binding);
  });
  return bindings;
}

export function prepareMetricSources(widget, tasks) {
  if (widget.bindings.every((binding) => binding.sourceRef)) {
    const mapping = new Map();
    const bindings = metricSources(widget.bindings).flatMap((binding) => {
      const task = tasks.find((item) => String(item.id) === binding.taskId);
      const group = task ? buildMetricSource(task, binding.ref, 'completion', widget.bindings)
        : widget.bindings.filter((item) => item.sourceRef === binding.ref).map((item) => item.ref === binding.ref ? { ...item, field: 'completion' } : item);
      if (METRIC_PROPERTIES[binding.field]) {
        const target = `${binding.ref}.${METRIC_PROPERTIES[binding.field]}`;
        mapping.set(binding.ref, displayMetricReference(target));
        if (!group.some((item) => item.ref === target)) group.push({ ...binding, ref: target });
      }
      return group;
    });
    return { ...widget, bindings, formula: rewriteReferences(widget.formula, mapping) };
  }
  // Old workspaces may exceed the new creation limit. Preserve their data.
  if (widget.bindings.length > SOURCE_LETTERS.length) return widget;
  const mapping = new Map();
  const bindings = widget.bindings.flatMap((binding, index) => {
    const ref = SOURCE_LETTERS[index];
    const task = tasks.find((item) => String(item.id) === binding.taskId) || { id: binding.taskId, title: binding.taskTitle, subtasks: binding.field === 'subtask' ? [{ id: binding.subtaskId, title: binding.subtaskTitle }] : [] };
    const group = buildMetricSource(task, ref);
    let target = group.find((item) => item.field === binding.field && (item.subtaskId ?? null) === (binding.subtaskId ?? null));
    if (!target) {
      target = { ...binding, sourceRef: ref, ref: binding.field === 'subtask' ? `${ref}${group.length}` : `${ref}.${METRIC_PROPERTIES[binding.field]}` };
      group.push(target);
    }
    mapping.set(binding.ref, displayMetricReference(target.ref));
    return group;
  });
  const formula = rewriteReferences(widget.formula, mapping);
  return { ...widget, bindings, formula };
}

const reserved = new Set(('break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof var void while with yield enum await implements interface package private protected public static arguments eval constructor prototype __proto__ sum soma average media min minimo max maximo last ultimo days dias active_days dias_ativos se round arred abs').split(' '));
export function metricNameError(name, widgets = [], currentId) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) || reserved.has(name.toLowerCase()) || /^[A-F]\d*$/i.test(name)) return 'invalidName';
  if (widgets.some((widget) => widget.id !== currentId && widget.title.toLowerCase() === name.toLowerCase())) return 'duplicateName';
  return null;
}
export function suggestMetricName(title, widgets = [], currentId) {
  let base = String(title || 'metric').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 56) || 'metric';
  if (metricNameError(base)) base = `metric_${base}`.slice(0, 56);
  let candidate = base;
  let suffix = 2;
  while (metricNameError(candidate, widgets, currentId)) candidate = `${base}_${suffix++}`;
  return candidate;
}
