const MEGABYTE = 1024 * 1024;

const IMAGE_ERROR_CODES = {
  INVALID_ASSET: 'invalid-asset',
  UNSUPPORTED_TYPE: 'unsupported-type',
  FILE_TOO_LARGE: 'file-too-large',
  DIMENSIONS_TOO_LARGE: 'dimensions-too-large',
  SOURCE_UNAVAILABLE: 'source-unavailable',
  STORAGE_UNAVAILABLE: 'storage-unavailable',
  COPY_FAILED: 'copy-failed',
};

const IMAGE_LIMITS = {
  habitIcon: { maxBytes: 8 * MEGABYTE, maxDimension: 4096 },
  moodAppearance: { maxBytes: 8 * MEGABYTE, maxDimension: 4096 },
  reflectionPhoto: { maxBytes: 10 * MEGABYTE, maxDimension: 4096 },
  calendarBackground: { maxBytes: 12 * MEGABYTE, maxDimension: 4096 },
};

const SUPPORTED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'heif',
  'bmp',
]);

const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
};

const getPositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const validatePickedImageAsset = (asset, limits = {}) => {
  if (!asset || typeof asset.uri !== 'string' || !asset.uri.trim()) {
    return { valid: false, code: IMAGE_ERROR_CODES.INVALID_ASSET };
  }

  if (
    (asset.type && asset.type !== 'image') ||
    (asset.mimeType && !asset.mimeType.toLowerCase().startsWith('image/'))
  ) {
    return { valid: false, code: IMAGE_ERROR_CODES.UNSUPPORTED_TYPE };
  }

  const maxBytes = getPositiveNumber(limits.maxBytes);
  const fileSize = getPositiveNumber(asset.fileSize);
  if (maxBytes && fileSize && fileSize > maxBytes) {
    return { valid: false, code: IMAGE_ERROR_CODES.FILE_TOO_LARGE };
  }

  const maxDimension = getPositiveNumber(limits.maxDimension);
  const width = getPositiveNumber(asset.width);
  const height = getPositiveNumber(asset.height);
  if (maxDimension && ((width && width > maxDimension) || (height && height > maxDimension))) {
    return { valid: false, code: IMAGE_ERROR_CODES.DIMENSIONS_TOO_LARGE };
  }

  return { valid: true, code: null };
};

const extractExtension = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const cleanValue = value.split(/[?#]/)[0];
  const match = cleanValue.match(/\.([a-zA-Z0-9]+)$/);
  if (!match) {
    return null;
  }
  const extension = match[1].toLowerCase();
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : null;
};

const isGifImageUri = (uri) => extractExtension(uri) === 'gif';

const getPickedImageExtension = (asset) => {
  const fileExtension = extractExtension(asset?.fileName);
  if (fileExtension) {
    return fileExtension === 'jpeg' ? 'jpg' : fileExtension;
  }

  const uriExtension = extractExtension(asset?.uri);
  if (uriExtension) {
    return uriExtension === 'jpeg' ? 'jpg' : uriExtension;
  }

  const mimeType = asset?.mimeType?.toLowerCase();
  return MIME_EXTENSIONS[mimeType] ?? 'jpg';
};

const formatImageSizeLimit = (maxBytes) => {
  const bytes = getPositiveNumber(maxBytes);
  if (!bytes) {
    return '';
  }
  const megabytes = bytes / MEGABYTE;
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${megabytes.toFixed(1)} MB`;
};

const getImageErrorMessage = (strings, error, limits = {}) => {
  const text = strings ?? {};
  switch (error?.code) {
    case IMAGE_ERROR_CODES.FILE_TOO_LARGE:
      return (text.fileTooLarge ?? text.genericError ?? '')
        .replace('{maxSize}', formatImageSizeLimit(limits.maxBytes));
    case IMAGE_ERROR_CODES.DIMENSIONS_TOO_LARGE:
      return (text.dimensionsTooLarge ?? text.genericError ?? '')
        .replace('{maxDimension}', String(limits.maxDimension ?? ''));
    case IMAGE_ERROR_CODES.UNSUPPORTED_TYPE:
      return text.unsupportedType ?? text.genericError ?? '';
    case IMAGE_ERROR_CODES.SOURCE_UNAVAILABLE:
      return text.sourceUnavailable ?? text.genericError ?? '';
    case IMAGE_ERROR_CODES.STORAGE_UNAVAILABLE:
      return text.storageUnavailable ?? text.genericError ?? '';
    default:
      return text.genericError ?? '';
  }
};

export {
  IMAGE_ERROR_CODES,
  IMAGE_LIMITS,
  formatImageSizeLimit,
  getImageErrorMessage,
  getPickedImageExtension,
  isGifImageUri,
  validatePickedImageAsset,
};
