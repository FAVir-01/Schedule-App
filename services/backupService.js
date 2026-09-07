import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getRawStorageSnapshot } from '../storage';
import {
  BACKUP_FORMAT,
  BACKUP_MEDIA_DIRECTORY,
  BACKUP_VERSION,
  buildMediaManifest,
  createMediaManifestLookup,
  parseAppBackupContents,
} from '../utils/backupUtils';
import {
  getReflectionPhotos,
  toReflectionPhotoFields,
} from '../utils/moodUtils';

const MAX_BACKUP_CANDIDATES = 25;

const getBackupBaseName = (exportedAt) => `favit-backup-${exportedAt.replace(/[:.]/g, '-')}`;

const getBackupFileName = (exportedAt) => `${getBackupBaseName(exportedAt)}.json`;

const getMediaMimeType = (fileName) => {
  const extension = `${fileName}`.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  return 'image/jpeg';
};

const getReferencedMediaUris = ({ tasks, monthImages, dayMoods, moodAppearance, notes }) => {
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
    getReflectionPhotos(mood).forEach((uri) => {
      uris.add(uri);
    });
  });
  Object.values(moodAppearance ?? {}).forEach((uri) => {
    if (typeof uri === 'string') {
      uris.add(uri);
    }
  });
  (notes ?? []).forEach((note) => {
    (Array.isArray(note?.images) ? note.images : []).forEach((uri) => {
      if (typeof uri === 'string') {
        uris.add(uri);
      }
    });
  });
  return Array.from(uris);
};

const downloadBackupOnWeb = (contents, fileName, mimeType = 'application/json') => {
  if (
    typeof globalThis.Blob !== 'function' ||
    typeof globalThis.URL?.createObjectURL !== 'function' ||
    !globalThis.document?.createElement
  ) {
    throw new Error('Web file download is unavailable');
  }
  const blob = new globalThis.Blob([contents], { type: mimeType });
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

// Copia uma foto do diretório do app para dentro da pasta `media/` do backup.
// O caminho é `createFileAsync` + escrita em base64 porque é o único que deixa
// o nome do arquivo sob nosso controle — e o manifesto depende desse nome para
// reencontrar a foto na importação.
const copyMediaFileToBundle = async (mediaDirUri, sourceUri, fileName) => {
  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
    mediaDirUri,
    fileName,
    getMediaMimeType(fileName)
  );
  await FileSystem.StorageAccessFramework.writeAsStringAsync(targetUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return targetUri;
};

// O backup virou uma pasta: o JSON sozinho só guardava caminhos locais, que
// deixam de existir ao trocar de aparelho ou reinstalar o app.
// As mídias são copiadas ANTES de o JSON ser escrito: o manifesto só promete
// arquivos que realmente entraram na pasta, senão a importação sairia
// procurando foto que nunca foi copiada.
const saveBackupOnAndroid = async (buildContents, baseName, mediaManifest) => {
  const permissions =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    return { status: 'cancelled' };
  }

  const bundleUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
    permissions.directoryUri,
    baseName
  );

  const copiedManifest = [];
  let failedMediaCount = 0;
  if (mediaManifest.length > 0) {
    const mediaDirUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(
      bundleUri,
      BACKUP_MEDIA_DIRECTORY
    );
    // Sequencial de propósito: cada foto vira uma string base64 na memória, e
    // paralelizar dezenas delas derruba o app em aparelho modesto.
    for (const entry of mediaManifest) {
      try {
        await copyMediaFileToBundle(mediaDirUri, entry.originalUri, entry.fileName);
        copiedManifest.push(entry);
      } catch (error) {
        // Uma foto ilegível não pode custar o backup inteiro.
        console.warn('Failed to copy backup media', entry.fileName, error);
        failedMediaCount += 1;
      }
    }
  }

  const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
    bundleUri,
    `${baseName}.json`,
    'application/json'
  );
  await FileSystem.StorageAccessFramework.writeAsStringAsync(
    fileUri,
    buildContents(copiedManifest),
    { encoding: FileSystem.EncodingType.UTF8 }
  );

  return {
    status: 'saved',
    uri: bundleUri,
    fileUri,
    copiedMediaCount: copiedManifest.length,
    failedMediaCount,
  };
};

