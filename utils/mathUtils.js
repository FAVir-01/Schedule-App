const clampValue = (value, min, max) => Math.min(Math.max(value, min), max);

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export { clamp01, clampValue };
