import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { lightenColor } from '../utils/colorUtils';
import { normalizeDateValue } from '../utils/dateUtils';
import {
  getQuantumProgressLabel,
  getSubtaskCompletionStatus,
  getTaskLatestFinishedMilestone,
  getTaskStreak,
} from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { styles } from '../styles/appStyles';
import FinishedMilestoneBadge from './FinishedMilestoneBadge';
import PolaroidFrame from './PolaroidFrame';
import TaskPhotoSheet from './TaskPhotoSheet';

export default function TaskDetailModal({
  language = 'en',
  visible,
  task,
  dateKey,
  onClose,
  onToggleSubtask,
  onToggleCompletion,
  onUpdateNotes,
  onEdit,
  reduceMotion = false,
}) {
  const insets = useSafeAreaInsets();
  const originRef = useRef(null);
  const photoRef = useRef(null);
  // Um valor só para a aba inteira: a foto, a folha, o backdrop e o recuo do
  // card são recortes do mesmo percurso, então não têm como sair de fase.
  const photoProgress = useRef(new Animated.Value(0)).current;
  const [hasImageError, setHasImageError] = useState(false);
  const [photoFlight, setPhotoFlight] = useState(null);
  const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState(false);
  const t = translations[language] ?? translations.en;

  useEffect(() => {
    setHasImageError(false);
  }, [task?.customImage, visible]);

  // Mede a moldura no card no instante do toque: é dela que a foto parte.
  // Duas medidas com o mesmo método (a marca de origem e a moldura) para a
  // diferença cancelar qualquer deslocamento da janela do Modal no Android.
  const openPhotoSheet = useCallback(() => {
    const origin = originRef.current;
    const photo = photoRef.current;
    if (!origin || !photo) {
      return;
    }
    origin.measureInWindow((originX, originY) => {
      photo.measureInWindow((x, y, width, height) => {
        if (!width || !height) {
          return;
        }
        setPhotoFlight({ x: x - originX, y: y - originY, w: width, h: height });
        setIsPhotoSheetOpen(true);
      });
    });
  }, []);

  const closePhotoSheet = useCallback(() => setIsPhotoSheetOpen(false), []);
  const handlePhotoSheetClosed = useCallback(() => setPhotoFlight(null), []);

  // Trocar de tarefa ou fechar o card não pode deixar a aba pendurada.
  useEffect(() => {
    setIsPhotoSheetOpen(false);
    setPhotoFlight(null);
  }, [task?.id, visible]);

  // Com a aba aberta, o backdrop e o botão voltar fecham só a aba — o card
  // continua onde estava.
  const handleClose = useCallback(() => {
    if (isPhotoSheetOpen) {
      closePhotoSheet();
      return;
    }
    onClose?.();
  }, [closePhotoSheet, isPhotoSheetOpen, onClose]);

  const streak = useMemo(
    () => (visible && task ? getTaskStreak(task) : 0),
    [task, visible]
  );
  const finishedMilestone = useMemo(
    () => (visible && task ? getTaskLatestFinishedMilestone(task) : null),
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
      onRequestClose={handleClose}
    >
      <View style={styles.detailRoot}>
      {/* Marca de origem: referência fixa para medir a moldura do card. */}
      <View ref={originRef} style={styles.detailOriginMarker} pointerEvents="none" />
      <KeyboardAvoidingView
        style={styles.detailOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.detailBackdrop} onPress={handleClose} accessibilityRole="button" />
        <View
          style={[
            styles.detailCardContainer,
            { paddingBottom: Math.max(28, insets.bottom + 16) },
          ]}
        >
          {/* O card recua enquanto a aba assume: sem isso a folha parece um
              painel estranho passando por cima, não a mesma tarefa se abrindo. */}
          <Animated.View
            style={[
              styles.detailCard,
              { backgroundColor: cardBackground, borderColor: task.color },
              {
                opacity: photoProgress.interpolate({
                  inputRange: [0, 0.6],
                  outputRange: [1, 0.3],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    scale: photoProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.93],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailHeaderInfo}>
              <Pressable
                ref={photoRef}
                onPress={openPhotoSheet}
                // Enquanto a foto está voando, a do card sai de cena: são a
                // mesma fotografia, não duas.
                style={[styles.detailPhotoTouch, photoFlight && styles.detailPhotoTouchFlying]}
                accessibilityRole="button"
                accessibilityLabel={t.taskModal.openPhoto}
              >
                <PolaroidFrame
                  size={96}
                  task={task}
                  hasImageError={hasImageError}
                  onImageError={() => setHasImageError(true)}
                />
              </Pressable>
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
                {streak > 0 ? (
                  <View style={styles.detailStreakRow}>
                    <Ionicons name="flame" size={14} color="#f2732e" />
                    <Text style={styles.detailStreakText}>
                      {`${t.taskModal.streak}: ${streak} ${streak === 1 ? t.profile.day : t.profile.days}`}
                    </Text>
                  </View>
                ) : null}
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
            <View style={styles.detailFooterRow}>
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
              {finishedMilestone ? (
                <FinishedMilestoneBadge
                  value={finishedMilestone}
                  message={String(finishedMilestone)}
                  animateOnMount
                  messageSide="left"
                  reduceMotion={reduceMotion}
                  accessibilityLabel={t.taskCard.finishedMilestoneAccessibility.replace(
                    '{count}',
                    String(finishedMilestone)
                  )}
                  style={styles.detailFinishedMilestoneBadge}
                />
              ) : null}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      <TaskPhotoSheet
        progress={photoProgress}
        visible={isPhotoSheetOpen}
        task={task}
        dateKey={dateKey}
        flight={photoFlight}
        language={language}
        reduceMotion={reduceMotion}
        topInset={insets.top}
        bottomInset={insets.bottom}
        hasImageError={hasImageError}
        onImageError={() => setHasImageError(true)}
        onUpdateNotes={onUpdateNotes}
        onClose={closePhotoSheet}
        onClosed={handlePhotoSheetClosed}
      />
      </View>
    </Modal>
  );
}
