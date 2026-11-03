// Chama da sequencia: cresce em degraus, a cor anda junto com o anel.
//
// O desenho segue a referencia: uma gota so, barriga redonda, ponta puxada
// para a direita, contorno escuro e camadas aninhadas por dentro, todas
// apoiadas na mesma base. Nada salta para fora — a chama sobe de nivel
// crescendo e ganhando camadas nos marcos (1, 7, 14, 30, 60, 100 dias).
//
// A COR nao tem degraus: vem de getStreakPalette, a paleta continua do anel e
// do numero, entao a chama do dia 20 tem o tom do anel do dia 20. So o ultimo
// nivel foge dela: o miolo fica azul-gelo, um premio que o anel (parado no
// roxo desde o dia 60) nao tem.
//
// Quadro 24x24, o tamanho dos icones que a chama substitui. A base fica em
// y=21.2 com folga para o contorno e para a chama respirar sem passar do
// quadro. Os caminhos sao gerados aqui para ficarem testaveis em Node.

export const STREAK_FLAME_LEVELS = [1, 7, 14, 30, 60, 100];
export const STREAK_FLAME_BOX = 24;
const BASE = 21.2;
const CENTER_X = 12;
// O movimento gira e estica a partir da base: a chama nunca cresce para baixo.
export const STREAK_FLAME_ORIGIN = `50% ${Math.round((BASE / STREAK_FLAME_BOX) * 1000) / 10}%`;
export const STREAK_FLAME_OUTLINE = 1.7;

export const getStreakFlameLevel = (streak) => {
  const days = Number(streak) || 0;
  let level = 0;
  STREAK_FLAME_LEVELS.forEach((min, index) => {
    if (days >= min) level = index + 1;
  });
  return level;
};

const round = (value) => Math.round(value * 100) / 100;

// Silhueta medida na chama da referencia, em fracoes da propria caixa: x de
// -0.5 a 0.5 a partir do centro, y de 0 (ponta) a 1 (base). A ponta fica a um
// quarto da largura para a direita; o lado direito desce quase reto ate a
// barriga, o esquerdo abaula.
const SILHOUETTE = [
  [0.26, 0],
  [[0.27, 0.3], [0.49, 0.45], [0.5, 0.68]],
  [[0.52, 0.92], [0.25, 1], [0, 1]],
  [[-0.3, 1], [-0.5, 0.86], [-0.5, 0.62]],
  [[-0.5, 0.42], [-0.05, 0.25], [0.26, 0]],
];

export const flamePath = ({ height, width, bottom = BASE, cx = CENTER_X }) => {
  const top = bottom - height;
  const p = ([x, y]) => `${round(cx + x * width)},${round(top + y * height)}`;
  const [start, ...curves] = SILHOUETTE;
  return `M${p(start)}${curves.map((curve) => `C${curve.map(p).join(' ')}`).join('')}Z`;
};

// Camadas de dentro, como na referencia: cada uma mais baixa, mais estreita e
// um pouco acima da base da anterior. [altura, largura, quanto sobe a base]
// em fracoes da camada de fora.
const LAYERS = {
  mid: [0.83, 0.82, 0.066],
  inner: [0.6, 0.62, 0.12],
  core: [0.36, 0.4, 0.16],
};

// Cada nivel so acrescenta: quem sobe ve a mesma chama crescer.
const LEVEL_SHAPES = [
  null,
  { height: 13, width: 10, layers: ['core'], glow: false },
  { height: 15, width: 11.2, layers: ['mid', 'core'], glow: false },
  { height: 16.6, width: 12, layers: ['mid', 'inner', 'core'], glow: false },
  { height: 18, width: 12.8, layers: ['mid', 'inner', 'core'], glow: false },
  { height: 18.6, width: 13.4, layers: ['mid', 'inner', 'core'], glow: true },
  { height: 19, width: 13.8, layers: ['mid', 'inner', 'core'], glow: true },
];

export const getStreakFlameShape = (level) => {
  const shape = LEVEL_SHAPES[Math.max(1, Math.min(LEVEL_SHAPES.length - 1, level || 1))];
  const layer = (name) => {
    if (!shape.layers.includes(name)) return null;
    const [height, width, lift] = LAYERS[name];
    return flamePath({
      height: shape.height * height,
      width: shape.width * width,
      bottom: BASE - shape.height * lift,
    });
  };
  return {
    outer: flamePath(shape),
    mid: layer('mid'),
    inner: layer('inner'),
    core: layer('core'),
    // Brilho por tras, como o drop-shadow da referencia, so nos dois ultimos.
    glow: shape.glow ? flamePath({ height: shape.height * 1.05, width: shape.width * 1.22 }) : null,
  };
};

// Miolo azul-gelo do ultimo nivel.
const ICE = { inner: '#A9C4FF', core: '#E2F7FF' };

// Degrades verticais, escuro em cima e claro na base, alternando claro e
// escuro de uma camada para a outra como na referencia — e essa alternancia
// que deixa as camadas legiveis num icone de 16px.
export const getStreakFlameColors = (palette, level, darken) => {
  const iced = level >= STREAK_FLAME_LEVELS.length;
  const light = iced ? ICE.inner : palette.ringEnd;
  const core = iced ? ICE.core : palette.flameCore;
  return {
    outline: darken(palette.ringStart, 0.5),
    glow: palette.ringMid,
    outer: [palette.ringStart, palette.ringMid, palette.ringEnd, core],
    mid: [darken(palette.ringStart, 0.12), palette.ringStart, palette.ringMid, palette.ringEnd],
    inner: [darken(palette.ringStart, 0.28), palette.ringStart, palette.ringMid, light],
    core: [light, core, core],
  };
};

// Ritmos da referencia: a chama respira, balanca, as camadas de dentro lambem
// e o miolo pulsa. Periodos diferentes para nunca repetirem em fase. O
// balanco e uma rotacao pequena em volta da base: o Android nao tem skew
// nativo, e o skew decomposto empurrava a chama para baixo do quadro.
export const STREAK_FLAME_MOTION = {
  breathe: { period: 2600, scaleX: 1.025, scaleY: 1.05 },
  sway: { period: 1900, rotate: [-3, 2.5] },
  lick: { period: 1300, scaleX: 0.97, scaleY: 1.06 },
  pulse: { period: 900, from: [0.94, 0.93], to: [1.04, 1.08] },
};
