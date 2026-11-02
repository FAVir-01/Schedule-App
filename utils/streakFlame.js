// Chama da sequencia: cresce em degraus, a cor anda junto com o anel.
//
// A FORMA sobe de nivel nos marcos (1, 7, 14, 30, 60, 100 dias): a chama
// ganha altura, uma camada de dentro, linguas laterais e brasas. A COR nao
// tem degraus — vem de getStreakPalette, a mesma paleta continua do anel e
// do numero, entao a chama do dia 20 tem exatamente o tom do anel do dia 20.
// So o ultimo nivel foge da paleta: o miolo fica azul-gelo, a chama mais
// quente, um premio que o anel (parado no roxo desde o dia 60) nao tem.
//
// Tudo num quadro 24x24 com a base em y=22.5: o mesmo tamanho dos icones que
// a chama substitui. Os caminhos sao gerados aqui para o desenho ficar
// testavel em Node, sem SVG.

export const STREAK_FLAME_LEVELS = [1, 7, 14, 30, 60, 100];
export const STREAK_FLAME_BOX = 24;
const BASE = 22.5;

export const getStreakFlameLevel = (streak) => {
  const days = Number(streak) || 0;
  let level = 0;
  STREAK_FLAME_LEVELS.forEach((min, index) => {
    if (days >= min) level = index + 1;
  });
  return level;
};

const round = (value) => Math.round(value * 100) / 100;

// Lingua de fogo: ponta torta em `top`, barriga redonda embaixo e um ombro
// do lado contrario ao da ponta — e o ombro que faz a gota virar chama.
// `lean` empurra a ponta para o lado, como o vento dobra uma lingua.
export const flamePath = ({ cx = 12, height, width, bottom = BASE, lean = 0 }) => {
  const top = bottom - height;
  const half = width / 2;
  const tip = cx + lean;
  // O ombro fica do lado oposto ao da ponta; sem inclinacao, a esquerda.
  const side = lean > 0 ? -1 : 1;
  const x = (offset) => cx + side * offset;
  const y = (ratio) => top + height * ratio;
  const p = (px, py) => `${round(px)},${round(py)}`;
  return [
    `M${p(tip, top)}`,
    // Lado liso: desce da ponta direto para a barriga.
    `C${p(tip + side * half * 0.3, y(0.22))} ${p(x(half * 1.02), y(0.4))} ${p(x(half), y(0.66))}`,
    `C${p(x(half), y(0.88))} ${p(x(half * 0.56), bottom)} ${p(cx, bottom)}`,
    `C${p(x(-half * 0.56), bottom)} ${p(x(-half), y(0.88))} ${p(x(-half), y(0.66))}`,
    // Lado do ombro: sobe, faz a curva para dentro e so entao chega na ponta.
    `C${p(x(-half), y(0.48))} ${p(x(-half * 0.62), y(0.44))} ${p(x(-half * 0.5), y(0.32))}`,
    `C${p(x(-half * 0.4), y(0.2))} ${p(tip - side * half * 0.12, y(0.1))} ${p(tip, top)}`,
    'Z',
  ].join('');
};

// Cada nivel acrescenta, nunca tira: quem sobe ve a chama de antes crescer.
const LEVEL_SHAPES = [
  null,
  { outer: [12, 9.5], inner: null, core: [5.6, 3.6], tongues: [], embers: [] },
  { outer: [15, 10.5], inner: [10, 7], core: [5.2, 3.4], tongues: [], embers: [] },
  {
    outer: [16.5, 11], inner: [11, 7.2], core: [5.4, 3.4],
    tongues: [{ cx: 7.8, height: 9.5, width: 5, lean: -1.4 }],
    embers: [],
  },
  {
    outer: [18, 11.4], inner: [12, 7.4], core: [5.8, 3.6],
    tongues: [
      { cx: 7.6, height: 10.5, width: 5.2, lean: -1.5 },
      { cx: 16.4, height: 9, width: 4.8, lean: 1.3 },
    ],
    embers: [],
  },
  {
    outer: [19.5, 12], inner: [13, 7.8], core: [6.2, 3.8],
    tongues: [
      { cx: 7.4, height: 12, width: 5.4, lean: -1.6 },
      { cx: 16.6, height: 10.5, width: 5, lean: 1.5 },
    ],
    embers: [{ cx: 5.2, cy: 6.4, r: 0.9 }, { cx: 18.6, cy: 8.2, r: 0.75 }],
  },
  {
    outer: [21, 12.6], inner: [14.5, 8.2], core: [7.4, 4.4],
    tongues: [
      { cx: 7.2, height: 13.5, width: 5.6, lean: -1.7 },
      { cx: 16.8, height: 12, width: 5.2, lean: 1.6 },
    ],
    embers: [
      { cx: 4.6, cy: 5.2, r: 1 },
      { cx: 19.4, cy: 6.8, r: 0.85 },
      { cx: 16.2, cy: 2.6, r: 0.6 },
    ],
  },
];

export const getStreakFlameShape = (level) => {
  const shape = LEVEL_SHAPES[Math.max(1, Math.min(LEVEL_SHAPES.length - 1, level || 1))];
  const drop = (pair, lean = 0) =>
    pair ? flamePath({ height: pair[0], width: pair[1], lean }) : null;
  return {
    outer: drop(shape.outer, 1.4),
    inner: drop(shape.inner, 0.8),
    core: drop(shape.core, 0.3),
    tongues: shape.tongues.map(flamePath),
    embers: shape.embers,
  };
};

// Miolo azul-gelo do ultimo nivel.
const ICE = { inner: '#A9C4FF', core: '#E2F7FF' };

// Cada camada e um degrade vertical, escuro em cima e claro na base, como na
// referencia. O tom mais escuro da paleta fica so no contorno: no roxo do
// dia 60 ele e quase preto e apagaria a chama.
export const getStreakFlameColors = (palette, level, darken) => {
  const iced = level >= STREAK_FLAME_LEVELS.length;
  const inner = iced ? ICE.inner : palette.ringEnd;
  return {
    outline: darken(palette.ringStart, 0.18),
    outer: [palette.ringStart, palette.ringMid, palette.ringMid],
    inner: [palette.ringMid, palette.ringEnd, inner],
    core: [palette.ringEnd, inner, iced ? ICE.core : palette.flameCore],
    ember: palette.ringMid,
  };
};

// Ritmos da referencia: a chama respira, balanca, a lingua de dentro lambe e
// o miolo pulsa. Periodos diferentes para nunca repetirem em fase.
export const STREAK_FLAME_MOTION = {
  breathe: { period: 2600, scaleX: 1.025, scaleY: 1.06 },
  sway: { period: 1900, skew: [-3.5, 3] },
  lick: { period: 1300, scaleX: 0.97, scaleY: 1.07 },
  pulse: { period: 900, from: [0.94, 0.92], to: [1.04, 1.1] },
};
