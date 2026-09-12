const hexToRgb = (hex) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
};

const lightenColor = (hex, amount = 0.7) => {
  try {
    const { r, g, b } = hexToRgb(hex);
    const mixChannel = (channel) => Math.round(channel + (255 - channel) * amount);
    const mixed = [mixChannel(r), mixChannel(g), mixChannel(b)];
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  } catch (error) {
    return '#f2f3f8';
  }
};

// Borda do card: a cor pura da tarefa é pastel e some sobre o fundo clareado;
// puxar um pouco para o preto deixa o contorno nítido sem mudar o matiz.
const darkenColor = (hex, amount = 0.18) => {
  try {
    const { r, g, b } = hexToRgb(hex);
    const mixed = [r, g, b].map((channel) => Math.round(channel * (1 - amount)));
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  } catch (error) {
    return hex;
  }
};

const mixChannel = (from, to, ratio) => Math.round(from + (to - from) * ratio);

const interpolateHexColor = (from, to, ratio) => {
  const normalize = (hex) => hex.replace('#', '');
  const fromValue = parseInt(normalize(from), 16);
  const toValue = parseInt(normalize(to), 16);
  const fromRgb = {
    r: (fromValue >> 16) & 255,
    g: (fromValue >> 8) & 255,
    b: fromValue & 255,
  };
  const toRgb = {
    r: (toValue >> 16) & 255,
    g: (toValue >> 8) & 255,
    b: toValue & 255,
  };
  const mixed = {
    r: mixChannel(fromRgb.r, toRgb.r, ratio),
    g: mixChannel(fromRgb.g, toRgb.g, ratio),
    b: mixChannel(fromRgb.b, toRgb.b, ratio),
  };
  return `#${[mixed.r, mixed.g, mixed.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};

export { darkenColor, hexToRgb, interpolateHexColor, lightenColor };
