import { getWeekdayKeyFromDate, normalizeDateValue } from './dateUtils';

export const getTimeGroups = (time) => {
  if (!Array.isArray(time?.groups)) {
    return [];
  }
  return time.groups.filter(
    (group) => group && typeof group === 'object' && Array.isArray(group.days) && group.days.length > 0
  );
};

export const hasGroupedTaskTimes = (time) => getTimeGroups(time).length >= 2;

export const getTimeConfigurations = (time) =>
  hasGroupedTaskTimes(time) ? getTimeGroups(time) : time ? [time] : [];

// Resolve o horario que vale para uma ocorrencia sem apagar o horario simples
// da tarefa. Assim, tarefas antigas e configuracoes sem grupos continuam
// funcionando exatamente como antes.
export const resolveTimeForRepeatDate = (time, repeat, targetDate) => {
  const groups = getTimeGroups(time);
  if (groups.length < 2) {
    return time ?? null;
  }

  const date = normalizeDateValue(targetDate);
  const frequency = repeat?.frequency ?? repeat?.option;
  const dayKey =
    !date
      ? null
      : frequency === 'weekly'
      ? getWeekdayKeyFromDate(date)
      : frequency === 'monthly'
      ? date.getDate()
      : null;

  // A data de inicio sempre aparece na agenda, mesmo quando o dia dela nao
  // esta entre os escolhidos na repeticao. Sem grupo para esse dia vale o
  // primeiro grupo: devolver a configuracao agrupada faria o card mostrar
  // "2 horarios" no lugar de uma hora, e o lembrete usaria outro horario.
  return groups.find((group) => group.days.includes(dayKey)) ?? groups[0];
};
