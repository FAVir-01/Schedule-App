import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { translations } from '../constants/i18n';
import { styles } from '../styles/appStyles';

// Configurações do app (idioma, personalização) fora da área principal do
// Profile: abre pela engrenagem do cabeçalho.
function SettingsSheet({
  visible,
  onClose,
  language = 'en',
  privateNotificationContent = true,
  onChangeLanguage,
  onChangePrivateNotificationContent,
  onCustomizeCalendar,
  onExportBackup,
}) {
  const insets = useSafeAreaInsets();
  const t = translations[language] ?? translations.en;
  const [isExporting, setIsExporting] = useState(false);

  const handleExportBackup = useCallback(async () => {
    if (isExporting) {
      return;
    }
    setIsExporting(true);
    try {
      await onExportBackup?.();
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, onExportBackup]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.reportOverlay}>
        <Pressable style={styles.reportBackdrop} onPress={onClose} />
        <View style={[styles.reflectionSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.reflectionHeader}>
            <Text style={styles.reflectionTitle}>{t.profile.settings}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-circle" size={30} color="#c9c6dd" />
            </Pressable>
          </View>

          <View style={styles.settingsContent}>
            <View style={styles.settingsRow}>
              <Ionicons name="language-outline" size={20} color="#3c2ba7" />
              <Text style={styles.settingsRowLabel}>{t.profile.language}</Text>
              <View style={styles.settingsLanguageGroup}>
                {[
                  { key: 'en', label: 'EN' },
                  { key: 'pt', label: 'PT' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.settingsLanguageButton,
                      language === option.key && styles.settingsLanguageButtonActive,
                    ]}
                    onPress={() => onChangeLanguage(option.key)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.settingsLanguageText,
                        language === option.key && styles.settingsLanguageTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.settingsRow}>
              <Ionicons name="notifications-outline" size={20} color="#3c2ba7" />
              <View style={styles.settingsRowTextGroup}>
                <Text style={styles.settingsRowTitle}>
                  {t.notifications.privateContentLabel}
                </Text>
                <Text style={styles.settingsRowHint}>
                  {t.notifications.privateContentHint}
                </Text>
              </View>
              <Switch
                value={privateNotificationContent}
                onValueChange={onChangePrivateNotificationContent}
                trackColor={{ false: '#c9c6dd', true: '#7467c9' }}
                thumbColor={privateNotificationContent ? '#3c2ba7' : '#ffffff'}
                accessibilityLabel={t.notifications.privateContentLabel}
                accessibilityHint={t.notifications.privateContentHint}
              />
            </View>

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => {
                onClose();
                onCustomizeCalendar();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="images-outline" size={20} color="#3c2ba7" />
              <Text style={styles.settingsRowLabel}>{t.profile.customizeCalendar}</Text>
              <Ionicons name="chevron-forward" size={18} color="#9a96b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => Alert.alert(t.privacy.title, t.privacy.message)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.privacy.settingsLabel}
              accessibilityHint={t.privacy.hint}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#3c2ba7" />
              <Text style={styles.settingsRowLabel}>{t.privacy.settingsLabel}</Text>
              <Ionicons name="chevron-forward" size={18} color="#9a96b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsRow, isExporting && styles.settingsRowDisabled]}
              onPress={handleExportBackup}
              activeOpacity={0.7}
              disabled={isExporting}
              accessibilityRole="button"
              accessibilityLabel={t.backup.exportLabel}
              accessibilityHint={t.backup.exportHint}
              accessibilityState={{ disabled: isExporting, busy: isExporting }}
            >
              <Ionicons name="download-outline" size={20} color="#3c2ba7" />
              <Text style={styles.settingsRowLabel}>
                {isExporting ? t.backup.exporting : t.backup.exportLabel}
              </Text>
              {isExporting ? (
                <ActivityIndicator size="small" color="#3c2ba7" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#9a96b8" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default SettingsSheet;
