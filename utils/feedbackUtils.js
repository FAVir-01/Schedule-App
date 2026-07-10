import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HAPTICS_SUPPORTED } from '../constants/app';

export const triggerImpact = (style) => {
  if (!HAPTICS_SUPPORTED) {
    return;
  }
  try {
    void Haptics.impactAsync(style);
  } catch (error) {
    // Ignore web environments without haptics support
  }
};

export const triggerSelection = () => {
  if (!HAPTICS_SUPPORTED) {
    return;
  }
  try {
    void Haptics.selectionAsync();
  } catch (error) {
    // Ignore web environments without haptics support
  }
};

let expoAvModulePromise = null;

const loadExpoAvAudio = async () => {
  if (Platform.OS === 'web') {
    return null;
  }
  if (!expoAvModulePromise) {
    expoAvModulePromise = import('expo-av');
  }
  return expoAvModulePromise;
};

export const triggerSuccessFeedback = async () => {
  if (HAPTICS_SUPPORTED) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log('Unable to trigger success haptics', error);
    }
  }

  if (Platform.OS === 'web') {
    return;
  }

  try {
    const avModule = await loadExpoAvAudio();
    const Audio = avModule?.Audio;
    if (!Audio?.Sound?.createAsync) {
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://www.soundjay.com/buttons/sounds/button-30.mp3' },
      { shouldPlay: true, volume: 0.25 }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
  } catch (error) {
    console.log('Unable to play success sound', error);
  }
};
