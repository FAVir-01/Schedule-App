// Contorno de fogo em coordenadas proporcionais à largura da polaroid.
// O ruído em cinco oitavas e a distorção de domínio vêm do shader de referência;
// aqui geram os contornos SVG que o app nativo consegue desenhar.
export const POLAROID_FLAME_MIN_STREAK = 7;
export const POLAROID_FLAME_HEIGHT = 23;

const SAMPLES = 64;
const ROTATION_COS = Math.cos(0.5);
const ROTATION_SIN = Math.sin(0.5);
const fract = (value) => value - Math.floor(value);
const mix = (a, b, amount) => a + (b - a) * amount;
const random = (x, y) => fract(Math.sin(x * 12.9898 + y * 4.1414) * 43758.5453);

const noise = (x, y) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fract(x);
  const fy = fract(y);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const value = mix(
    mix(random(ix, iy), random(ix + 1, iy), ux),
    mix(random(ix, iy + 1), random(ix + 1, iy + 1), ux),
    uy
  );
  return value * value;
};

const fbm = (initialX, initialY) => {
  let x = initialX;
  let y = initialY;
  let value = 0;
  let amplitude = 0.5;
  for (let octave = 0; octave < 5; octave += 1) {
    value += amplitude * noise(x, y);
    const nextX = (ROTATION_COS * x - ROTATION_SIN * y) * 2 + 100;
    y = (ROTATION_SIN * x + ROTATION_COS * y) * 2 + 100;
    x = nextX;
    amplitude *= 0.5;
  }
  return value;
};

export const hasPolaroidFlame = (streak) =>
  Number.isFinite(Number(streak)) && Number(streak) >= POLAROID_FLAME_MIN_STREAK;

export const getPolaroidFlamePaths = (seconds = 0) => {
  const time = Number.isFinite(seconds) ? seconds * 0.85 : 0;
  const edge = [];
  const core = [];
  for (let index = 0; index <= SAMPLES; index += 1) {
    const progress = index / SAMPLES;
    const x = progress * 100;
    const px = progress * 12;
    const warp = fbm(px, -time);
    const heat = fbm(px + warp, -time + warp);
    // As pontas baixam junto às laterais, mantendo a chama na base da foto.
    const taper = Math.min(1, progress * 12, (1 - progress) * 12);
    const rise = 2.2 + taper * (2.2 + heat * 27);
    const y = Math.max(2, POLAROID_FLAME_HEIGHT - rise);
    const coreY = Math.min(POLAROID_FLAME_HEIGHT - 0.7, y + 1.2 + heat * 3);
    const command = index === 0 ? 'M' : 'L';
    edge.push(`${command}${x.toFixed(2)},${y.toFixed(2)}`);
    core.push(`${command}${x.toFixed(2)},${coreY.toFixed(2)}`);
  }
  const crest = edge.join(' ');
  const close = ` L100,${POLAROID_FLAME_HEIGHT} L0,${POLAROID_FLAME_HEIGHT} Z`;
  return { edge: crest + close, core: core.join(' ') + close, crest };
};
