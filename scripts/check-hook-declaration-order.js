// Detecta dependências de hooks avaliadas antes da declaração local. Referências
// dentro do callback podem ser intencionalmente tardias; a lista de dependências,
// porém, é avaliada imediatamente durante a renderização.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = path.resolve(__dirname, '..');
const componentRoot = path.join(root, 'components');
const hookNames = new Set(['useCallback', 'useEffect', 'useLayoutEffect', 'useMemo']);
const files = [
  path.join(root, 'App.js'),
  ...fs
    .readdirSync(componentRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(componentRoot, entry.name)),
];
const errors = [];

files.forEach((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(source, {
    sourceType: 'module',
    plugins: ['jsx'],
  });

  traverse(ast, {
    CallExpression(callPath) {
      const callee = callPath.get('callee');
      if (!callee.isIdentifier() || !hookNames.has(callee.node.name)) {
        return;
      }
      const dependencyPath = callPath.get('arguments.1');
      if (!dependencyPath?.isArrayExpression()) {
        return;
      }

      dependencyPath.traverse({
        ReferencedIdentifier(referencePath) {
          const binding = referencePath.scope.getBinding(referencePath.node.name);
          if (
            !binding ||
            (binding.kind !== 'const' && binding.kind !== 'let') ||
            binding.identifier.start < referencePath.node.start
          ) {
            return;
          }
          errors.push({
            file: path.relative(root, filePath),
            hook: callee.node.name,
            name: referencePath.node.name,
            referenceLine: referencePath.node.loc.start.line,
            declarationLine: binding.identifier.loc.start.line,
          });
        },
      });
    },
  });
});

if (errors.length) {
  console.error('Dependências de hooks usadas antes da declaração:');
  errors.forEach((error) => {
    console.error(
      `- ${error.file}:${error.referenceLine} ${error.hook} usa ${error.name}, ` +
        `declarada na linha ${error.declarationLine}.`
    );
  });
  process.exitCode = 1;
} else {
  console.log(`Ordem de hooks OK em ${files.length} arquivos.`);
}