const decodeFileUri = (uri) => {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
};

const getBackupCandidateUris = (uris) => {
  const jsonUris = (uris ?? []).filter((uri) =>
    decodeFileUri(uri).toLowerCase().endsWith('.json')
  );
  return jsonUris
    .sort((left, right) => {
      const leftName = decodeFileUri(left).toLowerCase();
      const rightName = decodeFileUri(right).toLowerCase();
      const leftPreferred = leftName.includes('favit-backup');
      const rightPreferred = rightName.includes('favit-backup');
      if (leftPreferred !== rightPreferred) {
        return leftPreferred ? -1 : 1;
      }
      return rightName.localeCompare(leftName);
    })
    .slice(0, MAX_BACKUP_CANDIDATES);
};

const readDirectorySafely = async (dirUri) => {
  try {
    return await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
  } catch {
    // Não é diretório (ou não é legível): tratado como arquivo comum.
    return null;
  }
};

// A partir da versão 3 o backup é uma pasta, então a varredura desce um nível.
// Arquivos JSON soltos continuam aceitos: é o formato das versões 1 e 2, que
// ainda estão no aparelho de quem já exportou antes.
const collectBackupCandidates = async (rootUri) => {
  const rootEntries = (await readDirectorySafely(rootUri)) ?? [];
  const candidates = getBackupCandidateUris(rootEntries).map((uri) => ({
    jsonUri: uri,
    mediaUris: [],
  }));

  const directoryEntries = rootEntries.filter(
    (uri) => !decodeFileUri(uri).toLowerCase().endsWith('.json')
  );
  for (const entryUri of directoryEntries.slice(0, MAX_BACKUP_CANDIDATES)) {
    const children = await readDirectorySafely(entryUri);
    if (!children) {
      continue;
    }
    const [jsonUri] = getBackupCandidateUris(children);
    if (!jsonUri) {
      continue;
    }
    const mediaDirUri = children.find((uri) => {
      const decoded = decodeFileUri(uri);
      return decoded.split('/').pop() === BACKUP_MEDIA_DIRECTORY;
    });
    const mediaUris = mediaDirUri ? (await readDirectorySafely(mediaDirUri)) ?? [] : [];
    candidates.push({ jsonUri, mediaUris });
  }

  return candidates.slice(0, MAX_BACKUP_CANDIDATES);
};

export const selectLatestAppBackupFromDirectory = async () => {
  if (Platform.OS !== 'android') {
    return { status: 'unsupported' };
  }
  const permissions =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    return { status: 'cancelled' };
  }
  const candidates = await collectBackupCandidates(permissions.directoryUri);
  for (const candidate of candidates) {
    try {
      const contents = await FileSystem.readAsStringAsync(candidate.jsonUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = parseAppBackupContents(contents);
      return {
        status: 'selected',
        uri: candidate.jsonUri,
        bundleMediaUris: candidate.mediaUris,
        fileName: decodeFileUri(candidate.jsonUri).split('/').pop(),
        ...parsed,
      };
    } catch {
      // Ignora JSONs que não sejam backups válidos e tenta o próximo arquivo.
    }
  }
  return { status: 'not_found' };
};

// Traz a foto de dentro da pasta do backup para o diretório do app. O nome do
// arquivo é preservado porque a limpeza de órfãos casa referências pelo nome
// base — renomear aqui faria a foto recém-restaurada ser apagada como órfã.
const restoreMediaFromBundle = async (bundleUri, fileName) => {
  const directory = FileSystem.documentDirectory;
  if (!directory) {
    return null;
  }
  const targetUri = `${directory}${fileName}`;
  const alreadyThere = await FileSystem.getInfoAsync(targetUri)
    .then((info) => Boolean(info.exists))
    .catch(() => false);
  if (alreadyThere) {
    return targetUri;
  }
  await FileSystem.copyAsync({ from: bundleUri, to: targetUri });
  const info = await FileSystem.getInfoAsync(targetUri);
  if (!info.exists || info.isDirectory || info.size <= 0) {
    throw new Error(`Restored media is unusable: ${fileName}`);
  }
  return targetUri;
};

