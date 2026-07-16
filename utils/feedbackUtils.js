import * as Haptics from 'expo-haptics';
import { HAPTICS_SUPPORTED } from '../constants/app';

const runHaptic = async (operation) => {
  try {
    await operation();
    return true;
  } catch {
    return false;
  }
};

export const triggerImpact = (style) => {
  if (!HAPTICS_SUPPORTED) {
    return Promise.resolve(false);
  }
  return runHaptic(() => Haptics.impactAsync(style));
};

export const triggerSelection = () => {
  if (!HAPTICS_SUPPORTED) {
    return Promise.resolve(false);
  }
  return runHaptic(() => Haptics.selectionAsync());
};

export const triggerSuccessFeedback = async () => {
  if (!HAPTICS_SUPPORTED) {
    return false;
  }
  return runHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
};
