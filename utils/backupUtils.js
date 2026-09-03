export const BACKUP_FORMAT = 'favit-backup';
// 2: tarefas passaram a guardar `schedule` (agendamento versionado).
// 3: o backup virou uma pasta e passou a levar as fotos junto, descritas em
//    `media.files`. Sem isso, trocar de aparelho perdia toda a mídia: o JSON
//    só guardava caminhos locais que não existem no aparelho novo.
export const BACKUP_VERSION = 3;
export const MAX_BACKUP_TEXT_LENGTH = 10 * 1024 * 1024;
export const BACKUP_MEDIA_DIRECTORY = 'media';

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

const isValidMediaEntry = (entry) =>
  isPlainObject(entry) &&
  typeof entry.fileName === 'string' &&
  Boolean(entry.fileName) &&
  typeof entry.originalUri === 'string' &&
  Boolean(entry.originalUri);

const isValidMedia = (media) =>
  isPlainObject(media) &&
  typeof media.filesIncluded === 'boolean' &&
  Array.isArray(media.referencedUris) &&
  media.referencedUris.every((uri) => typeof uri === 'string') &&
  // `files` só existe a partir da versão 3; backups antigos continuam válidos.
  (media.files === undefined ||
    (Array.isArray(media.files) && media.files.every(isValidMediaEntry)));

// Nome do arquivo dentro da pasta `media/` do backup. As imagens gravadas pelo
// app já nascem com nome único (`persistPickedImage`), então o nome base serve
// como identidade estável entre exportar e importar.
export const getMediaFileName = (uri) => {
  if (typeof uri !== 'string' || !uri) {
    return null;
  }
  const withoutQuery = uri.split('?')[0].split('#')[0];
  const name = withoutQuery.split('/').pop();
  if (!name) {
    return null;
  }
  // URIs de ContentProvider podem terminar em id numérico sem extensão.
  return /\.[a-z0-9]+$/i.test(name) ? name : null;
};

// Manifesto: uma entrada por mídia referenciada, com nome de arquivo garantido
// único dentro da pasta. Sem essa garantia, duas fotos de origens diferentes
// com o mesmo nome base se sobrescreveriam na exportação.
export const buildMediaManifest = (referencedUris) => {
  const files = [];
  const usedNames = new Set();
  const seenUris = new Set();

  (referencedUris ?? []).forEach((uri) => {
    if (typeof uri !== 'string' || !uri || seenUris.has(uri)) {
      return;
    }
    seenUris.add(uri);
    const base = getMediaFileName(uri) ?? 'media.bin';
    let fileName = base;
    let counter = 1;
    while (usedNames.has(fileName)) {
      const dot = base.lastIndexOf('.');
      fileName =
        dot > 0
          ? `${base.slice(0, dot)}_${counter}${base.slice(dot)}`
          : `${base}_${counter}`;
      counter += 1;
    }
    usedNames.add(fileName);
    files.push({ fileName, originalUri: uri });
  });

  return files;
};

// Caminho inverso na importação: da URI antiga (que não existe mais neste
// aparelho) para o arquivo que veio dentro da pasta do backup.
export const createMediaManifestLookup = (files) => {
  const byOriginalUri = new Map();
  (files ?? []).forEach((entry) => {
    if (isValidMediaEntry(entry)) {
      byOriginalUri.set(entry.originalUri, entry.fileName);
    }
  });
  return byOriginalUri;
};

// Um migrador por salto de versão, aplicados em cadeia até a versão atual.
// Sem isso, toda mudança de formato transformaria o backup de quem já usa o
// app em "versão não suportada".
const BACKUP_MIGRATIONS = {
  // O `schedule` de cada tarefa é derivado de `repeat`/`time` na importação
  // (`normalizeStoredTasks`), então o payload em si atravessa inalterado.
  1: (payload) => ({ ...payload, version: 2 }),
  // Backup antigo não tem pasta de mídia: segue importável, só sem as fotos —
  // exatamente o comportamento que ele já tinha.
  2: (payload) => ({
    ...payload,
    version: 3,
    media: {
      filesIncluded: false,
      referencedUris: [],
      ...(isPlainObject(payload.media) ? payload.media : {}),
      files: [],
    },
  }),
};

export const migrateBackupPayload = (payload) => {
  let current = payload;
  let guard = 0;
  while (current.version !== BACKUP_VERSION) {
    const migrate = BACKUP_MIGRATIONS[current.version];
    if (!migrate || guard > 50) {
      throw createBackupError(BACKUP_ERROR_CODES.UNSUPPORTED_VERSION);
    }
    current = migrate(current);
    guard += 1;
  }
  return current;
};

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
  if (!Number.isInteger(payload.version) || payload.version > BACKUP_VERSION) {
    throw createBackupError(BACKUP_ERROR_CODES.UNSUPPORTED_VERSION);
  }
  const migrated = migrateBackupPayload(payload);
  if (
    typeof migrated.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(migrated.exportedAt)) ||
    !isValidData(migrated.data) ||
    !isValidMedia(migrated.media)
  ) {
    throw createBackupError(BACKUP_ERROR_CODES.INVALID_DATA);
  }

  const data = migrated.data;
  return {
    payload: migrated,
    data,
    preview: {
      exportedAt: migrated.exportedAt,
      sourcePlatform: typeof migrated.platform === 'string' ? migrated.platform : null,
      taskCount: data.tasks.length,
      historyCount: data.history.length,
      reflectionCount: Object.keys(data.dayMoods).length,
      monthImageCount: Object.keys(data.monthImages).length,
      moodAppearanceCount: Object.keys(data.moodAppearance).length,
      referencedMediaCount: migrated.media.referencedUris.length,
      filesIncluded: migrated.media.filesIncluded,
      bundledMediaCount: Array.isArray(migrated.media.files)
        ? migrated.media.files.length
        : 0,
    },
  };
};
