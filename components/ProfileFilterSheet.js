import React from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translations } from '../constants/i18n';
import { FALLBACK_EMOJI } from '../constants/app';
import { styles } from '../styles/appStyles';

// Sheet aberto pelo chip "+N" do Perfil: lista completa de hábitos para
// alimentar o gráfico/stats, incluindo os arquivados (histórico continua útil).
export default function ProfileFilterSheet({
  visible,
  activeTasks,
  archivedTasks,
  selectedId,
  onSelect,
  onTogglePin,
  onClose,
  language = 'en',
}) {
  const t = translations[language] ?? translations.en;

  if (!visible) {
    return null;
  }

  // pinnable = ativa: fixadas viram chips no Perfil (arquivada não vira chip).
  const renderRow = (task, pinnable) => {
    const isSelected = task.id === selectedId;
    const isPinned = Boolean(task.profilePinned);
    return (
      <Pressable
        key={task.id}
        style={styles.profileFilterSheetRow}
        onPress={() => {
          onSelect(isSelected ? null : task.id);
          onClose();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        {task.customImage ? (
          <Image source={{ uri: task.customImage }} style={styles.profileFilterSheetIcon} />
        ) : (
          <Text style={styles.profileFilterSheetEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
        )}
        <Text
          style={[
            styles.profileFilterSheetRowText,
            isSelected && styles.profileFilterSheetRowTextSelected,
          ]}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        {isSelected ? <Ionicons name="checkmark" size={18} color="#3c2ba7" /> : null}
        {pinnable ? (
          <Pressable
            style={styles.profileFilterSheetPinButton}
            onPress={() => onTogglePin?.(task.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              isPinned ? t.profileTasks.unpinFromChart : t.profileTasks.pinToChart
            }
            accessibilityState={{ selected: isPinned }}
          >
            <Ionicons
              name={isPinned ? 'pin' : 'pin-outline'}
              size={18}
              color={isPinned ? '#3c2ba7' : '#9aa3b2'}
            />
          </Pressable>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.profileFilterSheetOverlay}>
        <Pressable
          style={styles.profileFilterSheetBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t.profile.filterSheetClose}
        />
        <View style={styles.profileFilterSheetCard}>
          <View style={styles.profileFilterSheetHandle} />
          <View style={styles.profileFilterSheetHeader}>
            <Text style={styles.profileFilterSheetTitle}>{t.profile.filterSheetTitle}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t.profile.filterSheetClose}
            >
              <Ionicons name="close-circle" size={30} color="#817b96" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Pressable
              style={styles.profileFilterSheetRow}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: !selectedId }}
            >
              <View style={styles.profileFilterSheetOverallIcon}>
                <Ionicons name="stats-chart" size={15} color="#3c2ba7" />
              </View>
              <Text
                style={[
                  styles.profileFilterSheetRowText,
                  !selectedId && styles.profileFilterSheetRowTextSelected,
                ]}
              >
                {t.profile.overallSeries}
              </Text>
              {!selectedId ? <Ionicons name="checkmark" size={18} color="#3c2ba7" /> : null}
            </Pressable>
            {activeTasks.length > 0 ? (
              <Text style={styles.profileTasksSectionHeader}>
                {t.profileTasks.tabActive}
              </Text>
            ) : null}
            {activeTasks.map((task) => renderRow(task, true))}
            {archivedTasks.length > 0 ? (
              <>
                <Text style={styles.profileTasksSectionHeader}>
                  {t.profileTasks.tabArchived}
                </Text>
                {archivedTasks.map((task) => renderRow(task, false))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
