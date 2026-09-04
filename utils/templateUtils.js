// Sobrevivente da aba Discover antiga.
//
// O catálogo de rotinas prontas e o construtor de tarefas a partir dele foram
// removidos, mas quem já importou uma rotina tem tarefas gravadas no aparelho
// carregando `templateSource`. Esta migração conserta durações erradas dessas
// tarefas e roda em todo boot, sobre o que vem do storage — não tem relação com
// nenhuma tela.
//
// Não apagar junto com o resto do Discover: é dado real de usuário.

// Ficava em `constants/taskTemplates.js`, que foi removido. A versão marca as
// tarefas já corrigidas para a migração não rodar de novo.
const TASK_TEMPLATE_VERSION = 2;

const getTemplateTaskSourceKey = (templateId, taskId) =>
  templateId && taskId ? `${templateId}:${taskId}` : null;

const matchesBrokenTemplateTimer = (timer, expectedMinutes) =>
  timer?.minutesPart == null &&
  Number(timer?.minutes) === expectedMinutes &&
  Number(timer?.seconds ?? 0) === 0 &&
  (timer?.hours == null || Number(timer.hours) === 0);

const migrateImportedTemplateTasks = (tasks) => {
  if (!Array.isArray(tasks)) {
    return tasks;
  }

  return tasks.map((task) => {
    const source = task?.templateSource;
    if (!source?.templateId || !source?.taskId || Number(source.version ?? 0) >= 2) {
      return task;
    }

    let migratedTask = task;
    if (
      source.templateId === 'morningReset' &&
      source.taskId === 'stretch' &&
      task.type === 'quantum' &&
      task.quantum?.mode === 'timer' &&
      matchesBrokenTemplateTimer(task.quantum.timer, 5)
    ) {
      migratedTask = { ...task, type: 'default', quantum: null };
    }

    const timerFixes = {
      'focusFlow:focusBlock': 25,
      'gentleEvening:walk': 20,
    };
    const sourceKey = getTemplateTaskSourceKey(source.templateId, source.taskId);
    const expectedMinutes = timerFixes[sourceKey];
    if (
      expectedMinutes &&
      task.type === 'quantum' &&
      task.quantum?.mode === 'timer' &&
      matchesBrokenTemplateTimer(task.quantum.timer, expectedMinutes)
    ) {
      migratedTask = {
        ...task,
        quantum: {
          ...task.quantum,
          timer: { hours: 0, minutesPart: expectedMinutes },
        },
      };
    }

    return {
      ...migratedTask,
      templateSource: { ...source, version: TASK_TEMPLATE_VERSION },
    };
  });
};

export { TASK_TEMPLATE_VERSION, getTemplateTaskSourceKey, migrateImportedTemplateTasks };
