import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translations } from '../constants/i18n';
import {
  MAX_PERIOD_GOAL_TARGET,
  calculatePeriodGoalProgress,
  normalizePeriodGoal,
} from '../utils/periodGoalUtils';

const replaceValues = (template, values) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    `${template ?? ''}`
  );

const getGoalTargetLabel = (labels, goal) => {
  const template = goal.target === 1
    ? goal.period === 'weekly'
      ? labels.targetPerWeekOne
      : labels.targetPerMonthOne
    : goal.period === 'weekly'
      ? labels.targetPerWeek
      : labels.targetPerMonth;
  return replaceValues(template, { target: goal.target });
};

export function PeriodGoalSummaryCard({
  task,
  language = 'en',
  referenceDate = new Date(),
  onEdit,
}) {
  const labels = (translations[language] ?? translations.en).periodGoal;
  const progress = useMemo(
    () => calculatePeriodGoalProgress({ task, referenceDate }),
    [referenceDate, task]
  );

  if (!task) {
    return null;
  }

  if (!progress) {
    return (
      <View style={localStyles.emptyCard}>
        <View style={localStyles.emptyIcon}>
          <Ionicons name="flag-outline" size={22} color="#3c2ba7" />
        </View>
        <View style={localStyles.emptyText}>
          <Text style={localStyles.emptyTitle}>{labels.noGoalTitle}</Text>
          <Text style={localStyles.emptyDescription}>{labels.noGoalDescription}</Text>
        </View>
        <Pressable
          style={localStyles.compactButton}
          onPress={() => onEdit?.(task.id)}
          accessibilityRole="button"
          accessibilityLabel={labels.setGoal}
        >
          <Text style={localStyles.compactButtonText}>{labels.setGoal}</Text>
        </Pressable>
      </View>
    );
  }

  const periodTitle = progress.period === 'weekly' ? labels.weeklyGoal : labels.monthlyGoal;
  const progressLabel = replaceValues(labels.progress, {
    completed: progress.completed,
    target: progress.target,
  });
  const statusLabel = progress.reached
    ? labels.goalReached
    : replaceValues(labels.remaining, { count: progress.remaining });
  const comparisonLabel = progress.delta === 0
    ? labels.sameAsPrevious
    : replaceValues(
        progress.delta > 0 ? labels.aheadOfPrevious : labels.behindPrevious,
        { count: Math.abs(progress.delta) }
      );

  return (
    <View
      style={localStyles.summaryCard}
      accessible
      accessibilityLabel={`${periodTitle}. ${progressLabel}. ${statusLabel}. ${comparisonLabel}`}
    >
      <View style={localStyles.summaryHeader}>
        <View>
          <Text style={localStyles.eyebrow}>{periodTitle}</Text>
          <Text style={localStyles.progressValue}>{progressLabel}</Text>
        </View>
        <Pressable
          style={localStyles.editButton}
          onPress={() => onEdit?.(task.id)}
          accessibilityRole="button"
          accessibilityLabel={labels.editGoal}
        >
          <Ionicons name="create-outline" size={18} color="#3c2ba7" />
        </Pressable>
      </View>
      <View style={localStyles.progressTrack}>
        <View style={[localStyles.progressFill, { width: `${progress.percentage}%` }]} />
      </View>
      <View style={localStyles.summaryFooter}>
        <View style={localStyles.statusRow}>
          <Ionicons
            name={progress.reached ? 'checkmark-circle' : 'flag-outline'}
            size={15}
            color={progress.reached ? '#2f9e44' : '#6f7488'}
          />
          <Text
            style={[
              localStyles.statusText,
              progress.reached && localStyles.statusTextReached,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
        <Text
          style={[
            localStyles.comparisonText,
            progress.delta > 0 && localStyles.comparisonTextPositive,
          ]}
        >
          {comparisonLabel}
        </Text>
      </View>
    </View>
  );
}

export default function PeriodGoalModal({
  visible,
  task,
  language = 'en',
  onClose,
  onSave,
}) {
  const translation = translations[language] ?? translations.en;
  const labels = translation.periodGoal;
  const existingGoal = normalizePeriodGoal(task?.periodGoal);
  const [period, setPeriod] = useState('weekly');
  const [target, setTarget] = useState('3');

  useEffect(() => {
    if (!visible) {
      return;
    }
    const normalized = normalizePeriodGoal(task?.periodGoal);
    setPeriod(normalized?.period ?? 'weekly');
    setTarget(String(normalized?.target ?? 3));
  }, [task?.id, task?.periodGoal, visible]);

  const parsedTarget = Number.parseInt(target, 10);
  const isValidTarget = Number.isFinite(parsedTarget)
    && parsedTarget >= 1
    && parsedTarget <= MAX_PERIOD_GOAL_TARGET;

  if (!visible || !task) {
    return null;
  }

  const handleSave = () => {
    if (!isValidTarget) {
      return;
    }
    onSave?.(task.id, { period, target: parsedTarget });
  };

  const handleRemove = () => {
    onSave?.(task.id, null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={localStyles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={localStyles.modalBackdrop} onPress={onClose} accessible={false} />
        <View style={localStyles.modalCard} accessibilityViewIsModal>
          <View style={localStyles.modalHeader}>
            <View style={localStyles.modalHeaderText}>
              <Text style={localStyles.modalEyebrow}>{labels.eyebrow}</Text>
              <Text style={localStyles.modalTitle}>{labels.modalTitle}</Text>
            </View>
            <Pressable
              style={localStyles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={labels.close}
              hitSlop={8}
            >
              <Ionicons name="close" size={21} color="#25283a" />
            </Pressable>
          </View>
          <Text style={localStyles.modalDescription}>{labels.modalDescription}</Text>

          <Text style={localStyles.fieldLabel}>{labels.periodLabel}</Text>
          <View style={localStyles.periodSelector}>
            {['weekly', 'monthly'].map((option) => {
              const selected = period === option;
              return (
                <Pressable
                  key={option}
                  style={[
                    localStyles.periodButton,
                    selected && localStyles.periodButtonSelected,
                  ]}
                  onPress={() => setPeriod(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={option === 'weekly' ? 'calendar-outline' : 'calendar-number-outline'}
                    size={18}
                    color={selected ? '#ffffff' : '#3c2ba7'}
                  />
                  <Text
                    style={[
                      localStyles.periodButtonText,
                      selected && localStyles.periodButtonTextSelected,
                    ]}
                  >
                    {option === 'weekly' ? labels.weekly : labels.monthly}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={localStyles.fieldLabel}>{labels.targetLabel}</Text>
          <View style={localStyles.targetRow}>
            <TextInput
              value={target}
              onChangeText={(value) => setTarget(value.replace(/[^0-9]/g, '').slice(0, 3))}
              style={[
                localStyles.targetInput,
                target.length > 0 && !isValidTarget && localStyles.targetInputInvalid,
              ]}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              accessibilityLabel={labels.targetLabel}
            />
            <Text style={localStyles.targetSuffix}>
              {parsedTarget === 1
                ? period === 'weekly'
                  ? labels.timePerWeek
                  : labels.timePerMonth
                : period === 'weekly'
                  ? labels.timesPerWeek
                  : labels.timesPerMonth}
            </Text>
          </View>
          <Text style={localStyles.targetHint}>
            {isValidTarget
              ? getGoalTargetLabel(labels, { period, target: parsedTarget })
              : labels.invalidTarget}
          </Text>

          {existingGoal ? (
            <Pressable
              style={localStyles.removeButton}
              onPress={handleRemove}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={17} color="#c92a2a" />
              <Text style={localStyles.removeButtonText}>{labels.removeGoal}</Text>
            </Pressable>
          ) : null}

          <View style={localStyles.modalActions}>
            <Pressable style={localStyles.cancelButton} onPress={onClose} accessibilityRole="button">
              <Text style={localStyles.cancelButtonText}>{translation.common.cancel}</Text>
            </Pressable>
            <Pressable
              style={[
                localStyles.saveButton,
                !isValidTarget && localStyles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!isValidTarget}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isValidTarget }}
            >
              <Text style={localStyles.saveButtonText}>{translation.common.save}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  emptyCard: {
    alignSelf: 'stretch',
    marginBottom: 18,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dedbea',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efedff',
  },
  emptyText: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24263a',
  },
  emptyDescription: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: '#74798c',
  },
  compactButton: {
    borderRadius: 12,
    backgroundColor: '#3c2ba7',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  compactButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  summaryCard: {
    alignSelf: 'stretch',
    marginBottom: 18,
    padding: 17,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1deee',
    shadowColor: '#282339',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 9,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#7569c4',
  },
  progressValue: {
    marginTop: 5,
    fontSize: 22,
    fontWeight: '800',
    color: '#202236',
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0eeff',
  },
  progressTrack: {
    height: 9,
    marginTop: 15,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#eceaf2',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#6354c7',
  },
  summaryFooter: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6f7488',
  },
  statusTextReached: {
    color: '#2f9e44',
  },
  comparisonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#777b8e',
    textAlign: 'right',
    flexShrink: 1,
  },
  comparisonTextPositive: {
    color: '#2f9e44',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(20, 20, 38, 0.58)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 26,
    padding: 20,
    backgroundColor: '#ffffff',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#7569c4',
  },
  modalTitle: {
    marginTop: 4,
    fontSize: 23,
    fontWeight: '800',
    color: '#202236',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f3f8',
  },
  modalDescription: {
    marginTop: 9,
    fontSize: 13,
    lineHeight: 19,
    color: '#686d80',
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '800',
    color: '#4b5064',
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 9,
  },
  periodButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#d8d5e6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#ffffff',
  },
  periodButtonSelected: {
    borderColor: '#3c2ba7',
    backgroundColor: '#3c2ba7',
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3c2ba7',
  },
  periodButtonTextSelected: {
    color: '#ffffff',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  targetInput: {
    width: 84,
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#d8d5e6',
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '800',
    color: '#24263a',
    textAlign: 'center',
    backgroundColor: '#fafafd',
  },
  targetInputInvalid: {
    borderColor: '#e03131',
  },
  targetSuffix: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#5e6377',
  },
  targetHint: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 16,
    color: '#777b8e',
  },
  removeButton: {
    alignSelf: 'flex-start',
    marginTop: 16,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#c92a2a',
  },
  modalActions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 9,
  },
  cancelButton: {
    flex: 1,
    minHeight: 47,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#d8d5e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#555a70',
  },
  saveButton: {
    flex: 1.2,
    minHeight: 47,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3c2ba7',
  },
  saveButtonDisabled: {
    opacity: 0.42,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
});
