// Matemática de calendário usada pelo editor de tarefas para desenhar o mês e
// prever quais dias uma repetição atingiria. Puro e sem React, para poder ser
// exercitado por `scripts/test-domain-rules.js`.
//
// A projeção aqui é só para a prévia do seletor de data. A regra que decide se
// uma tarefa aparece de fato num dia é `shouldTaskAppearOnDate`, em
// `utils/dateUtils.js`, que trabalha sobre a tarefa já persistida.

import { getWeekdayKeyFromDate, normalizeDateValue } from './dateUtils';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const startOfDay = (value) => normalizeDateValue(value);

const daysBetween = (start, end) => Math.round((startOfDay(end) - startOfDay(start)) / DAY_IN_MS);

const monthsBetween = (start, end) =>
  (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

const isBeforeDay = (dateA, dateB) => startOfDay(dateA).getTime() < startOfDay(dateB).getTime();

const getMonthMetadata = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    year,
    month,
    days: new Date(year, month + 1, 0).getDate(),
    startWeekday: new Date(year, month, 1).getDay(),
  };
};

const addMonths = (date, offset) => {
  const result = new Date(date);
  // Fixa o dia 1 antes de mudar o mês: somar um mês a 31 de janeiro
  // escorregaria para março.
  result.setDate(1);
  result.setMonth(result.getMonth() + offset);
  return result;
};

// `weekdays` e `monthDays` chegam como arrays (o rascunho do editor não usa
// Set, para continuar serializável e comparável nos testes).
const doesDateRepeat = (date, start, repeatConfig) => {
  if (!repeatConfig?.enabled || !start || isBeforeDay(date, start)) {
    return false;
  }

  const { frequency, interval = 1, weekdays, monthDays, endDate } = repeatConfig;
  const normalizedDate = startOfDay(date);
  const normalizedStart = startOfDay(start);
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : 1;

  if (endDate && isBeforeDay(endDate, normalizedDate)) {
    return false;
  }

  if (frequency === 'daily') {
    return daysBetween(normalizedStart, normalizedDate) % safeInterval === 0;
  }

  if (frequency === 'weekly') {
    const diffWeeks = Math.floor(daysBetween(normalizedStart, normalizedDate) / 7);
    const allowed = weekdays?.length ? weekdays : [getWeekdayKeyFromDate(normalizedStart)];
    return (
      diffWeeks % safeInterval === 0 && allowed.includes(getWeekdayKeyFromDate(normalizedDate))
    );
  }

  if (frequency === 'monthly') {
    const diffMonths = monthsBetween(normalizedStart, normalizedDate);
    const allowed = monthDays?.length ? monthDays : [normalizedStart.getDate()];
    return diffMonths % safeInterval === 0 && allowed.includes(normalizedDate.getDate());
  }

  return false;
};

export { addMonths, daysBetween, doesDateRepeat, getMonthMetadata, isBeforeDay, monthsBetween };
