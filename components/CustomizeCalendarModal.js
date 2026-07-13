import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { getMonthImageSource } from '../constants/months';
import { getDateLocale, translations } from '../constants/i18n';
import { persistPickedImage } from '../services/imagePersistenceService';
import { styles } from '../styles/appStyles';
import { IMAGE_LIMITS, getImageErrorMessage } from '../utils/imageUtils';

// --- COMPONENTE CUSTOMIZE CALENDAR MODAL ---
function CustomizeCalendarModal({ visible, onClose, customImages, onUpdateImage, language = 'en' }) {
  const [loadingMonthIndex, setLoadingMonthIndex] = useState(null);
  const t = translations[language] ?? translations.en;

  if (!visible) return null;

  const handlePickImage = async (index) => {
    if (loadingMonthIndex !== null) {
      return;
    }

    try {
      setLoadingMonthIndex(index);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const persistentUri = await persistPickedImage(asset, {
          prefix: `custom_month_${index}`,
          limits: IMAGE_LIMITS.calendarBackground,
        });
        await onUpdateImage?.(index, persistentUri);
      }
    } catch (error) {
      console.warn('Failed to select or persist calendar image', error);
      Alert.alert(
        t.imageHandling.errorTitle,
        getImageErrorMessage(t.imageHandling, error, IMAGE_LIMITS.calendarBackground)
      );
    } finally {
      setLoadingMonthIndex(null);
    }
  };

  const monthLabels = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(2026, index, 1);
    return format(monthDate, 'MMMM', { locale: getDateLocale(language) }).toUpperCase();
  });

  return (
    <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.customizeModalContainer}>
        <View style={styles.customizeHeader}>
          <Text style={styles.customizeTitle}>{t.profile.customizeCalendarModalTitle}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#1a1a2e" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.customizeScrollContent} showsVerticalScrollIndicator={false}>
          {monthLabels.map((name, index) => {
            const source = getMonthImageSource(index, customImages);

            return (
              <View key={name} style={styles.customizeRow}>
                <ImageBackground
                  source={source}
                  style={styles.customizeCard}
                  imageStyle={{ borderRadius: 16 }}
                >
                  {/* Overlay removido aqui */}
                  <Text style={styles.customizeCardText}>{name}</Text>
                </ImageBackground>

                <TouchableOpacity
                  style={styles.customizeAddButton}
                  activeOpacity={0.7}
                  onPress={() => handlePickImage(index)}
                  disabled={loadingMonthIndex !== null}
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: loadingMonthIndex === index,
                    disabled: loadingMonthIndex !== null,
                  }}
                >
                  {loadingMonthIndex === index ? (
                    <ActivityIndicator size="small" color="#3c2ba7" />
                  ) : (
                    <Ionicons name="add" size={24} color="#3c2ba7" />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default CustomizeCalendarModal;
