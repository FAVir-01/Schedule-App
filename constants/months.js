import { isGifImageUri } from '../utils/imageUtils';

const MONTH_IMAGES = [
  require('../assets/months/jan.gif'),
  require('../assets/months/feb.gif'),
  require('../assets/months/mar.gif'),
  require('../assets/months/apr.gif'),
  require('../assets/months/may.gif'),
  require('../assets/months/jun.gif'),
  require('../assets/months/jul.gif'),
  require('../assets/months/aug.gif'),
  require('../assets/months/sep.gif'),
  require('../assets/months/oct.gif'),
  require('../assets/months/nov.gif'),
  require('../assets/months/dec.gif'),
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
    return reduceMotion && isGifImageUri(customImageUri) ? null : { uri: customImageUri };
  }

  // Todos os fundos mensais empacotados são GIFs. Não os monta quando o
  // sistema solicita menos movimento; os componentes usam a cor estática do mês.
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
