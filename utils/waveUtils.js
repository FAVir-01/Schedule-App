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

export { buildWavePath };
