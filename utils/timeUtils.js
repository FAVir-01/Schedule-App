const formatNumber = (value) => value.toString().padStart(2, '0');

const formatTimeValue = ({ hour, minute, meridiem }) =>
  `${formatNumber(hour)}:${formatNumber(minute)} ${meridiem}`;

const toMinutes = ({ hour, minute, meridiem }) => {
  const normalizedHour = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
  return normalizedHour * 60 + minute;
};

const formatTaskTime = (time) => {
  if (!time || !time.specified) {
    return 'Anytime';
  }

  if (time.mode === 'period' && time.period) {
    const { start, end } = time.period;
    return `${formatTimeValue(start)} - ${formatTimeValue(end)}`;
  }

  if (time.point) {
    return formatTimeValue(time.point);
  }

  return 'Anytime';
};

const formatDuration = (totalSeconds) => {
  const safeSeconds = Math.max(0, totalSeconds || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}:${formatNumber(minutes)}`;
};

export { formatDuration, formatNumber, formatTaskTime, formatTimeValue, toMinutes };
