const buildWavePath = ({ width, height, amplitude, phase }) => {
  if (!width || !height) {
    return '';
  }
  const points = 24;
  const step = width / points;
  const center = height * 0.5;
  let path = `M 0 ${center}`;
  for (let i = 0; i <= points; i += 1) {
    const x = step * i;
    const theta = (i / points) * Math.PI * 2 + phase;
    const y = center + Math.sin(theta) * amplitude;
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  path += ` L ${width} ${height}`;
  path += ` L 0 ${height} Z`;
  return path;
};

// Onda periódica "repetível": sen(x) completa ciclos inteiros a cada `wavelength`,
// então transladar o SVG em exatamente 1 wavelength faz loop perfeito sem emenda.
const buildRepeatingWavePath = ({ totalWidth, wavelength, height, amplitude }) => {
  if (!totalWidth || !wavelength || !height) {
    return '';
  }
  const points = Math.max(24, Math.ceil((totalWidth / wavelength) * 24));
  const step = totalWidth / points;
  const center = amplitude + 3;
  let path = `M 0 ${center.toFixed(2)}`;
  for (let i = 0; i <= points; i += 1) {
    const x = step * i;
    const theta = (x / wavelength) * Math.PI * 2;
    const y = center + Math.sin(theta) * amplitude;
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  path += ` L ${totalWidth.toFixed(2)} ${height} L 0 ${height} Z`;
  return path;
};

export { buildRepeatingWavePath, buildWavePath };
