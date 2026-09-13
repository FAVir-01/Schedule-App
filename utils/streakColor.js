// Cor da sequencia: esquenta do laranja de brasa ate o roxo escuro.
//
// A sequencia nasce laranja (a cor que o app sempre usou) e, dia a dia, vai
// virando roxo: aos 60 dias esta no roxo escuro e para ali. A mudanca e
// continua — nao ha degraus nem marcos — entao dois dias seguidos ficam quase
// iguais e a diferenca so aparece olhando semanas de distancia.
//
// Todo lugar que mostra a sequencia (anel do card, numero por baixo, chama e
// contador da tela de detalhe e do perfil) le a paleta daqui, com o mesmo
// `streak`, para a cor ser uma so em todas as telas.
//
// A mistura e em HSL, girando o matiz pelo arco curto (laranja -> vermelho ->
// magenta -> violeta -> roxo). Misturar em RGB atravessa um marrom sujo no
// meio do caminho; assim a brasa vai ficando mais quente ate virar roxo.

import { hexToRgb } from './colorUtils';

export const STREAK_COLOR_DAYS = 60; // dias ate chegar ao roxo escuro

const EMBER = {
  ringStart: '#D9551A',
  ringMid: '#FFA93F',
  ringEnd: '#FFD89A',
  digit: '#D8712C',
  accent: '#F2732E', // chama e texto da tela de detalhe
  deep: '#B63D00', // chama e contador do perfil
  badge: '#FFF4E6', // fundo do selo no perfil
};

const VIOLET = {
  ringStart: '#2E1B85',
  ringMid: '#5A43C9',
  ringEnd: '#B9A8F5',
  digit: '#3C2BA7',
  accent: '#3C2BA7',
  deep: '#2E1B85',
  badge: '#ECE8FB',
};

const KEYS = Object.keys(EMBER);

const rgbToHsl = ({ r, g, b }) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: light };
  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: sat, l: light };
};

const hslToHex = ({ h, s, l }) => {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  let rgb;
  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return `#${rgb
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
};

const mixHsl = (fromHex, toHex, ratio) => {
  const from = rgbToHsl(hexToRgb(fromHex));
  const to = rgbToHsl(hexToRgb(toHex));
  // Arco curto do matiz: de 25 (laranja) a 250 (roxo) desce por 0/360.
  let deltaHue = to.h - from.h;
  if (deltaHue > 180) deltaHue -= 360;
  if (deltaHue < -180) deltaHue += 360;
  const hue = (from.h + deltaHue * ratio + 360) % 360;
  return hslToHex({
    h: hue,
    s: from.s + (to.s - from.s) * ratio,
    l: from.l + (to.l - from.l) * ratio,
  });
};

// 0 no primeiro dia, 1 a partir do sexagesimo.
export const getStreakColorProgress = (streak) => {
  const days = Number(streak) || 0;
  if (days <= 1) return 0;
  return Math.min(1, (days - 1) / (STREAK_COLOR_DAYS - 1));
};

export const getStreakPalette = (streak) => {
  const ratio = getStreakColorProgress(streak);
  if (ratio <= 0) return EMBER;
  if (ratio >= 1) return VIOLET;
  const palette = {};
  KEYS.forEach((key) => {
    palette[key] = mixHsl(EMBER[key], VIOLET[key], ratio);
  });
  return palette;
};
