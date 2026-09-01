const buildWavePath = ({ width, height, amplitude, phase }) => {
  if (!width || !height) {
    return '';
  }
  const points = 24;
  const step = width / points;
  const center = height * 0.5;
  let path = `M 0 ${center}`;
  for (let i = 0; i <= points; i += 1) {
    const x = step * i;
    const theta = (i / points) * Math.PI * 2 + phase;
    const y = center + Math.sin(theta) * amplitude;
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  path += ` L ${width} ${height}`;
  path += ` L 0 ${height} Z`;
  return path;
};

// Mesmo com progresso zero, uma lâmina baixa deixa claro que o estilo "água"
// está ativo. O restante da altura continua representando o progresso real.
const WATER_IDLE_FILL_PERCENT = 0.16;
const WATER_WAVE_MIN_FILL_HEIGHT = 19;
const WATER_WAVE_AMPLITUDE = 4;
const WATER_WAVE_DURATION_MS = 4500;
const WATER_GRADIENT_TOP_COLOR = 'rgb(153, 199, 252)';
const WATER_GRADIENT_BOTTOM_COLOR = 'rgb(100, 158, 248)';

const getWaterDisplayPercent = (progress) => {
  const numericProgress = Number(progress);
  const normalizedProgress = Number.isFinite(numericProgress)
    ? Math.min(1, Math.max(0, numericProgress))
    : 0;
  return WATER_IDLE_FILL_PERCENT
    + normalizedProgress * (1 - WATER_IDLE_FILL_PERCENT);
};

// Onda periódica "repetível": sen(x) completa ciclos inteiros a cada `wavelength`,
// então transladar o SVG em exatamente 1 wavelength faz loop perfeito sem emenda.
const buildRepeatingWavePath = ({ totalWidth, wavelength, height, amplitude, phase = 0 }) => {
  if (!totalWidth || !wavelength || !height) {
    return '';
  }
  const points = Math.max(24, Math.ceil((totalWidth / wavelength) * 24));
  const step = totalWidth / points;
  const center = amplitude + 3;
  let path = `M 0 ${center.toFixed(2)}`;
  for (let i = 0; i <= points; i += 1) {
    const x = step * i;
    const theta = (x / wavelength) * Math.PI * 2 + phase;
    const y = center + Math.sin(theta) * amplitude;
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  path += ` L ${totalWidth.toFixed(2)} ${height} L 0 ${height} Z`;
  return path;
};

export {
  buildRepeatingWavePath,
  buildWavePath,
  getWaterDisplayPercent,
  WATER_GRADIENT_BOTTOM_COLOR,
  WATER_GRADIENT_TOP_COLOR,
  WATER_IDLE_FILL_PERCENT,
  WATER_WAVE_AMPLITUDE,
  WATER_WAVE_DURATION_MS,
  WATER_WAVE_MIN_FILL_HEIGHT,
};
