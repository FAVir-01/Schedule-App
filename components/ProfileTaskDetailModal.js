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
} from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { normalizePeriodGoal } from '../utils/periodGoalUtils';
import { styles } from '../styles/appStyles';

export default function ProfileTaskDetailModal({
  visible,
  task,
  onClose,
  onToggleLock,
  onEditPeriodGoal,
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
  const quantumLabel = isQuantum ? getQuantumProgressLabel(task, todayKey) : null;
  const quantumModeLabel = t.taskDisplay.quantumModes[task.quantum?.mode]
    ?? t.taskDisplay.quantumModes.quantum;
  const repeatLabel = getTaskRepeatDisplayLabel(task.repeat, t.taskDisplay.repeats);
  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
  const periodGoal = normalizePeriodGoal(task.periodGoal);
  const periodGoalLabel = periodGoal
    ? (periodGoal.target === 1
        ? periodGoal.period === 'weekly'
          ? t.periodGoal.targetPerWeekOne
          : t.periodGoal.targetPerMonthOne
        : periodGoal.period === 'weekly'
          ? t.periodGoal.targetPerWeek
          : t.periodGoal.targetPerMonth
      ).replace('{target}', String(periodGoal.target))
    : t.common.notSet;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.profileDetailOverlay}>
        <Pressable style={styles.profileDetailBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.profileDetailCard}>
          <View style={styles.profileDetailHeader}>
            <View style={styles.profileDetailHeaderInfo}>
              {task.customImage && !hasImageError ? (
                <Image
                  source={{ uri: task.customImage }}
                  style={styles.profileDetailEmojiImage}
                  onError={() => setHasImageError(true)}
                />
              ) : (
                <Text style={styles.profileDetailEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
              )}
              <View style={styles.profileDetailTitleBlock}>
                <Text style={styles.profileDetailTitle}>{task.title}</Text>
                <Text style={styles.profileDetailTime}>{formatTaskTime(task.time, { language, anytimeLabel: t.sheet.anytime })}</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t.taskDetails.close}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color="#1F2742" />
            </Pressable>
          </View>
          <View style={styles.profileDetailBody}>
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
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>{t.taskDetails.periodGoal}</Text>
              <Text style={styles.profileDetailValue}>{periodGoalLabel}</Text>
            </View>
            {isQuantum ? (
              <View style={styles.profileDetailRow}>
                <Text style={styles.profileDetailLabel}>{quantumModeLabel}</Text>
                <Text style={styles.profileDetailValue}>{quantumLabel ?? t.common.notSet}</Text>
              </View>
            ) : (
              <View style={styles.profileDetailRow}>
                <Text style={styles.profileDetailLabel}>{t.taskDetails.subtasks}</Text>
                <Text style={styles.profileDetailValue}>{totalSubtasks}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileDetailActions}>
            <Pressable
              style={styles.profileDetailGoalButton}
              onPress={() => onEditPeriodGoal?.(task.id)}
              accessibilityRole="button"
              accessibilityLabel={periodGoal ? t.periodGoal.editGoal : t.periodGoal.setGoal}
            >
              <Ionicons name="flag-outline" size={18} color="#3c2ba7" />
              <Text style={styles.profileDetailGoalButtonText}>
                {periodGoal ? t.periodGoal.editGoal : t.periodGoal.setGoal}
              </Text>
            </Pressable>
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
        </View>
      </View>
    </Modal>
  );
}
