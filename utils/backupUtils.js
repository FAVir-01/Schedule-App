export const BACKUP_FORMAT = 'favit-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_TEXT_LENGTH = 10 * 1024 * 1024;

export const BACKUP_ERROR_CODES = {
  EMPTY: 'empty',
  TOO_LARGE: 'too_large',
  INVALID_JSON: 'invalid_json',
  INVALID_FORMAT: 'invalid_format',
  UNSUPPORTED_VERSION: 'unsupported_version',
  INVALID_DATA: 'invalid_data',
};

const createBackupError = (code) => {
  const error = new Error(`Invalid backup: ${code}`);
  error.code = code;
  return error;
};

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const isObjectArray = (value) => Array.isArray(value) && value.every(isPlainObject);

const hasUniqueTaskIds = (tasks) => {
  const ids = new Set();
  return tasks.every((task) => {
    if (typeof task.id !== 'string' || !task.id.trim() || ids.has(task.id)) {
      return false;
    }
    ids.add(task.id);
    return true;
  });
};

const isValidData = (data) =>
  isPlainObject(data) &&
  isObjectArray(data.tasks) &&
  hasUniqueTaskIds(data.tasks) &&
  (data.userSettings === null || isPlainObject(data.userSettings)) &&
  isObjectArray(data.history) &&
  isPlainObject(data.monthImages) &&
  isPlainObject(data.dayMoods) &&
  isPlainObject(data.moodAppearance);

const isValidMedia = (media) =>
  isPlainObject(media) &&
  media.filesIncluded === false &&
  Array.isArray(media.referencedUris) &&
  media.referencedUris.every((uri) => typeof uri === 'string');

export const parseAppBackupContents = (contents) => {
  if (typeof contents !== 'string' || !contents.trim()) {
    throw createBackupError(BACKUP_ERROR_CODES.EMPTY);
  }
  if (contents.length > MAX_BACKUP_TEXT_LENGTH) {
    throw createBackupError(BACKUP_ERROR_CODES.TOO_LARGE);
  }

  let payload;
  try {
    payload = JSON.parse(contents);
  } catch {
    throw createBackupError(BACKUP_ERROR_CODES.INVALID_JSON);
  }

  if (!isPlainObject(payload) || payload.format !== BACKUP_FORMAT) {
    throw createBackupError(BACKUP_ERROR_CODES.INVALID_FORMAT);
  }
  if (payload.version !== BACKUP_VERSION) {
    throw createBackupError(BACKUP_ERROR_CODES.UNSUPPORTED_VERSION);
  }
  if (
    typeof payload.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(payload.exportedAt)) ||
    !isValidData(payload.data) ||
    !isValidMedia(payload.media)
  ) {
    throw createBackupError(BACKUP_ERROR_CODES.INVALID_DATA);
  }

  const data = payload.data;
  return {
    payload,
    data,
    preview: {
      exportedAt: payload.exportedAt,
      sourcePlatform: typeof payload.platform === 'string' ? payload.platform : null,
      taskCount: data.tasks.length,
      historyCount: data.history.length,
      reflectionCount: Object.keys(data.dayMoods).length,
      monthImageCount: Object.keys(data.monthImages).length,
      moodAppearanceCount: Object.keys(data.moodAppearance).length,
      referencedMediaCount: payload.media.referencedUris.length,
      filesIncluded: payload.media.filesIncluded,
    },
  };
};
