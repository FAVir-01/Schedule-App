import { getDateKey, normalizeDateValue } from './dateUtils';
import { getReflectionPhotos, hasReflectionContent } from './moodUtils';

export const TIMELINE_PAGE_SIZE = 60;

export const ACTIVITY_ENTRY_KINDS = {
  task_created: true,
  task_updated: true,
  task_deleted: true,
  task_completed: true,
  task_uncompleted: true,
  subtask_completed: true,
  subtask_uncompleted: true,
};

export const resolveActivityEntryKind = (entry) => {
  if (entry?.type === 'task_completion_toggled') {
    return entry.details?.completed ? 'task_completed' : 'task_uncompleted';
  }
  if (entry?.type === 'subtask_completion_toggled') {
    return entry.details?.completed ? 'subtask_completed' : 'subtask_uncompleted';
  }
  return entry?.type;
};

export const normalizeTimelineSearchText = (value) =>
  `${value ?? ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();

const getPeriodStart = (period, now) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === '7') {
    start.setDate(start.getDate() - 6);
    return start;
  }
  if (period === '30') {
    start.setDate(start.getDate() - 29);
    return start;
  }
  if (period === 'year') {
    start.setMonth(0, 1);
    return start;
  }
  return null;
};

const getReflectionTimestamp = (dateKey, reflection) => {
  const date = normalizeDateValue(dateKey);
  if (!date) {
    return null;
  }
  const updatedAt = new Date(reflection?.updatedAt);
  if (
    !Number.isNaN(updatedAt.getTime()) &&
    getDateKey(updatedAt) === dateKey
  ) {
    date.setHours(
      updatedAt.getHours(),
      updatedAt.getMinutes(),
      updatedAt.getSeconds(),
      updatedAt.getMilliseconds()
    );
    return date;
  }
  if (!Number.isNaN(updatedAt.getTime()) && !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return updatedAt;
  }
  date.setHours(12, 0, 0, 0);
  return date;
};

const matchesMoodFilter = (level, mood) => {
  if (!mood || mood === 'all') {
    return true;
  }
  const normalizedLevel = Number(level);
  if (mood === 'positive') {
    return normalizedLevel >= 4;
  }
  return normalizedLevel === Number(mood);
};

export const buildSearchableTimelineItems = ({
  history = [],
  dayMoods = {},
  tasks = [],
  query = '',
  scope = 'all',
  period = 'all',
  mood = 'all',
  requireNote = false,
  requirePhoto = false,
  now = new Date(),
  activityLabels = {},
  reflectionLabel = '',
  tagLabels = {},
}) => {
  const titleByTaskId = new Map(
    (Array.isArray(tasks) ? tasks : [])
      .filter((task) => task?.id != null)
      .map((task) => [task.id, task.title])
  );
  const normalizedQuery = normalizeTimelineSearchText(query);
  const periodStart = getPeriodStart(period, now);
  const reflectionOnlyFilters = mood !== 'all' || requireNote || requirePhoto;
  const items = [];

  if (scope !== 'reflection' && !reflectionOnlyFilters) {
    (Array.isArray(history) ? history : []).forEach((entry, index) => {
      const kind = resolveActivityEntryKind(entry);
      if (!ACTIVITY_ENTRY_KINDS[kind]) {
        return;
      }
      const timestamp = new Date(entry?.timestamp);
      if (Number.isNaN(timestamp.getTime()) || (periodStart && timestamp < periodStart)) {
        return;
      }
      const title =
        entry?.details?.title ?? titleByTaskId.get(entry?.details?.taskId) ?? '';
      const searchableText = normalizeTimelineSearchText(
        [title, activityLabels[kind], kind, entry?.details?.dateKey]
          .filter(Boolean)
          .join(' ')
      );
      if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
        return;
      }
      items.push({
        id: `activity-${entry?.id ?? `${timestamp.getTime()}-${index}`}`,
        source: 'activity',
        kind,
        timestamp: timestamp.toISOString(),
        dateKey: getDateKey(timestamp),
        title,
        ...(entry.details?.definitionRecord ? { definitionRecord: entry.details.definitionRecord } : {}),
      });
    });
  }

  if (scope !== 'activity') {
    Object.entries(dayMoods && typeof dayMoods === 'object' ? dayMoods : {}).forEach(
      ([dateKey, reflection]) => {
        if (!hasReflectionContent(reflection)) {
          return;
        }
        const timestamp = getReflectionTimestamp(dateKey, reflection);
        if (!timestamp || (periodStart && timestamp < periodStart)) {
          return;
        }
        const note = `${reflection?.note ?? ''}`.trim();
        const tags = Array.isArray(reflection?.tags)
          ? reflection.tags.filter((tag) => typeof tag === 'string')
          : [];
        if (!matchesMoodFilter(reflection?.level, mood)) {
          return;
        }
        if (requireNote && !note) {
          return;
        }
        const reflectionPhotos = getReflectionPhotos(reflection);
        if (requirePhoto && reflectionPhotos.length === 0) {
          return;
        }
        const localizedTags = tags.map((tag) => tagLabels[tag] ?? tag);
        const searchableText = normalizeTimelineSearchText(
          [note, ...tags, ...localizedTags, reflectionLabel, dateKey].join(' ')
        );
        if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
          return;
        }
        items.push({
          id: `reflection-${dateKey}`,
          source: 'reflection',
          kind: 'reflection',
          timestamp: timestamp.toISOString(),
          dateKey,
          note,
          tags,
          level: Number(reflection?.level) || null,
          hasPhoto: reflectionPhotos.length > 0,
        });
      }
    );
  }

  return items.sort(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)
  );
};
