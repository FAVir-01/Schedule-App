// A small expression language, deliberately independent of JavaScript execution.
// References are totals in ordinary arithmetic; aggregates can also inspect the
// daily values behind expressions such as AVERAGE(A * 5).
import { canonicalMetricReference } from './metricSources';
export class MetricFormulaError extends Error {
  constructor(code, detail = '') { super(code); this.code = code; this.detail = detail; }
}

const aliases = {
  SUM: 'SUM', SOMA: 'SUM', AVERAGE: 'AVERAGE', MEDIA: 'AVERAGE',
  MIN: 'MIN', MINIMO: 'MIN', MAX: 'MAX', MAXIMO: 'MAX',
  LAST: 'LAST', ULTIMO: 'LAST', DAYS: 'DAYS', DIAS: 'DAYS',
  ACTIVE_DAYS: 'ACTIVE_DAYS', DIAS_ATIVOS: 'ACTIVE_DAYS',
  IF: 'IF', SE: 'IF', ROUND: 'ROUND', ARRED: 'ROUND', ABS: 'ABS',
};
const aggregates = new Set(['SUM', 'AVERAGE', 'MIN', 'MAX', 'LAST', 'ACTIVE_DAYS']);

export const compileMetricFormula = (expression, language = 'en') => {
  const input = String(expression ?? '').trim().replace(/^=/, '').replace(/×/g, '*').replace(/[÷]/g, '/').replace(/−/g, '-');
  if (!input) throw new MetricFormulaError('emptyFormula');
  if (input.length > 500) throw new MetricFormulaError('formulaTooLong');
  const tokens = [];
  let offset = 0;
  while (offset < input.length) {
    const rest = input.slice(offset);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { offset += whitespace[0].length; continue; }
    const numeric = rest.match(language === 'pt' ? /^(?:\d+(?:[.,]\d+)?|[.,]\d+)/ : /^(?:\d+(?:\.\d+)?|\.\d+)/);
    const name = rest.match(/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_0-9]*(?:\.(?:count|tempo|time|minutes|meta|goal|subtasks_total|total_subtasks|completed_subtasks|subtasks)\b)?/i);
    const operator = rest.match(/^(>=|<=|<>|!=|==|[+\-*/^%()=<>;,])/);
    const match = numeric || name || operator;
    if (!match) throw new MetricFormulaError('invalidSymbol', rest[0]);
    tokens.push({ type: numeric ? 'number' : name ? 'name' : 'operator', value: numeric ? Number(match[0].replace(',', '.')) : match[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() });
    offset += match[0].length;
  }
  let cursor = 0;
  let depth = 0;
  const peek = () => tokens[cursor]?.value;
  const take = (value) => { if (peek() === value) { cursor += 1; return true; } return false; };
  const requireToken = (value) => { if (!take(value)) throw new MetricFormulaError('expected', value); };
  const refs = new Set();
  const primary = () => {
    depth += 1;
    if (depth > 40) throw new MetricFormulaError('formulaTooLong');
    let node;
    const token = tokens[cursor];
    if (take('(')) { node = comparison(); requireToken(')'); }
    else if (token?.type === 'number') { cursor += 1; node = { type: 'number', value: token.value }; }
    else if (token?.type === 'name') {
      cursor += 1;
      if (take('(')) {
        const name = aliases[token.value];
        if (!name) throw new MetricFormulaError('unknownFunction', token.value);
        const args = [];
        if (!take(')')) {
          do { args.push(comparison()); } while (take(';') || take(','));
          requireToken(')');
        }
        const expected = name === 'DAYS' ? [0, 0] : name === 'IF' ? [3, 3] : name === 'ROUND' ? [1, 2] : ['ABS', 'LAST', 'ACTIVE_DAYS'].includes(name) ? [1, 1] : [1, 30];
        if (args.length < expected[0] || args.length > expected[1]) throw new MetricFormulaError('arguments', token.value);
        node = { type: 'call', name, args };
      } else {
        const name = canonicalMetricReference(token.value);
        refs.add(name); node = { type: 'ref', name };
      }
    } else throw new MetricFormulaError('incompleteFormula');
    depth -= 1;
    if (take('%')) node = { type: 'binary', operator: '/', left: node, right: { type: 'number', value: 100 } };
    return node;
  };
  const power = () => { const left = primary(); return take('^') ? { type: 'binary', operator: '^', left, right: unary() } : left; };
  const unary = () => take('+') ? unary() : take('-') ? { type: 'unary', operand: unary() } : power();
  const chain = (next, operators) => {
    let node = next();
    while (operators.includes(peek())) { const operator = tokens[cursor++].value; node = { type: 'binary', operator, left: node, right: next() }; }
    return node;
  };
  const product = () => chain(unary, ['*', '/']);
  const sum = () => chain(product, ['+', '-']);
  const comparison = () => chain(sum, ['=', '==', '<>', '!=', '>', '<', '>=', '<=']);
  const ast = comparison();
  if (cursor !== tokens.length) throw new MetricFormulaError('invalidSymbol', String(peek()));
  return { ast, references: [...refs] };
};