const createMediaResolver = ({ mediaFiles, bundleMediaUris }) => {
  const availability = new Map();
  const missingUris = new Set();
  const restoredByUri = new Map();
  const manifestLookup = createMediaManifestLookup(mediaFiles);
  // Nome do arquivo -> URI dele dentro da pasta do backup.
  const bundleByName = new Map();
  (bundleMediaUris ?? []).forEach((uri) => {
    const name = decodeFileUri(uri).split('/').pop();
    if (name) {
      bundleByName.set(name, uri);
    }
  });

  const doResolve = async (uri) => {
    // 1) O arquivo ainda existe neste aparelho (restauração na mesma máquina).
    if (!availability.has(uri)) {
      const exists = await FileSystem.getInfoAsync(uri)
        .then((info) => Boolean(info.exists))
        .catch(() => false);
      availability.set(uri, exists);
    }
    if (availability.get(uri)) {
      return uri;
    }
    // 2) Veio dentro da pasta do backup: é o caso da troca de aparelho.
    const fileName = manifestLookup.get(uri);
    const bundleUri = fileName ? bundleByName.get(fileName) : null;
    if (bundleUri) {
      try {
        const restoredUri = await restoreMediaFromBundle(bundleUri, fileName);
        if (restoredUri) {
          restoredByUri.set(uri, restoredUri);
          return restoredUri;
        }
      } catch (error) {
        console.warn('Failed to restore backup media', fileName, error);
      }
    }
    // 3) Não existe em lugar nenhum: a referência é limpa e o usuário avisado.
    missingUris.add(uri);
    return null;
  };

  // A mesma URI costuma aparecer em vários registros (a foto de um humor
  // reaproveitada, por exemplo). Guardar a PROMESSA, e não o resultado, evita
  // que duas resoluções simultâneas copiem o mesmo arquivo ao mesmo tempo.
  const inFlight = new Map();
  const resolve = (uri) => {
    if (typeof uri !== 'string' || !uri) {
      return Promise.resolve(null);
    }
    if (!inFlight.has(uri)) {
      inFlight.set(uri, doResolve(uri));
    }
    return inFlight.get(uri);
  };

  return {
    resolve,
    getMissingCount: () => missingUris.size,
    getRestoredCount: () => restoredByUri.size,
  };
};

