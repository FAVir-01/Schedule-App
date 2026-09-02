import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { styles } from '../styles/appStyles';

function DiaryPrivacyMask({ hasText = true, hasPhoto = false, editor = false, label, onUnlock }) {
  const handleUnlock = (event) => {
    event?.stopPropagation?.();
    onUnlock?.();
  };

  return (
    <View
      style={[styles.diaryPrivacyMask, editor && styles.diaryPrivacyEditorMask]}
      accessibilityElementsHidden={false}
    >
      <View
        style={styles.diaryPrivacyPlaceholder}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {hasText ? (
          <View style={styles.diaryPrivacyTextPlaceholder}>
            <View style={[styles.diaryPrivacyLine, { width: '94%' }]} />
            <View style={[styles.diaryPrivacyLine, { width: '78%' }]} />
            <View style={[styles.diaryPrivacyLine, { width: '87%' }]} />
          </View>
        ) : null}
        {hasPhoto || editor ? (
          <View style={[styles.diaryPrivacyPhotoPlaceholder, editor && { flex: 1 }]}>
            <Ionicons name="image-outline" size={30} color="#9b96ae" />
          </View>
        ) : null}
      </View>
      <BlurView
        intensity={Platform.OS === 'android' ? 42 : 55}
        tint="light"
        blurMethod="dimezisBlurViewSdk31Plus"
        style={styles.diaryPrivacyBlur}
        pointerEvents="none"
      />
      <Pressable
        style={({ pressed }) => [
          styles.diaryPrivacyUnlockButton,
          pressed && styles.diaryPrivacyUnlockButtonPressed,
        ]}
        onPress={handleUnlock}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="lock-closed" size={18} color="#ffffff" />
      </Pressable>
    </View>
  );
}

export default DiaryPrivacyMask;
