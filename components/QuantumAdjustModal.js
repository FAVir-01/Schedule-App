import React, { useCallback } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getQuantumProgressLabel } from '../utils/taskUtils';
import { triggerSelection } from '../utils/feedbackUtils';
import WheelPicker, {
  TIMER_HOUR_OPTIONS,
  TIMER_MINUTE_OPTIONS,
  normalizeTimerValue,
} from './WheelPicker';
import { styles } from '../styles/appStyles';

export default function QuantumAdjustModal({
  language = 'en',
  task,
  visible,
  minutesValue,
  secondsValue,
  countValue,
  dateKey,
  onChangeMinutes,
  onChangeSeconds,
  onChangeCount,
  onAdd,
  onSubtract,
  onClose,
}) {
  const isTimer = task?.quantum?.mode === 'timer';
  const limitLabel = task ? getQuantumProgressLabel(task, dateKey) : null;
  const limitCount = task?.quantum?.count?.value ?? 0;
  const maxTimerMinutes = task?.quantum?.timer?.minutes ?? 0;
  const maxTimerSeconds = task?.quantum?.timer?.seconds ?? 0;
  const maxTimerTotalMinutes = maxTimerMinutes * 60 + maxTimerSeconds;
  const lastAdjustCount = task?.quantum?.lastAdjustCount ?? null;
  const normalizedCountValue = Number.parseInt(countValue, 10) || 0;
  const normalizedMinutesValue = Number.parseInt(minutesValue, 10) || 0;
  const normalizedSecondsValue = Number.parseInt(secondsValue, 10) || 0;
  const totalTimerMinutes = normalizedMinutesValue * 60 + normalizedSecondsValue;
  const isThirtySelected = totalTimerMinutes === 30 || totalTimerMinutes === 90;
  const isOneHourSelected = totalTimerMinutes === 60 || totalTimerMinutes === 90;
  const presetTotalMinutes = (isThirtySelected ? 30 : 0) + (isOneHourSelected ? 60 : 0);
  const lastCountValue = lastAdjustCount ?? Math.max(1, normalizedCountValue || 1);
  const halfCountValue = limitCount ? Math.max(1, Math.round(limitCount / 2)) : 0;
  const maxCountValue = limitCount ?? 0;
  const handleMinutesChange = useCallback(
    (value) => {
      onChangeMinutes(value.replace(/\D/g, '').slice(0, 2));
    },
    [onChangeMinutes]
  );
  const handleSecondsChange = useCallback(
    (value) => {
      onChangeSeconds(value.replace(/\D/g, '').slice(0, 2));
    },
    [onChangeSeconds]
  );
  const handleCountChange = useCallback(
    (value) => {
      onChangeCount(value.replace(/\D/g, '').slice(0, 4));
      triggerSelection();
    },
    [onChangeCount]
  );
  const handlePresetSelect = useCallback(
    (value) => {
      if (!value) {
        return;
      }
      onChangeCount(String(value));
      triggerSelection();
    },
    [onChangeCount]
  );
  const handleTimerPresetSelect = useCallback(
    (minutes, seconds) => {
      if (minutes == null || seconds == null) {
        return;
      }
      onChangeMinutes(String(minutes));
      onChangeSeconds(String(seconds));
      triggerSelection();
    },
    [onChangeMinutes, onChangeSeconds]
  );
  const updateTimerFromTotal = useCallback(
    (totalMinutes) => {
      const clampedTotal =
        maxTimerTotalMinutes > 0
          ? Math.min(Math.max(totalMinutes, 0), maxTimerTotalMinutes)
          : Math.max(totalMinutes, 0);
      const nextHours = Math.floor(clampedTotal / 60);
      const nextMinutes = clampedTotal % 60;
      onChangeMinutes(String(nextHours));
      onChangeSeconds(String(nextMinutes));
    },
    [maxTimerTotalMinutes, onChangeMinutes, onChangeSeconds]
  );
  const handleTimerPresetToggle = useCallback(
    (presetMinutes) => {
      if (!presetMinutes) {
        return;
      }
      const shouldRemove =
        (presetMinutes === 30 && isThirtySelected) ||
        (presetMinutes === 60 && isOneHourSelected);
      const nextTotal = shouldRemove
        ? presetTotalMinutes - presetMinutes
        : presetTotalMinutes + presetMinutes;
      updateTimerFromTotal(nextTotal);
      triggerSelection();
    },
    [isOneHourSelected, isThirtySelected, presetTotalMinutes, updateTimerFromTotal]
  );
  const disableActions = isTimer
    ? (Number.parseInt(minutesValue, 10) || 0) * 60 + (Number.parseInt(secondsValue, 10) || 0) <= 0
    : (Number.parseInt(countValue, 10) || 0) <= 0;


  if (!visible || !task) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.quantumModalOverlay}>
        <Pressable style={styles.quantumModalBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.quantumModalCard}>
          <View style={styles.quantumModalHeader}>
            <Text style={styles.quantumModalTitle}>
              {isTimer ? 'Adjust timer' : 'Adjust count'}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close adjust dialog"
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color="#1F2742" />
            </Pressable>
          </View>
          {limitLabel && (
            <Text style={styles.quantumModalSubtitle}>Current: {limitLabel}</Text>
          )}
          {isTimer ? (
            <>
              <View style={styles.quantumModalPresetRow}>
                <Pressable
                  style={[
                    styles.quantumModalPresetButton,
                    isThirtySelected && styles.quantumModalPresetButtonSelected,
                  ]}
                  onPress={() => handleTimerPresetToggle(30)}
                  accessibilityRole="button"
                  accessibilityLabel="Use 30 minutes"
                >
                  <Text
                    style={[
                      styles.quantumModalPresetText,
                      isThirtySelected && styles.quantumModalPresetTextSelected,
                    ]}
                  >
                    30 min
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.quantumModalPresetButton,
                    isOneHourSelected && styles.quantumModalPresetButtonSelected,
                  ]}
                  onPress={() => handleTimerPresetToggle(60)}
                  accessibilityRole="button"
                  accessibilityLabel="Use 1 hour"
                >
                  <Text
                    style={[
                      styles.quantumModalPresetText,
                      isOneHourSelected && styles.quantumModalPresetTextSelected,
                    ]}
                  >
                    1 hour
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.quantumModalPresetButton,
                    normalizedMinutesValue === maxTimerMinutes &&
                      normalizedSecondsValue === maxTimerSeconds &&
                      maxTimerTotalMinutes > 0 &&
                      styles.quantumModalPresetButtonSelected,
                  ]}
                  onPress={() => handleTimerPresetSelect(maxTimerMinutes, maxTimerSeconds)}
                  accessibilityRole="button"
                  accessibilityLabel="Use max"
                  disabled={maxTimerTotalMinutes <= 0}
                >
                  <Text
                    style={[
                      styles.quantumModalPresetText,
                      normalizedMinutesValue === maxTimerMinutes &&
                        normalizedSecondsValue === maxTimerSeconds &&
                        maxTimerTotalMinutes > 0 &&
                        styles.quantumModalPresetTextSelected,
                    ]}
                  >
                    max
                  </Text>
                </Pressable>
              </View>
              <View style={styles.quantumModalAmount}>
                <Text style={styles.quantumModalAmountLabel}>Amount</Text>
                <View style={styles.quantumModalAmountInput}>
                  <View style={styles.timerWheelArea}>
                    <View pointerEvents="none" style={styles.timerWheelHighlight} />
                    <View style={styles.timerWheelRow}>
                      <View style={styles.timerWheelColumnWrapper}>
                        <WheelPicker
                          values={TIMER_HOUR_OPTIONS}
                          value={normalizeTimerValue(minutesValue, TIMER_HOUR_OPTIONS)}
                          onChange={handleMinutesChange}
                          accessibilityLabel="Timer hours"
                        />
                      </View>
                      <Text style={styles.timerWheelDivider}>:</Text>
                      <View style={styles.timerWheelColumnWrapper}>
                        <WheelPicker
                          values={TIMER_MINUTE_OPTIONS}
                          value={normalizeTimerValue(secondsValue, TIMER_MINUTE_OPTIONS)}
                          onChange={handleSecondsChange}
                          accessibilityLabel="Timer minutes"
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.quantumModalPresetRow}>
                <Pressable
                  style={[
                    styles.quantumModalPresetButton,
                    normalizedCountValue === lastCountValue && styles.quantumModalPresetButtonSelected,
                  ]}
                  onPress={() => handlePresetSelect(lastCountValue)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use last amount ${lastCountValue}`}
                >
                  <Text
                    style={[
                      styles.quantumModalPresetText,
                      normalizedCountValue === lastCountValue && styles.quantumModalPresetTextSelected,
                    ]}
                  >
                    {lastCountValue}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.quantumModalPresetButton,
                    normalizedCountValue === halfCountValue && styles.quantumModalPresetButtonSelected,
                  ]}
                  onPress={() => handlePresetSelect(halfCountValue)}
                  accessibilityRole="button"
                  accessibilityLabel="Use half"
                  disabled={!halfCountValue}
                >
                  <Text
                    style={[
                      styles.quantumModalPresetText,
                      normalizedCountValue === halfCountValue && styles.quantumModalPresetTextSelected,
                    ]}
                  >
                    half
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.quantumModalPresetButton,
                    normalizedCountValue === maxCountValue && styles.quantumModalPresetButtonSelected,
                  ]}
                  onPress={() => handlePresetSelect(maxCountValue)}
                  accessibilityRole="button"
                  accessibilityLabel="Use max"
                  disabled={!maxCountValue}
                >
                  <Text
                    style={[
                      styles.quantumModalPresetText,
                      normalizedCountValue === maxCountValue && styles.quantumModalPresetTextSelected,
                    ]}
                  >
                    max
                  </Text>
                </Pressable>
              </View>
              <View style={styles.quantumModalRow}>
                <View style={styles.quantumModalField}>
                  <Text style={styles.quantumModalFieldLabel}>Amount</Text>
                  <TextInput
                    style={styles.quantumModalInput}
                    value={countValue}
                    onChangeText={handleCountChange}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="0"
                    placeholderTextColor="#9AA5B5"
                  />
                </View>
              </View>
            </>
          )}
          <View style={styles.quantumModalActions}>
            <Pressable
              style={[styles.quantumModalButton, styles.quantumModalButtonSubtract, disableActions && styles.quantumModalButtonDisabled]}
              onPress={onSubtract}
              disabled={disableActions}
              accessibilityRole="button"
              accessibilityLabel="Subtract from progress"
            >
              <Text style={styles.quantumModalButtonText}>-</Text>
            </Pressable>
            <Pressable
              style={[styles.quantumModalButton, styles.quantumModalButtonAdd, disableActions && styles.quantumModalButtonDisabled]}
              onPress={onAdd}
              disabled={disableActions}
              accessibilityRole="button"
              accessibilityLabel="Add to progress"
            >
              <Text style={[styles.quantumModalButtonText, styles.quantumModalButtonTextLight]}>
                +
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
