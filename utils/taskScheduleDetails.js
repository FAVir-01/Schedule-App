import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { getCurrentScheduleVersion } from '../domain/taskSchedule';
import { normalizeDateValue } from './dateUtils';
import { getTimeGroups } from './taskTimeUtils';
import { formatTaskTime } from './timeUtils';
import { getTaskRepeatDisplayLabel, normalizeRepeatConfig } from './taskUtils';

const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function getTaskScheduleDetails(task, language = 'en') {
  const version = getCurrentScheduleVersion(task);
  if (!version) return [];
  const t = translations[language] ?? translations.en;
  const pt = language === 'pt';
  const locale = getDateLocale(language);
  const anchor = normalizeDateValue(version.effectiveFrom);
  const repeat = normalizeRepeatConfig(version.repeat);
  const enabled = repeat.enabled && repeat.option !== 'off' && version.repeat?.option !== 'off';
  const frequency = repeat.frequency === 'interval' ? 'daily' : repeat.frequency;
  const dayName = (key) => format(new Date(2026, 0, 4 + weekdays.indexOf(key)), 'EEEE', { locale });
  const dayList = (days) => frequency === 'weekly'
    ? weekdays.filter((key) => days.includes(key)).map(dayName).join(', ')
    : `${pt ? 'Dias' : 'Days'} ${[...days].sort((a, b) => a - b).join(', ')}`;
  const rows = [getTaskRepeatDisplayLabel({ ...repeat, frequency, enabled }, t.taskDisplay.repeats)];
  if (enabled && frequency === 'weekly') {
    const days = Array.from(repeat.weekdays ?? []);
    rows.push(dayList(days.length ? days : [weekdays[anchor.getDay()]]));
  } else if (enabled && frequency === 'monthly') {
    const days = Array.from(repeat.monthDays ?? []);
    rows.push(dayList(days.length ? days : [anchor.getDate()]));
  }
  const groups = getTimeGroups(version.time);
  if (enabled && ['weekly', 'monthly'].includes(frequency) && groups.length >= 2) {
    groups.forEach((group) => rows.push(`${dayList(group.days)}: ${formatTaskTime(group, { language })}`));
  } else {
    rows.push(formatTaskTime(version.time, { language }));
  }
  rows.push(`${pt ? 'A partir de' : 'From'} ${format(anchor, 'PPP', { locale })}`);
  const end = enabled ? normalizeDateValue(repeat.endDate) : null;
  if (end) rows.push(`${t.sheet.endDate}: ${format(end, 'PPP', { locale })}`);
  else if (enabled) rows.push(pt ? 'Sem data de término' : 'No end date');
  return rows;
}
