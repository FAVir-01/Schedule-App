import { getDateKey, normalizeDateValue } from './dateUtils';
import { normalizeRepeatConfig } from './taskUtils';
import { TASK_TEMPLATE_VERSION } from '../constants/taskTemplates';

const getTemplateTaskSourceKey = (templateId, taskId) =>
  templateId && taskId ? `${templateId}:${taskId}` : null;

const getImportedTemplateTaskKeys = (tasks) => {
  const keys = new Set();
  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    const source = task?.templateSource;
    const key = getTemplateTaskSourceKey(source?.templateId, source?.taskId);
    if (key) {
      keys.add(key);
    }
  });
  return keys;
};

const makeUniqueTitle = (requestedTitle, usedTitles, fallbackTitle) => {
  const baseTitle = `${requestedTitle ?? ''}`.trim() || fallbackTitle;
  const normalizedBase = baseTitle.toLocaleLowerCase();
  if (!usedTitles.has(normalizedBase)) {
    usedTitles.add(normalizedBase);
    return baseTitle;
  }

  let suffix = 1;
  let candidate = `${baseTitle} ${suffix}`;
  while (usedTitles.has(candidate.toLocaleLowerCase())) {
    suffix += 1;
    candidate = `${baseTitle} ${suffix}`;
  }
  usedTitles.add(candidate.toLocaleLowerCase());
  return candidate;
};

const createTemplateTaskId = (templateId, taskId, index) =>
  `${Date.now()}-tpl-${templateId}-${taskId}-${index}-${Math.random().toString(36).slice(2, 8)}`;

const createTemplateSubtaskId = (taskId, index) =>
  `${Date.now()}-tpl-sub-${taskId}-${index}-${Math.random().toString(36).slice(2, 8)}`;

const buildTemplateTasks = ({
  template,
  selectedTaskIds,
  localizedTemplate,
  existingTasks = [],
  startDate = new Date(),
  fallbackTitle = 'Untitled task',
  createTaskId = createTemplateTaskId,
  createSubtaskId = createTemplateSubtaskId,
}) => {
  if (!template?.id || !Array.isArray(template.tasks)) {
    return [];
  }

  const normalizedStartDate = normalizeDateValue(startDate);
  if (!normalizedStartDate) {
    return [];
  }

  const selectedIds = new Set(Array.isArray(selectedTaskIds) ? selectedTaskIds : []);
  const importedSourceKeys = getImportedTemplateTaskKeys(existingTasks);
  const usedTitles = new Set(
    existingTasks.map((task) => `${task?.title ?? ''}`.trim().toLocaleLowerCase())
  );

  return template.tasks
    .filter((definition) => {
      const sourceKey = getTemplateTaskSourceKey(template.id, definition.id);
      return selectedIds.has(definition.id) && !importedSourceKeys.has(sourceKey);
    })
    .map((definition, index) => {
      const localizedTask = localizedTemplate?.tasks?.[definition.id] ?? {};
      const taskId = createTaskId(template.id, definition.id, index);
      const quantum = definition.type === 'quantum'
        ? {
            ...(definition.quantum ?? {}),
            timer: definition.quantum?.timer
              ? { ...definition.quantum.timer }
              : undefined,
            count: definition.quantum?.count
              ? { ...definition.quantum.count }
              : undefined,
            progressByDate: {},
            doneSeconds: 0,
            doneCount: 0,
            lastAdjustSeconds: 0,
            lastAdjustCount: 0,
          }
        : null;
      const subtasks = (Array.isArray(localizedTask.subtasks) ? localizedTask.subtasks : [])
        .map((title) => `${title ?? ''}`.trim())
        .filter(Boolean)
        .map((title, subtaskIndex) => ({
          id: createSubtaskId(taskId, subtaskIndex),
          title,
          completedDates: {},
        }));

      return {
        id: taskId,
        title: makeUniqueTitle(localizedTask.title, usedTitles, fallbackTitle),
        color: definition.color ?? '#d1d7ff',
        emoji: definition.emoji ?? '✅',
        customImage: null,
        time: { specified: false },
        date: new Date(normalizedStartDate),
        dateKey: getDateKey(normalizedStartDate),
        completedDates: {},
        subtasks,
        repeat: normalizeRepeatConfig(definition.repeat),
        reminder: 'none',
        tag: definition.tag ?? null,
        type: definition.type ?? 'default',
        quantum,
        profileLocked: false,
        notificationIds: [],
        notificationId: null,
        notificationScheduleMode: null,
        templateSource: {
          templateId: template.id,
          taskId: definition.id,
          version: TASK_TEMPLATE_VERSION,
        },
      };
    });
};

export {
  buildTemplateTasks,
  getImportedTemplateTaskKeys,
  getTemplateTaskSourceKey,
  makeUniqueTitle,
};
