import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { FALLBACK_EMOJI } from '../constants/app';
import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import {
  getQuantumProgressLabel,
  getTaskRepeatDisplayLabel,
  getTaskTagDisplayLabel,
  getTaskTypeDisplayLabel,
  isTaskArchived,
} from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { lightenColor } from '../utils/colorUtils';
import { styles } from '../styles/appStyles';

export default function ProfileTaskDetailModal({
  visible,
  task,
  onClose,
  onToggleLock,
  onToggleArchive,
  onTogglePin,
  onDelete,
  language = 'en',
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const t = translations[language] ?? translations.en;

  useEffect(() => {
    setHasImageError(false);
  }, [task?.customImage, visible]);


  if (!visible || !task) {
    return null;
  }

  const normalizedDate = normalizeDateValue(task.date ?? task.dateKey);
  const dateLabel = normalizedDate ? format(normalizedDate, 'PPP', { locale: getDateLocale(language) }) : t.common.notSet;
  const tagLabel = getTaskTagDisplayLabel(task, t.taskDisplay.tags) ?? t.sheet.noTag;
  const typeLabel = getTaskTypeDisplayLabel(task, t.taskDisplay.types);
  const isQuantum = task.type === 'quantum';
  const todayKey = getDateKey(new Date());
  // "Arquivada" inclui avulsa com data passada — as ações seguem esse estado.
  const archived = isTaskArchived(task, todayKey);
  const quantumLabel = isQuantum ? getQuantumProgressLabel(task, todayKey) : null;
  const quantumModeLabel = t.taskDisplay.quantumModes[task.quantum?.mode]
    ?? t.taskDisplay.quantumModes.quantum;
  const repeatLabel = getTaskRepeatDisplayLabel(task.repeat, t.taskDisplay.repeats);
  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.profileDetailOverlay}>
        <Pressable style={styles.profileDetailBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.profileDetailCard}>
          <View style={styles.profileDetailHeader}>
            <View style={styles.profileDetailHeaderInfo}>
              <View
                style={[
                  styles.profileDetailIconWrap,
                  { backgroundColor: lightenColor(task.color, 0.9) },
                ]}
              >
                {task.customImage && !hasImageError ? (
                  <Image
                    source={{ uri: task.customImage }}
                    style={styles.profileDetailEmojiImage}
                    onError={() => setHasImageError(true)}
                  />
                ) : (
                  <Text style={styles.profileDetailEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
                )}
              </View>
              <View style={styles.profileDetailTitleBlock}>
                <Text style={styles.profileDetailTitle}>{task.title}</Text>
                <Text style={styles.profileDetailTime}>{formatTaskTime(task.time, { language, anytimeLabel: t.sheet.anytime })}</Text>
                {archived ? (
                  <View style={styles.profileDetailArchivedBadge}>
                    <Text style={styles.profileDetailArchivedBadgeText}>
                      {t.profileTasks.archivedBadge}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.profileDetailHeaderButtons}>
              <Pressable
                onPress={() => onTogglePin?.(task.id)}
                accessibilityRole="button"
                accessibilityLabel={
                  task.profilePinned
                    ? t.profileTasks.unpinFromChart
                    : t.profileTasks.pinToChart
                }
                accessibilityState={{ selected: Boolean(task.profilePinned) }}
                hitSlop={8}
              >
                <Ionicons
                  name={task.profilePinned ? 'pin' : 'pin-outline'}
                  size={20}
                  color={task.profilePinned ? '#3c2ba7' : '#59636f'}
                />
              </Pressable>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t.taskDetails.close}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color="#1F2742" />
              </Pressable>
            </View>
          </View>
          <View style={styles.profileDetailInfoCard}>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t.taskDetails.startDate}</Text>
              <Text style={styles.profileDetailValue}>{dateLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t.taskDetails.repeat}</Text>
              <Text style={styles.profileDetailValue}>{repeatLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t.taskDetails.type}</Text>
              <Text style={styles.profileDetailValue}>{typeLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t.taskDetails.tag}</Text>
              <Text style={styles.profileDetailValue}>{tagLabel}</Text>
            </View>
            {isQuantum ? (
              <View style={[styles.profileDetailRow, styles.profileDetailRowLast]}>
                <Text style={styles.profileDetailLabel}>{quantumModeLabel}</Text>
                <Text style={styles.profileDetailValue}>{quantumLabel ?? t.common.notSet}</Text>
              </View>
            ) : (
              <View style={[styles.profileDetailRow, styles.profileDetailRowLast]}>
                <Text style={styles.profileDetailLabel}>{t.taskDetails.subtasks}</Text>
                <Text style={styles.profileDetailValue}>{totalSubtasks}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileDetailActions}>
            <Pressable
              style={[
                styles.profileDetailLockButton,
                task.profileLocked && styles.profileDetailLockButtonActive,
              ]}
              onPress={() => onToggleLock?.(task.id)}
              accessibilityRole="button"
              accessibilityLabel={task.profileLocked ? t.taskDetails.unlock : t.taskDetails.lock}
            >
              <Ionicons
                name={task.profileLocked ? 'lock-closed' : 'lock-open'}
                size={18}
                color={task.profileLocked ? '#fff' : '#3c2ba7'}
              />
              <Text
                style={[
                  styles.profileDetailLockButtonText,
                  task.profileLocked && styles.profileDetailLockButtonTextActive,
                ]}
              >
                {task.profileLocked ? t.taskDetails.unlock : t.taskDetails.lock}
              </Text>
            </Pressable>
          </View>
          <View style={styles.profileDetailActionsSecondary}>
            <Pressable
              style={styles.profileDetailArchiveButton}
              onPress={() => onToggleArchive?.(task.id)}
              accessibilityRole="button"
              accessibilityLabel={
                archived ? t.profileTasks.unarchive : t.profileTasks.archive
              }
            >
              <Ionicons
                name={archived ? 'refresh-outline' : 'archive-outline'}
                size={18}
                color="#3c2ba7"
              />
              <Text style={styles.profileDetailArchiveButtonText}>
                {archived ? t.profileTasks.unarchive : t.profileTasks.archive}
              </Text>
            </Pressable>
            {archived ? (
              // Excluir de vez só depois de arquivar: protege o histórico.
              <Pressable
                style={[
                  styles.profileDetailDeleteButton,
                  task.profileLocked && { opacity: 0.45 },
                ]}
                onPress={() => onDelete?.(task.id)}
                disabled={task.profileLocked}
                accessibilityRole="button"
                accessibilityLabel={t.profileTasks.deleteTask}
              >
                <Ionicons name="trash-outline" size={18} color="#c22929" />
                <Text style={styles.profileDetailDeleteButtonText}>
                  {t.profileTasks.delete}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
