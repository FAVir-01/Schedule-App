import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { FALLBACK_EMOJI } from '../constants/app';
import { lightenColor } from '../utils/colorUtils';
import { normalizeDateValue } from '../utils/dateUtils';
import {
  getQuantumProgressLabel,
  getSubtaskCompletionStatus,
  getTaskFinishedCount,
  getTaskStreak,
} from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { styles } from '../styles/appStyles';

export default function TaskDetailModal({
  language = 'en',
  visible,
  task,
  dateKey,
  onClose,
  onToggleSubtask,
  onToggleCompletion,
  onEdit,
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const t = translations[language] ?? translations.en;

  useEffect(() => {
    setHasImageError(false);
  }, [task?.customImage, visible]);

  const streak = useMemo(
    () => (visible && task ? getTaskStreak(task) : 0),
    [task, visible]
  );
  const finished = useMemo(
    () => (visible && task ? getTaskFinishedCount(task) : 0),
    [task, visible]
  );

  if (!visible || !task) {
    return null;
  }

  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
  const completedSubtasks = Array.isArray(task.subtasks)
    ? task.subtasks.filter((item) => getSubtaskCompletionStatus(item, dateKey)).length
    : 0;
  const quantumLabel = getQuantumProgressLabel(task, dateKey);
  const isReminder = task.type === 'reminder';
  const cardBackground = lightenColor(task.color, 0.85);
  const endDate = normalizeDateValue(task.repeat?.endDate);
  const endDateLabel = endDate
    ? format(endDate, 'PPP', { locale: getDateLocale(language) })
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.detailOverlay}>
        <Pressable style={styles.detailBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.detailCardContainer}>
          <View style={[styles.detailCard, { backgroundColor: cardBackground, borderColor: task.color }]}>
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailHeaderInfo}>
              {task.customImage && !hasImageError ? (
                <Image
                  source={{ uri: task.customImage }}
                  style={styles.detailEmojiImage}
                  onError={() => setHasImageError(true)}
                />
              ) : (
                <Text style={styles.detailEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
              )}
              <View style={styles.detailTitleContainer}>
                <Text style={styles.detailTitle}>
                  {task.title}{' '}
                  <Ionicons
                    name={task.profileLocked ? 'lock-closed' : 'lock-open-outline'}
                    size={14}
                    color="#626b78"
                    style={styles.detailTitleLock}
                  />
                </Text>
                <Text style={styles.detailTime}>{formatTaskTime(task.time, { language, anytimeLabel: t.sheet.anytime })}</Text>
                <View style={styles.detailStatsRow}>
                  <Text style={styles.detailStatText}>{`${t.taskModal.streak}: ${streak}`}</Text>
                  <Text style={styles.detailStatText}>{`${t.taskDetails.finished}: ${finished}`}</Text>
                </View>
                {endDateLabel ? (
                  <Text style={styles.detailEndDateText}>
                    {`${t.sheet.endDate}: ${endDateLabel}`}
                  </Text>
                ) : null}
                {quantumLabel ? (
                  <Text style={styles.detailSubtaskSummaryLabel}>{quantumLabel}</Text>
                ) : !isReminder && totalSubtasks > 0 ? (
                    <Text style={styles.detailSubtaskSummaryLabel}>
                      {t.taskModal.subtasksCompleted
                        .replace('{completed}', String(completedSubtasks))
                        .replace('{total}', String(totalSubtasks))}
                    </Text>
                  ) : null}
                </View>
              </View>
              {task.type !== 'reminder' && (
                <Pressable
                  onPress={() => {
                    onToggleCompletion?.(task.id);
                  }}
                  style={[styles.detailToggle, task.completed && styles.detailToggleCompleted]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: task.completed }}
                  accessibilityLabel={
                    task.completed
                      ? t.taskModal.markTaskIncomplete
                      : t.taskModal.markTaskComplete
                  }
                >
                  {task.completed && <Ionicons name="checkmark" size={18} color="#fff" />}
                </Pressable>
              )}
            </View>
            <ScrollView style={styles.detailSubtasksContainer}>
              {totalSubtasks === 0 ? (
                <Text style={styles.detailEmptySubtasks}>
                  {isReminder ? t.taskModal.noReminders : t.taskModal.noSubtasks}
                </Text>
              ) : isReminder ? (
                task.subtasks.map((subtask) => (
                  <View key={subtask.id} style={styles.detailSubtaskRow}>
                    <Text style={styles.detailSubtaskText}>{subtask.title}</Text>
                  </View>
                ))
              ) : (
                task.subtasks.map((subtask) => (
                  <Pressable
                    key={subtask.id}
                    style={styles.detailSubtaskRow}
                    onPress={() => onToggleSubtask?.(task.id, subtask.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: getSubtaskCompletionStatus(subtask, dateKey) }}
                    accessibilityLabel={
                      getSubtaskCompletionStatus(subtask, dateKey)
                        ? t.taskModal.markSubtaskIncomplete.replace('{title}', subtask.title)
                        : t.taskModal.markSubtaskComplete.replace('{title}', subtask.title)
                    }
                  >
                    <View
                      style={[
                        styles.detailSubtaskIndicator,
                        getSubtaskCompletionStatus(subtask, dateKey) &&
                          styles.detailSubtaskIndicatorCompleted,
                      ]}
                    >
                      {getSubtaskCompletionStatus(subtask, dateKey) && (
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.detailSubtaskText,
                        getSubtaskCompletionStatus(subtask, dateKey) &&
                          styles.detailSubtaskTextCompleted,
                      ]}
                    >
                      {subtask.title}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable
              style={styles.detailEditLink}
              onPress={() => onEdit?.(task.id)}
              accessibilityRole="button"
              accessibilityLabel={t.taskModal.editTask}
            >
              <View style={styles.detailEditContent}>
                <Ionicons name="create-outline" size={18} color="#3c2ba7" />
                <Text style={styles.detailEditButtonText}>{t.taskModal.editTask}</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