export const runMetricFormula = (compiled, { fields, dateKeys }) => {
  let work = 0;
  const aggregateCache = new Map();
  const finite = (value) => {
    if (!Number.isFinite(value)) throw new MetricFormulaError('notFinite');
    return value;
  };
  const getField = (name) => {
    const field = fields.get(name);
    if (!field) throw new MetricFormulaError('unknownReference', name);
    if (field.error) throw new MetricFormulaError(field.error, name);
    return field;
  };
  const hasDailyValues = (node) => {
    if (node.type === 'ref') return getField(node.name).constant == null;
    if (node.type === 'unary') return hasDailyValues(node.operand);
    if (node.type === 'binary') return hasDailyValues(node.left) || hasDailyValues(node.right);
    if (node.type === 'call' && !aggregates.has(node.name) && node.name !== 'DAYS') return node.args.some(hasDailyValues);
    return false;
  };
  const evaluate = (node, day = null) => {
    work += 1;
    if (work > 250000) throw new MetricFormulaError('formulaTooLong');
    if (node.type === 'number') return node.value;
    if (node.type === 'ref') {
      const field = getField(node.name);
      return field.constant ?? (day ? field.values.get(day) ?? 0 : field.total);
    }
    if (node.type === 'unary') return -evaluate(node.operand, day);
    if (node.type === 'binary') {
      const left = evaluate(node.left, day);
      const right = evaluate(node.right, day);
      switch (node.operator) {
        case '+': return finite(left + right);
        case '-': return finite(left - right);
        case '*': return finite(left * right);
        case '/': if (right === 0) throw new MetricFormulaError('divisionByZero'); return finite(left / right);
        case '^': return finite(left ** right);
        case '=': case '==': return Number(left === right);
        case '!=': case '<>': return Number(left !== right);
        case '>': return Number(left > right);
        case '<': return Number(left < right);
        case '>=': return Number(left >= right);
        case '<=': return Number(left <= right);
        default: throw new MetricFormulaError('invalidSymbol', node.operator);
      }
    }
    const { name, args } = node;
    if (name === 'IF') return evaluate(args[evaluate(args[0], day) !== 0 ? 1 : 2], day);
    if (name === 'DAYS') return dateKeys.length;
    if (name === 'ABS') return Math.abs(evaluate(args[0], day));
    if (name === 'ROUND') {
      const precision = args[1] ? evaluate(args[1], day) : 0;
      if (!Number.isInteger(precision) || Math.abs(precision) > 12) throw new MetricFormulaError('roundPrecision');
      const scale = 10 ** precision;
      return finite(Math.round(evaluate(args[0], day) * scale) / scale);
    }
    // Aggregate function calls are scalar values. Their arguments may be daily
    // expressions; nested aggregates retain their own meaning and are not repeated.
    if (aggregateCache.has(node)) return aggregateCache.get(node);
    const values = args.flatMap((arg) => hasDailyValues(arg) ? dateKeys.map((key) => evaluate(arg, key)) : [evaluate(arg)]);
    let result;
    if (name === 'SUM') result = finite(values.reduce((total, value) => total + value, 0));
    else if (name === 'AVERAGE') result = values.length ? finite(values.reduce((total, value) => total + value, 0) / values.length) : 0;
    else if (name === 'MIN') result = values.length ? values.reduce((value, next) => Math.min(value, next), Infinity) : 0;
    else if (name === 'MAX') result = values.length ? values.reduce((value, next) => Math.max(value, next), -Infinity) : 0;
    else if (name === 'LAST') result = values.at(-1) ?? 0;
    else if (name === 'ACTIVE_DAYS') result = values.filter((value) => value !== 0).length;
    else throw new MetricFormulaError('unknownFunction', name);
    aggregateCache.set(node, result);
    return result;
  };
  return finite(evaluate(compiled.ast));
};
