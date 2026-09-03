import { requireOptionalNativeModule } from 'expo';
import { normalizeRecognizedText } from '../utils/textRecognitionUtils';

export const TEXT_RECOGNITION_ERROR_CODES = {
  INVALID_IMAGE: 'INVALID_IMAGE',
  UNAVAILABLE: 'UNAVAILABLE',
  FAILED: 'FAILED',
};

const nativeTextRecognition = requireOptionalNativeModule('FavitTextRecognition');

const createTextRecognitionError = (code, cause) => {
  const error = new Error(code);
  error.code = code;
  error.cause = cause;
  return error;
};

export const recognizeTextFromImage = async (imageUri, language = 'en') => {
  if (typeof imageUri !== 'string' || !imageUri.trim()) {
    throw createTextRecognitionError(TEXT_RECOGNITION_ERROR_CODES.INVALID_IMAGE);
  }
  if (typeof nativeTextRecognition?.recognizeText !== 'function') {
    throw createTextRecognitionError(TEXT_RECOGNITION_ERROR_CODES.UNAVAILABLE);
  }

  try {
    const text = await nativeTextRecognition.recognizeText(imageUri, language);
    return normalizeRecognizedText(text);
  } catch (error) {
    if (error?.code === 'ERR_TEXT_IMAGE_UNAVAILABLE') {
      throw createTextRecognitionError(
        TEXT_RECOGNITION_ERROR_CODES.INVALID_IMAGE,
        error
      );
    }
    throw createTextRecognitionError(TEXT_RECOGNITION_ERROR_CODES.FAILED, error);
  }
};
