import React from 'react';
import {
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';
import { getMonthImageSource } from '../constants/months';
import { getDateLocale, translations } from '../constants/i18n';
import { styles } from '../styles/appStyles';

// --- COMPONENTE CUSTOMIZE CALENDAR MODAL ---
function CustomizeCalendarModal({ visible, onClose, customImages, onUpdateImage, language = 'en' }) {
  if (!visible) return null;

  const handlePickImage = async (index) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const selectedUri = asset.uri;

        if (Platform.OS === 'web') {
          onUpdateImage(index, selectedUri);
          return;
        }

        const extension = selectedUri.split('.').pop().split(/\#|\?/)[0] || 'jpg';
        const fileName = `custom_month_${index}_${Date.now()}.${extension}`;
        const newPath = FileSystem.documentDirectory + fileName;

        await FileSystem.copyAsync({
          from: selectedUri,
          to: newPath,
        });

        onUpdateImage(index, newPath);
      }
    } catch (error) {
      console.log('Erro ao selecionar imagem:', error);
      alert('Não foi possível carregar a imagem.');
    }
  };

  const t = translations[language] ?? translations.en;

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
                >
                   <Ionicons name="add" size={24} color="#3c2ba7" />
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
