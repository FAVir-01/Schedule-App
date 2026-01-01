import { getDateKey } from './dateUtils';
import { clamp01 } from './mathUtils';
import { formatDuration } from './timeUtils';

const getTaskCompletionStatus = (task, date) => {
  if (!task || !date) {
    return false;
  }

  const dateKey = typeof date === 'string' ? date : getDateKey(date);
  if (!dateKey) {
    return false;
  }

  if (task.completedDates && typeof task.completedDates === 'object') {
    return Boolean(task.completedDates[dateKey]);
  }

  return false;
};

const getSubtaskCompletionStatus = (subtask, dateKey) => {
  if (!subtask) {
    return false;
  }

  if (dateKey && subtask.completedDates && typeof subtask.completedDates === 'object') {
    if (subtask.completedDates[dateKey] === true) {
      return true;
    }
    if (subtask.completedDates[dateKey] === false) {
      return false;
    }
  }

  if (dateKey) {
    return false;
  }

  return Boolean(subtask.completed);
};

const getQuantumProgressLabel = (task) => {
  if (!task || task.type !== 'quantum' || !task.quantum) {
    return null;
  }
  const mode = task.quantum.mode;
  if (mode === 'timer') {
    const minutes = task.quantum.timer?.minutes ?? 0;
    const seconds = task.quantum.timer?.seconds ?? 0;
    const limitSeconds = minutes * 60 + seconds;
    if (!limitSeconds) {
      return null;
    }
    const doneSeconds =
      typeof task.quantum.doneSeconds === 'number' ? task.quantum.doneSeconds : 0;
    return `${formatDuration(doneSeconds)}/${formatDuration(limitSeconds)}`;
  }
  if (mode === 'count') {
    const limitValue = task.quantum.count?.value ?? 0;
    if (!limitValue) {
      return null;
    }
    const unit = task.quantum.count?.unit?.trim() ?? '';
    const doneValue =
      typeof task.quantum.doneCount === 'number' ? task.quantum.doneCount : 0;
    return `${doneValue}/${limitValue}${unit ? ` ${unit}` : ''}`;
  }
  return null;
};

const getQuantumProgressPercent = (task) => {
  if (!task || task.type !== 'quantum' || !task.quantum) {
    return 0;
  }
  const mode = task.quantum.mode;
  if (mode === 'timer') {
    const minutes = task.quantum.timer?.minutes ?? 0;
    const seconds = task.quantum.timer?.seconds ?? 0;
    const totalSeconds = minutes * 60 + seconds;
    if (!totalSeconds) {
      return 0;
    }
    const doneSeconds =
      typeof task.quantum.doneSeconds === 'number' ? task.quantum.doneSeconds : 0;
    return clamp01(doneSeconds / totalSeconds);
  }

  if (mode === 'count') {
    const limitValue = task.quantum.count?.value ?? 0;
    if (!limitValue) {
      return 0;
    }
    const doneCount = typeof task.quantum.doneCount === 'number' ? task.quantum.doneCount : 0;
    return clamp01(doneCount / limitValue);
  }

  return 0;
};

const normalizeTaskTagKey = (task) => {
  if (!task) {
    return null;
  }
  if (task.tag && typeof task.tag === 'string') {
    const normalized = task.tag.trim();
    if (!normalized || normalized.toLowerCase() === 'none' || normalized.toLowerCase() === 'no_tag') {
      return null;
    }
    return normalized;
  }
  if (task.tagLabel && typeof task.tagLabel === 'string') {
    const label = task.tagLabel.trim();
    if (!label || label.toLowerCase() === 'no tag') {
      return null;
    }
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
  return null;
};

const getTaskTagDisplayLabel = (task) => {
  if (!task) {
    return null;
  }
  if (task.tagLabel && typeof task.tagLabel === 'string') {
    const label = task.tagLabel.trim();
    if (!label || label.toLowerCase() === 'no tag') {
      return null;
    }
    return label;
  }
  if (task.tag && typeof task.tag === 'string') {
    const normalized = task.tag.trim();
    if (!normalized || normalized.toLowerCase() === 'none' || normalized.toLowerCase() === 'no_tag') {
      return null;
    }
    return normalized
      .split('_')
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }
  return null;
};

export {
  getQuantumProgressLabel,
  getQuantumProgressPercent,
  getSubtaskCompletionStatus,
  getTaskCompletionStatus,
  getTaskTagDisplayLabel,
  normalizeTaskTagKey,
};
