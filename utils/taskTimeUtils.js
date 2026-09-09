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

const getRepeatDayKey = (repeat, date) => {
  if (!date) {
    return null;
  }
  const frequency = repeat?.frequency ?? repeat?.option;
  if (frequency === 'weekly') {
    return getWeekdayKeyFromDate(date);
  }
  if (frequency === 'monthly') {
    return date.getDate();
  }
  return null;
};

// Um dia pode aparecer em mais de um grupo: a materia da faculdade que acontece
// das 07:20 as 09:00 e de novo das 15:20 as 17:00 na mesma segunda. Cada grupo
// que contem o dia vira uma OCORRENCIA propria — card, presenca e lembrete
// separados.
//
// A `id` da ocorrencia so existe quando o dia tem duas ou mais: com uma unica
// ocorrencia a chave continua sendo o `dateKey` puro, que e exatamente o que
// esta gravado em `completedDates` desde sempre. Nenhuma tarefa antiga muda de
// chave, e nenhum backup precisa ser migrado.
export const getTimeOccurrencesForDate = (time, repeat, targetDate) => {
  const groups = getTimeGroups(time);
  if (groups.length < 2) {
    return [{ id: null, time: time ?? null }];
  }

  const date = normalizeDateValue(targetDate);
  const dayKey = getRepeatDayKey(repeat, date);
  const matching = groups.filter((group) => group.days.includes(dayKey));

  // A data de inicio sempre aparece na agenda, mesmo quando o dia dela nao
  // esta entre os escolhidos na repeticao. Sem grupo para esse dia vale o
  // primeiro: devolver a configuracao agrupada faria o card mostrar
  // "2 horarios" no lugar de uma hora.
  if (matching.length === 0) {
    return [{ id: null, time: groups[0] }];
  }
  if (matching.length === 1) {
    return [{ id: null, time: matching[0] }];
  }
  return matching.map((group) => ({ id: group.id, time: group }));
};

// Resolve o horario que vale para uma ocorrencia sem apagar o horario simples
// da tarefa. Assim, tarefas antigas e configuracoes sem grupos continuam
// funcionando exatamente como antes. Dias com mais de uma ocorrencia devolvem a
// primeira: quem precisa de todas usa `getTimeOccurrencesForDate`.
export const resolveTimeForRepeatDate = (time, repeat, targetDate) => {
  const groups = getTimeGroups(time);
  if (groups.length < 2) {
    return time ?? null;
  }
  return getTimeOccurrencesForDate(time, repeat, targetDate)[0].time;
};

// A chave de ocorrencia indexa `completedDates` e `quantum.progressByDate`.
// Ambos sao mapas livres de string, entao a ocorrencia extra cabe na estrutura
// que ja existe — sem campo novo, sem migracao.
export const getOccurrenceKey = (dateKey, occurrenceId) =>
  dateKey && occurrenceId ? `${dateKey}#${occurrenceId}` : dateKey;

export const getDateKeyFromOccurrenceKey = (occurrenceKey) =>
  typeof occurrenceKey === 'string' ? occurrenceKey.split('#')[0] : occurrenceKey;

// `occurrenceId` so existe nas copias expandidas para a lista do dia. Sem ele a
// chave e o proprio `dateKey`, entao toda tarefa comum le e grava exatamente
// onde sempre leu e gravou.
export const getTaskOccurrenceKey = (task, dateKey) => getOccurrenceKey(dateKey, task?.occurrenceId);

// Identidade do card na lista: duas ocorrencias da mesma tarefa no mesmo dia
// compartilham o `id`, e sem isso elas brigariam pela mesma animacao e pela
// mesma chave de render.
export const getTaskListKey = (task) =>
  task?.occurrenceId ? `${task.id}#${task.occurrenceId}` : String(task?.id);
