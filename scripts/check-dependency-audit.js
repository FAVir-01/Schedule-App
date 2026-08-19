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

// Metro 0.84.4 (Expo 57/RN 0.86) still depends on image-size@1.2.1, and
// the npm registry has no patched image-size release. These advisories affect
// the local bundler's image parser. Keep the exception pinned to the advisory
// IDs and root dependency so every new high-severity advisory still blocks.
const acceptedUpstreamAdvisories = new Map([
  [1138808, { dependency: 'image-size', reviewAfter: '2026-09-30' }],
  [1138809, { dependency: 'image-size', reviewAfter: '2026-09-30' }],
]);

const rootAdvisories = Object.values(report.vulnerabilities ?? {}).flatMap((vulnerability) =>
  (vulnerability.via ?? [])
    .filter((via) => via && typeof via === 'object')
    .map((via) => ({ owner: vulnerability.name, ...via }))
);
const severeRootAdvisories = rootAdvisories.filter(
  (advisory) => advisory.severity === 'high' || advisory.severity === 'critical'
);
const acceptedSevereAdvisories = severeRootAdvisories.filter((advisory) => {
  const exception = acceptedUpstreamAdvisories.get(advisory.source);
  return exception?.dependency === advisory.dependency;
});
const acceptedSevereSources = new Set(
  acceptedSevereAdvisories.map((advisory) => advisory.source)
);
const blockingAdvisories = severeRootAdvisories.filter(
  (advisory) => !acceptedSevereSources.has(advisory.source)
);

const summary =
  `${counts.total} alertas: ${counts.low} baixos, ${counts.moderate} moderados, ` +
  `${counts.high} altos e ${counts.critical} críticos.`;

if (
  blockingAdvisories.length > 0 ||
  ((counts.high > 0 || counts.critical > 0) && severeRootAdvisories.length === 0)
) {
  console.error(`Auditoria de dependências reprovada — ${summary}`);
  blockingAdvisories.forEach((advisory) => {
    console.error(`- ${advisory.dependency}: ${advisory.title} (${advisory.url})`);
  });
  process.exit(1);
}

if (acceptedSevereSources.size > 0) {
  console.warn(
    `Exceção upstream: advisories ${[...acceptedSevereSources].join(', ')} ` +
      '(image-size via Metro; revisar após 2026-09-30).'
  );
}

console.log(`Auditoria de dependências aprovada — ${summary}`);
