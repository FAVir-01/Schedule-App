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

const getMonthImageSource = (monthIndex, customImages) => {
  const index = monthIndex % 12;

  if (customImages && customImages[index]) {
    return { uri: customImages[index] };
  }

  return MONTH_IMAGES[index];
};

export { MONTH_IMAGES, MONTH_NAMES, getMonthImageSource };
