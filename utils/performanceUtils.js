const MAX_PERFORMANCE_METRICS = 100;
const PERFORMANCE_LOG_PREFIX = '[FavitPerformance]';
const recentPerformanceMetrics = [];

const getNow = () => {
  if (globalThis.performance?.now) {
    return globalThis.performance.now();
  }
  return Date.now();
};

const roundMetricNumber = (value) => Math.round(value * 100) / 100;

export const sanitizePerformanceMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return Object.entries(metadata).reduce((safeMetadata, [key, value]) => {
    if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(key)) {
      return safeMetadata;
    }
    if (typeof value === 'boolean') {
      safeMetadata[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      safeMetadata[key] = roundMetricNumber(value);
    }
    return safeMetadata;
  }, {});
};

export const recordPerformanceMetric = (
  name,
  durationMs,
  metadata = {},
  { log = typeof __DEV__ !== 'undefined' && __DEV__ } = {}
) => {
  if (typeof name !== 'string' || !name || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  const metric = {
    name,
    durationMs: roundMetricNumber(durationMs),
    metadata: sanitizePerformanceMetadata(metadata),
  };
  recentPerformanceMetrics.push(metric);
  if (recentPerformanceMetrics.length > MAX_PERFORMANCE_METRICS) {
    recentPerformanceMetrics.splice(
      0,
      recentPerformanceMetrics.length - MAX_PERFORMANCE_METRICS
    );
  }

  if (log) {
    console.info(`${PERFORMANCE_LOG_PREFIX} ${JSON.stringify(metric)}`);
  }
  return metric;
};

export const measureSynchronous = (
  name,
  operation,
  metadata = {},
  options
) => {
  if (typeof operation !== 'function') {
    throw new TypeError('A performance operation must be a function.');
  }

  const startedAt = getNow();
  let result;
  try {
    result = operation();
  } catch (error) {
    try {
      const resolvedMetadata = typeof metadata === 'function' ? {} : metadata;
      recordPerformanceMetric(
        name,
        getNow() - startedAt,
        { ...sanitizePerformanceMetadata(resolvedMetadata), failed: true },
        options
      );
    } catch {
      // Observabilidade nunca deve substituir o erro real da operação.
    }
    throw error;
  }

  try {
    const resolvedMetadata =
      typeof metadata === 'function' ? metadata(result) : metadata;
    recordPerformanceMetric(name, getNow() - startedAt, resolvedMetadata, options);
  } catch {
    // Uma falha de medição não pode interromper a ação medida.
  }
  return result;
};

export const getRecentPerformanceMetrics = () =>
  recentPerformanceMetrics.map((metric) => ({
    ...metric,
    metadata: { ...metric.metadata },
  }));

export const clearPerformanceMetrics = () => {
  recentPerformanceMetrics.length = 0;
};
