import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getRawStorageSnapshot } from '../storage';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../utils/backupUtils';

const getBackupFileName = (exportedAt) =>
  `favit-backup-${exportedAt.replace(/[:.]/g, '-')}.json`;

const getReferencedMediaUris = ({ tasks, monthImages, dayMoods, moodAppearance }) => {
  const uris = new Set();
  (tasks ?? []).forEach((task) => {
    if (typeof task?.customImage === 'string') {
      uris.add(task.customImage);
    }
  });
  Object.values(monthImages ?? {}).forEach((uri) => {
    if (typeof uri === 'string') {
      uris.add(uri);
    }
  });
  Object.values(dayMoods ?? {}).forEach((mood) => {
    if (typeof mood?.image === 'string') {
      uris.add(mood.image);
    }
    if (typeof mood?.photo === 'string') {
      uris.add(mood.photo);
    }
  });
  Object.values(moodAppearance ?? {}).forEach((uri) => {
    if (typeof uri === 'string') {
      uris.add(uri);
    }
  });
  return Array.from(uris);
};

const downloadBackupOnWeb = (contents, fileName) => {
  if (
    typeof globalThis.Blob !== 'function' ||
    typeof globalThis.URL?.createObjectURL !== 'function' ||
    !globalThis.document?.createElement
  ) {
    throw new Error('Web file download is unavailable');
  }
  const blob = new globalThis.Blob([contents], { type: 'application/json' });
  const objectUrl = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  globalThis.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(objectUrl), 0);
};

const saveBackupOnAndroid = async (contents, fileName) => {
  const permissions =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    return { status: 'cancelled' };
  }
  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    fileName,
    'application/json'
  );
  await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { status: 'saved', uri: fileUri };
};

const shareBackupOnIos = async (contents, fileName) => {
  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!directory) {
    throw new Error('Local file directory is unavailable');
  }
  const fileUri = `${directory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    const result = await Share.share(
      { title: fileName, url: fileUri },
      { subject: fileName }
    );
    return {
      status: result.action === Share.dismissedAction ? 'cancelled' : 'shared',
      uri: fileUri,
    };
  } finally {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  }
};

export const exportAppBackup = async ({
  tasks,
  userSettings,
  history,
  monthImages,
  dayMoods,
  moodAppearance,
  loadFailures = {},
}) => {
  const exportedAt = new Date().toISOString();
  const fileName = getBackupFileName(exportedAt);
  const rawStorage = await getRawStorageSnapshot();
  const referencedMediaUris = getReferencedMediaUris({
    tasks,
    monthImages,
    dayMoods,
    moodAppearance,
  });
  const includesRecoveryData =
    Object.values(loadFailures).some(Boolean) ||
    Object.keys(rawStorage ?? {}).some((key) => key.endsWith('_corrupt_backup'));
  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    platform: Platform.OS,
    data: {
      tasks: tasks ?? [],
      userSettings: userSettings ?? null,
      history: history ?? [],
      monthImages: monthImages ?? {},
      dayMoods: dayMoods ?? {},
      moodAppearance: moodAppearance ?? {},
    },
    recovery: {
      loadFailures,
      rawStorage,
    },
    media: {
      filesIncluded: false,
      referencedUris: referencedMediaUris,
    },
  };
  const contents = JSON.stringify(payload, null, 2);

  let result;
  if (Platform.OS === 'android') {
    result = await saveBackupOnAndroid(contents, fileName);
  } else if (Platform.OS === 'ios') {
    result = await shareBackupOnIos(contents, fileName);
  } else if (Platform.OS === 'web') {
    downloadBackupOnWeb(contents, fileName);
    result = { status: 'saved' };
  } else {
    const shareResult = await Share.share({ title: fileName, message: contents });
    result = {
      status: shareResult.action === Share.dismissedAction ? 'cancelled' : 'shared',
    };
  }

  return {
    ...result,
    fileName,
    includesRecoveryData,
    referencedMediaCount: referencedMediaUris.length,
  };
};
