// Tempos em milissegundos, antes de aplicar easing. Cada propriedade tem seus
// próprios marcos: suavizar o relógio inteiro desloca os marcos da opacidade.
export const STREAK_RING_BOX = 50;
export const STREAK_RING_MIN = 3;
export const STREAK_BLAZE_MIN = 7;
export const STREAK_CROSS_MIN = 34;
export const STREAK_NUMBER_LINE = 15;

export const getStreakAnimationMode = (to) => {
  const value = Number(to) || 0;
  if (value >= STREAK_BLAZE_MIN) return 'blaze';
  if (value >= STREAK_RING_MIN) return 'ring';
  return value >= 1 ? 'number' : null;
};

const track = (inputRange, outputRange, easing = 'easeInOut') => ({
  inputRange, outputRange, easing, extrapolate: 'clamp',
});

export const getStreakAnimationTracks = (to, size = STREAK_RING_BOX) => {
  const mode = getStreakAnimationMode(to);
  const circumference = 2 * Math.PI * (size / 2 - 3.2);
  return {
    mode,
    duration: mode === 'ring' ? 2900 : 2600,
    number: {
      opacity: track([0, 676, 988, 2184, 2600], [0, 0, 1, 1, 0]),
      translateY: track([0, 676, 988, 2184, 2600], [4, 4, 0, 0, -3]),
      roll: track([1200, 1620], [0, -STREAK_NUMBER_LINE], 'roll'),
      // Só a linha em uso transborda os 2px do contorno nos extremos do rolo.
      previousOpacity: track([1619, 1620], [1, 0], 'linear'),
      nextOpacity: track([1200, 1201], [0, 1], 'linear'),
    },
    ring: {
      circumference,
      dashOffset: track([0, 870, 1508, 2900], [circumference, 0, 0, -circumference], 'linear'),
      opacity: track([0, 232, 2726, 2900], [0, 1, 1, 0], 'linear'),
    },
    // A foto do card tem 46px. Mantemos as folgas de 0,15–0,25px da
    // referência ao adaptar os anéis para ela, dentro de um SVG de 66px.
    blaze: [
      { radius: 30.7, width: 3, delay: 0, key: 'ringStart' },
      { radius: 27.75, width: 2.5, delay: 100, key: 'ringMid' },
      { radius: 25.3, width: 2.1, delay: 200, key: 'ringEnd' },
    ].map((ring, index) => {
      const length = 2 * Math.PI * ring.radius;
      const reverse = Number(to) >= STREAK_CROSS_MIN && index === 1;
      const times = [0, 1008, 2400].map((ms) => ms + ring.delay);
      return {
        ...ring,
        circumference: length,
        opacity: track([0, 240, 2064, 2400].map((ms) => ms + ring.delay), [0, 1, 1, 0]),
        dashOffset: track(times, [-0.996 * length, -0.26 * length, -0.996 * length]),
        rotation: track(times, reverse ? [-90, -370, -640] : [-90, 190, 460]),
      };
    }),
  };
};