export const prepareImportedBackupData = async (data, options = {}) => {
  const resolver = createMediaResolver({
    mediaFiles: options.mediaFiles ?? [],
    bundleMediaUris: options.bundleMediaUris ?? [],
  });
  const resolveAvailableMediaUri = (uri) => resolver.resolve(uri);
  const tasks = await Promise.all(
    data.tasks.map(async (task) => ({
      ...task,
      customImage: await resolveAvailableMediaUri(task.customImage),
    }))
  );
  const monthImageEntries = await Promise.all(
    Object.entries(data.monthImages).map(async ([key, uri]) => [
      key,
      await resolveAvailableMediaUri(uri),
    ])
  );
  const moodAppearanceEntries = await Promise.all(
    Object.entries(data.moodAppearance).map(async ([key, uri]) => [
      key,
      await resolveAvailableMediaUri(uri),
    ])
  );
  const dayMoodEntries = await Promise.all(
    Object.entries(data.dayMoods).map(async ([key, mood]) => {
      if (!mood || typeof mood !== 'object' || Array.isArray(mood)) {
        return [key, mood];
      }
      const resolvedPhotos = await Promise.all(
        getReflectionPhotos(mood).map(resolveAvailableMediaUri)
      );
      return [
        key,
        {
          ...mood,
          image: await resolveAvailableMediaUri(mood.image),
          ...toReflectionPhotoFields(resolvedPhotos.filter(Boolean)),
        },
      ];
    })
  );
  const notes = Array.isArray(data.notes)
    ? await Promise.all(
        data.notes.map(async (note) => {
          const resolvedImages = await Promise.all(
            (Array.isArray(note?.images) ? note.images : []).map(resolveAvailableMediaUri)
          );
          const { images: _oldImages, ...base } = note;
          const availableImages = resolvedImages.filter(Boolean);
          return {
            ...base,
            ...(availableImages.length ? { images: availableImages } : {}),
          };
        })
      )
    : null;

  return {
    data: {
      ...data,
      tasks,
      monthImages: Object.fromEntries(
        monthImageEntries.filter(([, uri]) => Boolean(uri))
      ),
      dayMoods: Object.fromEntries(dayMoodEntries),
      moodAppearance: Object.fromEntries(
        moodAppearanceEntries.filter(([, uri]) => Boolean(uri))
      ),
      ...(notes ? { notes } : {}),
    },
    missingMediaCount: resolver.getMissingCount(),
    restoredMediaCount: resolver.getRestoredCount(),
  };
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

// Exportação do diário em .txt: um arquivo só, sem pasta e sem mídia. O
// objetivo aqui não é restaurar o app, é a pessoa conseguir LER o que escreveu
// fora dele — então segue o caminho simples de gravação em cada plataforma.
export const exportDiaryTextFile = async ({ contents, fileName }) => {
  if (Platform.OS === 'android') {
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      return { status: 'cancelled' };
    }
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/plain'
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, contents, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return { status: 'saved', uri: fileUri, fileName };
  }

  if (Platform.OS === 'ios') {
    return { ...(await shareBackupOnIos(contents, fileName)), fileName };
  }

  if (Platform.OS === 'web') {
    downloadBackupOnWeb(contents, fileName, 'text/plain');
    return { status: 'saved', fileName };
  }

  const shareResult = await Share.share({ title: fileName, message: contents });
  return {
    status: shareResult.action === Share.dismissedAction ? 'cancelled' : 'shared',
    fileName,
  };
};

export const exportAppBackup = async ({
  tasks,
  userSettings,
  history,
  monthImages,
  dayMoods,
  moodAppearance,
  notes,
  loadFailures = {},
}) => {
  const exportedAt = new Date().toISOString();
  const baseName = getBackupBaseName(exportedAt);
  const fileName = getBackupFileName(exportedAt);
  const rawStorage = await getRawStorageSnapshot();
  const referencedMediaUris = getReferencedMediaUris({
    tasks,
    monthImages,
    dayMoods,
    moodAppearance,
    notes,
  });
  const includesRecoveryData =
    Object.values(loadFailures).some(Boolean) ||
    Object.keys(rawStorage ?? {}).some((key) => key.endsWith('_corrupt_backup'));
  const buildContents = (mediaFiles) =>
    JSON.stringify(
      {
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
          notes: notes ?? [],
        },
        recovery: {
          loadFailures,
          rawStorage,
        },
        media: {
          filesIncluded: mediaFiles.length > 0,
          referencedUris: referencedMediaUris,
          files: mediaFiles,
        },
      },
      null,
      2
    );
  const mediaManifest = buildMediaManifest(referencedMediaUris);

  let result;
  if (Platform.OS === 'android') {
    result = await saveBackupOnAndroid(buildContents, baseName, mediaManifest);
  } else {
    // Fora do Android o backup continua sendo um JSON só, sem as fotos: a
    // pasta depende do Storage Access Framework, que é específico da
    // plataforma. O manifesto vazio deixa isso explícito no arquivo.
    const contents = buildContents([]);
    if (Platform.OS === 'ios') {
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
  }

  return {
    ...result,
    fileName,
    includesRecoveryData,
    referencedMediaCount: referencedMediaUris.length,
  };
};
