const formatNumber = (value) => value.toString().padStart(2, '0');

const formatTimeValue = ({ hour, minute, meridiem }, use24Hour = false) => {
  if (use24Hour) {
    const hour24 = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
    return `${formatNumber(hour24)}:${formatNumber(minute)}`;
  }
  return `${formatNumber(hour)}:${formatNumber(minute)} ${meridiem}`;
};

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
  // Português usa relógio de 24h; inglês mantém AM/PM.
  const use24Hour = options.language === 'pt';

  const groupCount = Array.isArray(time?.groups)
    ? time.groups.filter((group) => Array.isArray(group?.days) && group.days.length > 0).length
    : 0;
  if (groupCount >= 2) {
    return options.language === 'pt' ? `${groupCount} hor\u00e1rios` : `${groupCount} times`;
  }

  if (!time || !time.specified) {
    return anytimeLabel;
  }

  if (time.mode === 'period' && time.period) {
    const { start, end } = time.period;
    return `${formatTimeValue(start, use24Hour)} - ${formatTimeValue(end, use24Hour)}`;
  }

  if (time.point) {
    return formatTimeValue(time.point, use24Hour);
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

// Timers antigos usavam `minutes`/`seconds` para representar horas/minutos.
// O formato atual usa `hours`/`minutesPart`, mas a leitura continua compatível.
const getTimerParts = (timer) => ({
  hours: Number.parseInt(timer?.hours ?? timer?.minutes ?? 0, 10) || 0,
  minutes: Number.parseInt(timer?.minutesPart ?? timer?.seconds ?? 0, 10) || 0,
});

const getTimerTotalSeconds = (timer) => {
  const { hours, minutes } = getTimerParts(timer);
  return toTimerSeconds(hours, minutes);
};

export {
  formatDuration,
  formatNumber,
  formatTaskTime,
  formatTimeValue,
  getTimerParts,
  getTimerTotalSeconds,
  toMinutes,
  toTimerSeconds,
};
