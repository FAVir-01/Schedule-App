export const MAX_RECENT_ACTIVITY_ENTRIES = 200;

const getNonEmptyTitle = (value) =>
  typeof value === 'string' && value.trim() ? value : null;

export const createTaskHistoryDetails = (task, details = {}) => {
  const taskId = details.taskId ?? task?.id;
  const title = getNonEmptyTitle(details.title) ?? getNonEmptyTitle(task?.title);

  return {
    ...details,
    ...(taskId != null ? { taskId } : {}),
    ...(title ? { title } : {}),
  };
};

export const backfillTaskTitlesInHistory = (history, tasks) => {
  if (!Array.isArray(history) || !Array.isArray(tasks) || tasks.length === 0) {
    return history;
  }

  const titleByTaskId = new Map(
    tasks
      .map((task) => [task?.id, getNonEmptyTitle(task?.title)])
      .filter(([taskId, title]) => taskId != null && title)
  );

  if (titleByTaskId.size === 0) {
    return history;
  }

  let didChange = false;
  const nextHistory = history.map((entry) => {
    const details = entry?.details;
    if (!details || getNonEmptyTitle(details.title)) {
      return entry;
    }

    const title = titleByTaskId.get(details.taskId);
    if (!title) {
      return entry;
    }

    didChange = true;
    return {
      ...entry,
      details: {
        ...details,
        title,
      },
    };
  });

  return didChange ? nextHistory : history;
};

export const pruneSelectedTaskIds = (selectedTaskIds, tasks) => {
  if (!Array.isArray(selectedTaskIds) || selectedTaskIds.length === 0) {
    return selectedTaskIds;
  }

  const existingTaskIds = new Set((tasks ?? []).map((task) => task?.id));
  const nextSelectedTaskIds = selectedTaskIds.filter((taskId) =>
    existingTaskIds.has(taskId)
  );

  return nextSelectedTaskIds.length === selectedTaskIds.length
    ? selectedTaskIds
    : nextSelectedTaskIds;
};
