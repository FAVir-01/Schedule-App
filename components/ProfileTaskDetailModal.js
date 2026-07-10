import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { FALLBACK_EMOJI } from '../constants/app';
import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import {
  getQuantumProgressLabel,
  getTaskTagDisplayLabel,
  normalizeRepeatConfig,
} from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { styles } from '../styles/appStyles';

export default function ProfileTaskDetailModal({ visible, task, onClose, onToggleLock, language = 'en' }) {
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
  const tagLabel = getTaskTagDisplayLabel(task) ?? t.sheet.noTag;
  const typeLabel = task.typeLabel ?? task.type ?? 'Standard';
  const isQuantum = task.type === 'quantum';
  const repeatConfig = normalizeRepeatConfig(task.repeat);
  const todayKey = getDateKey(new Date());
  const quantumLabel = isQuantum ? getQuantumProgressLabel(task, todayKey) : null;
  const quantumModeLabel =
    task.quantum?.mode === 'timer' ? 'Timer' : task.quantum?.mode ? 'Cont' : 'Quantum';
  const repeatLabel = repeatConfig.enabled
    ? repeatConfig.frequency === 'daily'
      ? repeatConfig.interval === 1
        ? 'Daily'
        : `Every ${repeatConfig.interval} days`
      : repeatConfig.frequency === 'weekly'
      ? repeatConfig.interval === 1
        ? 'Weekly'
        : `Every ${repeatConfig.interval} weeks`
      : repeatConfig.frequency === 'monthly'
      ? repeatConfig.interval === 1
        ? 'Monthly'
        : `Every ${repeatConfig.interval} months`
      : repeatConfig.frequency === 'weekend'
      ? 'Weekends'
      : repeatConfig.frequency === 'weekdays'
      ? 'Weekdays'
      : repeatConfig.frequency
    : 'One-time';
  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;

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
              accessibilityLabel="Close task details"
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color="#1F2742" />
            </Pressable>
          </View>
          <View style={styles.profileDetailBody}>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Start date</Text>
              <Text style={styles.profileDetailValue}>{dateLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Repeat</Text>
              <Text style={styles.profileDetailValue}>{repeatLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Type</Text>
              <Text style={styles.profileDetailValue}>{typeLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Tag</Text>
              <Text style={styles.profileDetailValue}>{tagLabel}</Text>
            </View>
            {isQuantum ? (
              <View style={styles.profileDetailRow}>
                <Text style={styles.profileDetailLabel}>{quantumModeLabel}</Text>
                <Text style={styles.profileDetailValue}>{quantumLabel ?? t.common.notSet}</Text>
              </View>
            ) : (
              <View style={styles.profileDetailRow}>
                <Text style={styles.profileDetailLabel}>Subtasks</Text>
                <Text style={styles.profileDetailValue}>{totalSubtasks}</Text>
              </View>
            )}
          </View>
          <Pressable
            style={[
              styles.profileDetailLockButton,
              task.profileLocked && styles.profileDetailLockButtonActive,
            ]}
            onPress={() => onToggleLock?.(task.id)}
            accessibilityRole="button"
            accessibilityLabel={task.profileLocked ? 'Unlock task' : 'Lock task'}
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
              {task.profileLocked ? 'Unlock task' : 'Lock task'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
