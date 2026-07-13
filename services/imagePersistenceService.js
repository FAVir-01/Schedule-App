import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  IMAGE_ERROR_CODES,
  getPickedImageExtension,
  validatePickedImageAsset,
} from '../utils/imageUtils';

const createImagePersistenceError = (code, cause) => {
  const error = new Error(code);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
};

const throwIfInvalid = (asset, limits) => {
  const validation = validatePickedImageAsset(asset, limits);
  if (!validation.valid) {
    throw createImagePersistenceError(validation.code);
  }
};

const getSourceFileInfo = async (uri) => {
  try {
    return await FileSystem.getInfoAsync(uri);
  } catch (error) {
    // Alguns ContentProviders permitem copiar a URI, mas não consultar seus
    // metadados. A cópia e o arquivo final ainda serão verificados abaixo.
    return null;
  }
};

const persistPickedImage = async (asset, { prefix, limits = {} } = {}) => {
  throwIfInvalid(asset, limits);

  if (Platform.OS === 'web') {
    return asset.uri;
  }

  const directory = FileSystem.documentDirectory;
  if (!directory) {
    throw createImagePersistenceError(IMAGE_ERROR_CODES.STORAGE_UNAVAILABLE);
  }

  const sourceInfo = await getSourceFileInfo(asset.uri);
  if (sourceInfo && !sourceInfo.exists) {
    throw createImagePersistenceError(IMAGE_ERROR_CODES.SOURCE_UNAVAILABLE);
  }
  const sourceSize = sourceInfo?.exists ? sourceInfo.size : asset.fileSize;
  if (
    limits.maxBytes &&
    Number.isFinite(Number(sourceSize)) &&
    Number(sourceSize) > limits.maxBytes
  ) {
    throw createImagePersistenceError(IMAGE_ERROR_CODES.FILE_TOO_LARGE);
  }

  const safePrefix = String(prefix || 'custom_image').replace(/[^a-zA-Z0-9_-]+/g, '_');
  const extension = getPickedImageExtension(asset);
  const targetUri = `${directory}${safePrefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}.${extension}`;

  try {
    await FileSystem.copyAsync({ from: asset.uri, to: targetUri });
    const targetInfo = await FileSystem.getInfoAsync(targetUri);
    if (!targetInfo.exists || targetInfo.isDirectory || targetInfo.size <= 0) {
      throw createImagePersistenceError(IMAGE_ERROR_CODES.COPY_FAILED);
    }
    if (limits.maxBytes && targetInfo.size > limits.maxBytes) {
      throw createImagePersistenceError(IMAGE_ERROR_CODES.FILE_TOO_LARGE);
    }
    return targetUri;
  } catch (error) {
    await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => {});
    if (error?.code && Object.values(IMAGE_ERROR_CODES).includes(error.code)) {
      throw error;
    }
    throw createImagePersistenceError(IMAGE_ERROR_CODES.COPY_FAILED, error);
  }
};

export { createImagePersistenceError, persistPickedImage };
