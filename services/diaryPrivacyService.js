import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

const CANCELLATION_ERRORS = new Set(['user_cancel', 'system_cancel', 'app_cancel']);
const NOT_CONFIGURED_ERRORS = new Set(['not_enrolled', 'passcode_not_set']);

export async function authenticateDiaryAccess(copy) {
  if (Platform.OS !== 'android') {
    return { success: false, reason: 'unavailable' };
  }

  try {
    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
    if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
      return { success: false, reason: 'not_configured' };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: copy.promptTitle,
      promptSubtitle: copy.promptSubtitle,
      promptDescription: copy.promptDescription,
      cancelLabel: copy.cancel,
      disableDeviceFallback: false,
      requireConfirmation: true,
    });

    if (result.success) {
      return { success: true, reason: null };
    }
    if (CANCELLATION_ERRORS.has(result.error)) {
      return { success: false, reason: 'cancelled' };
    }
    if (NOT_CONFIGURED_ERRORS.has(result.error)) {
      return { success: false, reason: 'not_configured' };
    }
    if (result.error === 'not_available') {
      return { success: false, reason: 'unavailable' };
    }
    return { success: false, reason: 'failed' };
  } catch (error) {
    console.warn('Failed to authenticate private reflections', error);
    return { success: false, reason: 'failed' };
  }
}
