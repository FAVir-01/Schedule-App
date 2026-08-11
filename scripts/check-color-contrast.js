// Verificacao estatica dos pares de cor que sustentam texto e controles do app.
// Os limites seguem WCAG 2.2: 4.5:1 para texto comum e 3:1 para componentes.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const stylesSource = fs.readFileSync(path.join(root, 'styles', 'appStyles.js'), 'utf8');

const parseColor = (value) => {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return {
      red: parseInt(normalized[1] + normalized[1], 16),
      green: parseInt(normalized[2] + normalized[2], 16),
      blue: parseInt(normalized[3] + normalized[3], 16),
      alpha: 1,
    };
  }
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return {
      red: parseInt(normalized.slice(1, 3), 16),
      green: parseInt(normalized.slice(3, 5), 16),
      blue: parseInt(normalized.slice(5, 7), 16),
      alpha: 1,
    };
  }
  const rgba = normalized.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (rgba) {
    return {
      red: Number(rgba[1]),
      green: Number(rgba[2]),
      blue: Number(rgba[3]),
      alpha: rgba[4] == null ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Cor nao suportada: ${value}`);
};

const composite = (foreground, background) => ({
  red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
  green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
  blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
  alpha: 1,
});

const linearize = (channel) => {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
};

const luminance = (color) =>
  0.2126 * linearize(color.red) +
  0.7152 * linearize(color.green) +
  0.0722 * linearize(color.blue);

const contrastRatio = (foregroundValue, backgroundValue) => {
  const background = parseColor(backgroundValue);
  const foreground = composite(parseColor(foregroundValue), background);
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

const getStyleColor = (styleName) => {
  const marker = `\n  ${styleName}: {`;
  const start = stylesSource.indexOf(marker);
  if (start < 0) {
    throw new Error(`Estilo nao encontrado: ${styleName}`);
  }
  const bodyStart = start + marker.length;
  const remainder = stylesSource.slice(bodyStart);
  const nextStyle = remainder.search(/\n\s{2}[A-Za-z0-9_]+:\s*\{/);
  const block = nextStyle < 0 ? remainder : remainder.slice(0, nextStyle);
  const colorMatch = block.match(/\bcolor:\s*['\"]([^'\"]+)['\"]/);
  if (!colorMatch) {
    throw new Error(`Cor de texto nao encontrada em: ${styleName}`);
  }
  return colorMatch[1];
};

const textChecks = [
  // Tela Hoje e componentes compartilhados sobre o fundo principal.
  ['todaySubtitleSuccess', '#f6f6fb'],
  ['todaySubtitleInProgress', '#f6f6fb'],
  ['todayDateEyebrow', '#f6f6fb'],
  ['dayLabel', '#f6f6fb'],
  ['dayNumberTextCompleted', '#d9f2e5'],
  ['emptyState', '#f6f6fb'],
  ['taskToggleStepLabel', '#ffffff'],
  ['calendarWeekdayText', '#f6f6fb'],
  ['calendarWeekdayTextWeekend', '#f6f6fb'],
  ['calendarDayTextPast', '#f6f6fb'],
  ['inactiveColor', '#ffffff'],
  ['fabCardTextOnLight', '#fde047'],

  // Cartoes, relatorio, reflexao e desempenho.
  ['taskTitleCompleted', '#ffffff'],
  ['taskTime', '#ffffff'],
  ['timerWheelItemText', '#ffffff'],
  ['feedPostDate', '#ffffff'],
  ['feedEmptyText', '#f6f6fb'],
  ['reportMoodTags', '#ffffff'],
  ['gaugeLabel', '#ffffff'],
  ['reflectionDate', '#f6f6fb'],
  ['reflectionHint', '#f6f6fb'],
  ['reflectionMoodLabel', '#ffffff'],
  ['perfTitle', '#ffffff'],
  ['perfDeltaTextUp', '#d9f2e5'],
  ['perfDeltaTextDown', '#ffffff'],
  ['perfDateLabel', '#ffffff'],
  ['perfXLabel', '#ffffff'],
  ['perfEmptyText', '#ffffff'],

  // Perfil, configuracoes e atividades.
  ['profileMoodDayLabel', '#f6f6fb'],
  ['profileStatsRangeHint', '#ffffff'],
  ['profileSummaryActionHint', '#ffffff'],
  ['settingsRowHint', '#ffffff'],
  ['activityRowMeta', '#ffffff'],
  ['activityRowTime', '#ffffff'],
  ['activityResultsText', '#f6f6fb'],
  ['profileTaskStreakText', '#fff4e6'],
  ['profileTaskMetaText', '#ffffff'],
  ['profileDetailTime', '#ffffff'],
  ['profileDetailArchivedBadgeText', '#eef0f6'],
  ['profileDetailLabel', '#f7f8fc'],
  ['profileDetailDeleteButtonText', '#ffffff'],
];

const componentChecks = [
  ['contorno de selecao', '#767c8f', '#ffffff'],
  ['contorno de campo', '#767c8f', '#ffffff'],
  ['switch desligado', '#817b96', '#ffffff'],
  ['icone secundario funcional', '#626b78', '#ffffff'],
];

const failures = [];
let checked = 0;
const check = (name, foreground, background, minimum) => {
  checked += 1;
  const ratio = contrastRatio(foreground, background);
  if (ratio + Number.EPSILON < minimum) {
    failures.push({ name, foreground, background, minimum, ratio });
  }
};

textChecks.forEach(([styleName, background]) => {
  check(styleName, getStyleColor(styleName), background, 4.5);
});
componentChecks.forEach(([name, foreground, background]) => {
  check(name, foreground, background, 3);
});

if (failures.length) {
  console.error('Falhas de contraste:');
  failures.forEach(({ name, foreground, background, minimum, ratio }) => {
    console.error(
      `- ${name}: ${foreground} sobre ${background} = ${ratio.toFixed(2)}:1 (minimo ${minimum}:1)`
    );
  });
  process.exitCode = 1;
} else {
  console.log(`Contraste OK em ${checked} pares de texto e controles.`);
}
