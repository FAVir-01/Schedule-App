import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
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
  protectPrivateReflections = false,
  isDiaryUnlocked = false,
  onChangeLanguage,
  onChangePrivateNotificationContent,
  onChangeDiaryProtection,
  onLockDiaryNow,
  onCustomizeCalendar,
  onExportBackup,
  onImportBackup,
  onExportDiaryText,
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const t = translations[language] ?? translations.en;
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingDiary, setIsExportingDiary] = useState(false);
  const [isDiaryAuthBusy, setIsDiaryAuthBusy] = useState(false);
  const [shouldTestErrorBoundary, setShouldTestErrorBoundary] = useState(false);
  // Navegação em dois níveis dentro da mesma folha: empilhar outro Modal por
  // cima deste é frágil no Android, e a volta precisa ser instantânea.
  const [section, setSection] = useState('root');

  // Reabrir as Configurações sempre começa na raiz: voltar para uma subseção
  // que o usuário já deixou seria um estado surpresa.
  useEffect(() => {
    if (!visible) {
      setSection('root');
    }
  }, [visible]);

  const handleExportBackup = useCallback(async () => {
    if (isExporting || isImporting) {
      return;
    }
    setIsExporting(true);
    try {
      await onExportBackup?.();
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, isImporting, onExportBackup]);

  const handleImportBackup = useCallback(async () => {
    if (isExporting || isImporting) {
      return;
    }
    setIsImporting(true);
    try {
      await onImportBackup?.();
    } finally {
      setIsImporting(false);
    }
  }, [isExporting, isImporting, onImportBackup]);

  const handleExportDiaryText = useCallback(async () => {
    if (isExportingDiary) {
      return;
    }
    setIsExportingDiary(true);
    try {
      await onExportDiaryText?.();
    } finally {
      setIsExportingDiary(false);
    }
  }, [isExportingDiary, onExportDiaryText]);

  const isBackupBusy = isExporting || isImporting;
  const isDiarySection = section === 'diaryPrivacy';
  const isExportSection = section === 'export';
  const isSubsection = isDiarySection || isExportSection;

  const handleChangeDiaryProtection = useCallback(
    async (value) => {
      if (isDiaryAuthBusy) {
        return;
      }
      setIsDiaryAuthBusy(true);
      try {
        await onChangeDiaryProtection?.(value);
      } finally {
        setIsDiaryAuthBusy(false);
      }
    },
    [isDiaryAuthBusy, onChangeDiaryProtection]
  );

  if (__DEV__ && shouldTestErrorBoundary) {
    throw new Error('Intentional development error boundary test');
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.reportOverlay}>
        <Pressable style={styles.reportBackdrop} onPress={onClose} />
        <View
          style={[
            styles.reflectionSheet,
            { maxHeight: height * 0.9, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.reflectionHeader}>
            <View style={styles.settingsHeaderGroup}>
              {isSubsection ? (
                <Pressable
                  onPress={() => setSection('root')}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t.common.back}
                >
                  <Ionicons name="chevron-back" size={24} color="#1a1a2e" />
                </Pressable>
              ) : null}
              <Text style={styles.reflectionTitle}>
                {isDiarySection
                  ? t.diaryPrivacy.sectionLabel
                  : isExportSection
                    ? t.backup.exportSectionLabel
                    : t.profile.settings}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-circle" size={30} color="#817b96" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.settingsScroll}
            contentContainerStyle={styles.settingsContent}
            showsVerticalScrollIndicator={false}
          >
            {isDiarySection ? (
              <>
                <Text style={styles.settingsSectionIntro}>
                  {t.diaryPrivacy.sectionIntro}
                </Text>

                <View style={styles.settingsRow}>
                  <Ionicons name="lock-closed-outline" size={20} color="#3c2ba7" />
                  <View style={styles.settingsRowTextGroup}>
                    <Text style={styles.settingsRowTitle}>
                      {t.diaryPrivacy.settingLabel}
                    </Text>
                    <Text style={styles.settingsRowHint}>
                      {t.diaryPrivacy.settingHint}
                    </Text>
                  </View>
                  <Switch
                    value={protectPrivateReflections}
                    onValueChange={handleChangeDiaryProtection}
                    disabled={isDiaryAuthBusy}
                    trackColor={{ false: '#817b96', true: '#7467c9' }}
                    thumbColor={protectPrivateReflections ? '#3c2ba7' : '#ffffff'}
                    accessibilityLabel={t.diaryPrivacy.settingLabel}
                    accessibilityHint={t.diaryPrivacy.settingHint}
                    accessibilityState={{ busy: isDiaryAuthBusy }}
                  />
                </View>

                {protectPrivateReflections && isDiaryUnlocked ? (
                  <TouchableOpacity
                    style={styles.settingsRow}
                    onPress={onLockDiaryNow}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.diaryPrivacy.lockNow}
                    accessibilityHint={t.diaryPrivacy.lockNowHint}
                  >
                    <Ionicons name="lock-closed" size={20} color="#3c2ba7" />
                    <View style={styles.settingsRowTextGroup}>
                      <Text style={styles.settingsRowTitle}>
                        {t.diaryPrivacy.lockNow}
                      </Text>
                      <Text style={styles.settingsRowHint}>
                        {t.diaryPrivacy.lockNowHint}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#68637f" />
                  </TouchableOpacity>
                ) : null}
              </>
            ) : isExportSection ? (
              <>
                <Text style={styles.settingsSectionIntro}>
                  {t.backup.exportSectionIntro}
                </Text>

                <TouchableOpacity
                  style={[styles.settingsRow, isBackupBusy && styles.settingsRowDisabled]}
                  onPress={handleExportBackup}
                  activeOpacity={0.7}
                  disabled={isBackupBusy}
                  accessibilityRole="button"
                  accessibilityLabel={t.backup.exportLabel}
                  accessibilityHint={t.backup.exportHint}
                  accessibilityState={{ disabled: isBackupBusy, busy: isExporting }}
                >
                  <Ionicons name="download-outline" size={20} color="#3c2ba7" />
                  <View style={styles.settingsRowTextGroup}>
                    <Text style={styles.settingsRowTitle}>
                      {isExporting ? t.backup.exporting : t.backup.exportLabel}
                    </Text>
                    <Text style={styles.settingsRowHint}>{t.backup.exportHint}</Text>
                  </View>
                  {isExporting ? (
                    <ActivityIndicator size="small" color="#3c2ba7" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#68637f" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.settingsRow, isExportingDiary && styles.settingsRowDisabled]}
                  onPress={handleExportDiaryText}
                  activeOpacity={0.7}
                  disabled={isExportingDiary}
                  accessibilityRole="button"
                  accessibilityLabel={t.diaryExport.label}
                  accessibilityHint={t.diaryExport.hint}
                  accessibilityState={{ disabled: isExportingDiary, busy: isExportingDiary }}
                >
                  <Ionicons name="document-text-outline" size={20} color="#3c2ba7" />
                  <View style={styles.settingsRowTextGroup}>
                    <Text style={styles.settingsRowTitle}>
                      {isExportingDiary ? t.diaryExport.exporting : t.diaryExport.label}
                    </Text>
                    <Text style={styles.settingsRowHint}>{t.diaryExport.hint}</Text>
                  </View>
                  {isExportingDiary ? (
                    <ActivityIndicator size="small" color="#3c2ba7" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#68637f" />
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
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

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => setSection('diaryPrivacy')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.diaryPrivacy.sectionLabel}
              accessibilityHint={t.diaryPrivacy.sectionHint}
            >
              <Ionicons
                name={protectPrivateReflections ? 'lock-closed' : 'lock-open-outline'}
                size={20}
                color="#3c2ba7"
              />
              <View style={styles.settingsRowTextGroup}>
                <Text style={styles.settingsRowTitle}>{t.diaryPrivacy.sectionLabel}</Text>
                <Text style={styles.settingsRowHint}>
                  {protectPrivateReflections
                    ? t.diaryPrivacy.stateOn
                    : t.diaryPrivacy.stateOff}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#68637f" />
            </TouchableOpacity>

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
                trackColor={{ false: '#817b96', true: '#7467c9' }}
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
              <Ionicons name="chevron-forward" size={18} color="#68637f" />
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
              <Ionicons name="chevron-forward" size={18} color="#68637f" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => setSection('export')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.backup.exportSectionLabel}
              accessibilityHint={t.backup.exportSectionHint}
            >
              <Ionicons name="download-outline" size={20} color="#3c2ba7" />
              <View style={styles.settingsRowTextGroup}>
                <Text style={styles.settingsRowTitle}>
                  {t.backup.exportSectionLabel}
                </Text>
                <Text style={styles.settingsRowHint}>
                  {t.backup.exportSectionHint}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#68637f" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsRow, isBackupBusy && styles.settingsRowDisabled]}
              onPress={handleImportBackup}
              activeOpacity={0.7}
              disabled={isBackupBusy}
              accessibilityRole="button"
              accessibilityLabel={t.backup.importLabel}
              accessibilityHint={t.backup.importHint}
              accessibilityState={{ disabled: isBackupBusy, busy: isImporting }}
            >
              <Ionicons name="folder-open-outline" size={20} color="#3c2ba7" />
              <Text style={styles.settingsRowLabel}>
                {isImporting ? t.backup.importing : t.backup.importLabel}
              </Text>
              {isImporting ? (
                <ActivityIndicator size="small" color="#3c2ba7" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#68637f" />
              )}
            </TouchableOpacity>

            {__DEV__ ? (
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={() => setShouldTestErrorBoundary(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.developer.errorBoundaryLabel}
                accessibilityHint={t.developer.errorBoundaryHint}
              >
                <Ionicons name="bug-outline" size={20} color="#a23b3b" />
                <Text style={styles.settingsRowLabel}>
                  {t.developer.errorBoundaryLabel}
                </Text>
                <Ionicons name="warning-outline" size={18} color="#a23b3b" />
              </TouchableOpacity>
            ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default SettingsSheet;
