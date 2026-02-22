const formatNumber = (value) => value.toString().padStart(2, '0');

const formatTimeValue = ({ hour, minute, meridiem }) =>
  `${formatNumber(hour)}:${formatNumber(minute)} ${meridiem}`;

const toMinutes = ({ hour, minute, meridiem }) => {
  const normalizedHour = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
  return normalizedHour * 60 + minute;
};

const ANYTIME_LABELS = {
  en: 'Anytime',
  pt: 'Qualquer horário',
};

const resolveAnytimeLabel = (options = {}) => {
  if (typeof options.anytimeLabel === 'string' && options.anytimeLabel.trim()) {
    return options.anytimeLabel.trim();
  }
  const language = typeof options.language === 'string' ? options.language : 'en';
  return ANYTIME_LABELS[language] ?? ANYTIME_LABELS.en;
};

const formatTaskTime = (time, options = {}) => {
  const anytimeLabel = resolveAnytimeLabel(options);

  if (!time || !time.specified) {
    return anytimeLabel;
  }

  if (time.mode === 'period' && time.period) {
    const { start, end } = time.period;
    return `${formatTimeValue(start)} - ${formatTimeValue(end)}`;
  }

  if (time.point) {
    return formatTimeValue(time.point);
  }

  return anytimeLabel;
};

const formatDuration = (totalSeconds) => {
  const safeSeconds = Math.max(0, totalSeconds || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}:${formatNumber(minutes)}`;
};

const toTimerSeconds = (hours, minutes) => {
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return safeHours * 3600 + safeMinutes * 60;
};

const getTimerTotalSeconds = (timer) => {
  const timerHours = Number.parseInt(timer?.hours ?? timer?.minutes ?? 0, 10) || 0;
  const timerMinutes = Number.parseInt(timer?.minutesPart ?? timer?.seconds ?? 0, 10) || 0;
  return toTimerSeconds(timerHours, timerMinutes);
};

export {
  formatDuration,
  formatNumber,
  formatTaskTime,
  formatTimeValue,
  getTimerTotalSeconds,
  toMinutes,
  toTimerSeconds,
};
