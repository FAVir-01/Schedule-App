export const getChartMetricKey = ({
  mode,
  chartType,
  isFocused = false,
}) => {
  if (!isFocused) {
    return mode === 'percent' ? 'periodRate' : 'periodCompletions';
  }
  if (mode === 'percent') {
    return chartType === 'bars' ? 'intervalRate' : 'movingAverage';
  }
  if (mode === 'accum') {
    return 'cumulativeCompletions';
  }
  return chartType === 'bars' ? 'intervalCompletions' : 'dailyCompletions';
};

export const getChartSeriesMetricKey = ({ mode, chartType }) =>
  getChartMetricKey({ mode, chartType, isFocused: true });

export const getChartEmptyStateKey = (mode) =>
  mode === 'percent' ? 'percent' : mode === 'accum' ? 'accum' : 'values';
