import { isGifImageUri } from '../utils/imageUtils';

const MONTH_IMAGES = [
  require('../assets/months/static/jan.webp'),
  require('../assets/months/static/feb.webp'),
  require('../assets/months/static/mar.webp'),
  require('../assets/months/static/apr.webp'),
  require('../assets/months/static/may.webp'),
  require('../assets/months/static/jun.webp'),
  require('../assets/months/static/jul.webp'),
  require('../assets/months/static/aug.webp'),
  require('../assets/months/static/sep.webp'),
  require('../assets/months/static/oct.webp'),
  require('../assets/months/static/nov.webp'),
  require('../assets/months/static/dec.webp'),
];

const MONTH_REDUCED_MOTION_COLORS = [
  '#3f5f7d',
  '#6f4f73',
  '#456b5b',
  '#80566a',
  '#5f7046',
  '#665985',
  '#356779',
  '#79583e',
  '#66577d',
  '#704c3d',
  '#505f76',
  '#405d73',
];

const MONTH_NAMES = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

const normalizeMonthIndex = (monthIndex) => {
  const numericIndex = Number.isFinite(Number(monthIndex)) ? Number(monthIndex) : 0;
  return ((Math.trunc(numericIndex) % 12) + 12) % 12;
};

const getMonthReducedMotionColor = (monthIndex) =>
  MONTH_REDUCED_MOTION_COLORS[normalizeMonthIndex(monthIndex)];

const getMonthImageSource = (monthIndex, customImages, { reduceMotion = false } = {}) => {
  const index = normalizeMonthIndex(monthIndex);
  const customImageUri = customImages?.[index];

  if (customImageUri) {
    // Fresco pode manter centenas de quadros decodificados no heap nativo.
    // Imagens personalizadas animadas antigas usam a cor de fallback até serem substituídas.
    return isGifImageUri(customImageUri) ? null : { uri: customImageUri };
  }

  // Os previews empacotados são o primeiro quadro dos GIFs antigos. Isso evita
  // decodificar várias animações simultaneamente nas listas do calendário.
  if (reduceMotion) {
    return null;
  }
  return MONTH_IMAGES[index];
};

export {
  MONTH_IMAGES,
  MONTH_NAMES,
  MONTH_REDUCED_MOTION_COLORS,
  getMonthImageSource,
  getMonthReducedMotionColor,
};
