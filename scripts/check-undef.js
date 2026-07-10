// Verifica identificadores não declarados (equivalente ao no-undef do ESLint).
// Uso: node scripts/check-undef.js <arquivo1> [arquivo2...]
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const KNOWN_GLOBALS = new Set([
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'require', 'module', 'exports', 'global', 'globalThis', 'process',
  'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Promise', 'Set', 'Map', 'WeakSet', 'WeakMap', 'Symbol', 'Error', 'TypeError',
  'RangeError', 'RegExp', 'Infinity', 'NaN', 'undefined', 'isNaN', 'isFinite',
  'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent',
  'fetch', 'FormData', 'URL', 'URLSearchParams', 'AbortController',
  'requestAnimationFrame', 'cancelAnimationFrame', 'alert', '__DEV__',
  'Intl', 'Proxy', 'Reflect', 'ArrayBuffer', 'Uint8Array', 'structuredClone',
]);

let hasErrors = false;

for (const file of process.argv.slice(2)) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx'],
  });

  const problems = new Map();
  traverse(ast, {
    ReferencedIdentifier(path) {
      const { name } = path.node;
      if (KNOWN_GLOBALS.has(name)) return;
      if (path.scope.hasBinding(name, true)) return;
      if (path.isJSXIdentifier() && /^[a-z]/.test(name)) return; // tags jsx nativas
      const line = path.node.loc ? path.node.loc.start.line : '?';
      if (!problems.has(name)) problems.set(name, []);
      problems.get(name).push(line);
    },
  });

  if (problems.size > 0) {
    hasErrors = true;
    console.log(`\n${file}:`);
    for (const [name, lines] of problems) {
      console.log(`  NÃO DECLARADO: ${name} (linhas ${lines.slice(0, 5).join(', ')}${lines.length > 5 ? '...' : ''})`);
    }
  } else {
    console.log(`${file}: OK`);
  }
}

process.exit(hasErrors ? 1 : 0);
