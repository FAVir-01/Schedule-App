// Tempos em milissegundos, antes de aplicar easing. Cada propriedade tem seus
// próprios marcos: suavizar o relógio inteiro desloca os marcos da opacidade.
export const STREAK_RING_BOX = 50;
export const STREAK_RING_MIN = 3;
export const STREAK_NUMBER_LINE = 15;

export const getStreakAnimationMode = (to) => {
  const value = Number(to) || 0;
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
  };
};

// Relógio quadro a quadro. O `Animated.timing` mede o tempo pelo relógio de
// parede: se a thread de JS engasga (o app inteiro re-renderiza e salva ao
// concluir uma tarefa), a animação congela e depois SALTA para alcançar o
// tempo perdido — é o "volta e vai" dos anéis. Aqui cada quadro avança no
// máximo `STREAK_MAX_FRAME_STEP`: num engasgo a animação pausa e retoma de
// onde parou. Anima no driver de JS porque strokeDashoffset não é prop de
// View; o custo é um setValue por quadro.
export const STREAK_MAX_FRAME_STEP = 34; // dois quadros a 60Hz

export const createStreakClock = (clock, duration, { onEnd } = {}) => {
  let frame = null;
  let last = null;
  let elapsed = 0;
  const finish = () => {
    frame = null;
    clock.setValue(duration);
    onEnd?.();
  };
  const step = (now) => {
    if (last != null) elapsed += Math.min(now - last, STREAK_MAX_FRAME_STEP);
    last = now;
    if (elapsed >= duration) {
      finish();
      return;
    }
    clock.setValue(elapsed);
    frame = globalThis.requestAnimationFrame(step);
  };
  return {
    start() {
      if (frame != null) return;
      last = null;
      elapsed = 0;
      clock.setValue(0);
      frame = globalThis.requestAnimationFrame(step);
    },
    // Cancela sem pular para o fim: quem para decide onde o relógio fica.
    cancel() {
      if (frame != null) globalThis.cancelAnimationFrame(frame);
      frame = null;
    },
    get running() {
      return frame != null;
    },
  };
};

// O mesmo que `Animated.interpolate` com `easing`: acha o trecho, normaliza
// e aplica o easing a esse trecho. `easings` traduz o nome da trilha para a
// funcao (o componente passa as do RN; o teste, as suas).
export const interpolateTrack = (track, time, easings) => {
  const { inputRange: x, outputRange: y, easing } = track;
  const last = x.length - 1;
  const clamped = Math.max(x[0], Math.min(x[last], Number(time) || 0));
  let index = 0;
  while (index < last - 1 && clamped > x[index + 1]) index += 1;
  const span = x[index + 1] - x[index];
  const progress = span > 0 ? (clamped - x[index]) / span : 1;
  const ease = easings?.[easing] ?? ((value) => value);
  return y[index] + (y[index + 1] - y[index]) * ease(progress);
};
