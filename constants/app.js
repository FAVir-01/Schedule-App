import { Platform } from 'react-native';

export const USE_NATIVE_DRIVER = Platform.OS !== 'web';
export const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';
export const NOTIFICATIONS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';
export const FALLBACK_EMOJI = '📝';
export const DEFAULT_REPEAT_CONFIG = { enabled: true, frequency: 'daily', interval: 1 };
export const REMINDER_OFFSETS = {
  none: null,
  at_time: 0,
  '5m': -5,
  '15m': -15,
  '30m': -30,
  '1h': -60,
};
