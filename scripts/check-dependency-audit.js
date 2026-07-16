// Mantém uma barreira automatizada contra vulnerabilidades de maior impacto.
// Alertas moderados continuam visíveis, mas não forçam uma migração de SDK.
const { spawnSync } = require('child_process');

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Execute este verificador por meio de npm run check:dependencies.');
  process.exit(1);
}

const audit = spawnSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
  shell: false,
});

if (audit.error) {
  throw audit.error;
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error(audit.stderr || audit.stdout || 'npm audit não retornou JSON válido.');
  process.exit(1);
}

const counts = report.metadata?.vulnerabilities;
if (!counts) {
  console.error('npm audit não retornou o resumo de vulnerabilidades.');
  process.exit(1);
}

const summary =
  `${counts.total} alertas: ${counts.low} baixos, ${counts.moderate} moderados, ` +
  `${counts.high} altos e ${counts.critical} críticos.`;

if (counts.high > 0 || counts.critical > 0) {
  console.error(`Auditoria de dependências reprovada — ${summary}`);
  process.exit(1);
}

console.log(`Auditoria de dependências aprovada — ${summary}`);
