import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { QUANTUM_ANIMATIONS } from '../../domain/taskDraft';
import styles from './styles';

function QuantumPanel({
  mode,
  animation,
  timerHours,
  timerMinutes,
  countValue,
  countUnit,
  onChangeAnimation,
  onChangeTimerHours,
  onChangeTimerMinutes,
  onChangeCountValue,
  onChangeCountUnit,
  showTitle = true,
  infoText,
  onPressInfo,
  isInfoVisible = false,
  labels,
}) {
  const isTimer = mode === 'timer';

  return (
    <View style={styles.subtasksPanel}>
      {showTitle ? (
        <View style={styles.sectionTitleRow}>
          <Text style={styles.subtasksTitle}>{isTimer ? labels.timer : labels.count}</Text>
          {infoText ? (
            <Pressable onPress={onPressInfo} style={styles.infoIconButton} hitSlop={8}>
              <Ionicons name="help-circle-outline" size={14} color="#59636f" />
            </Pressable>
          ) : null}
          {isInfoVisible ? (
            <View style={[styles.floatingInfoBubble, styles.sectionFloatingInfoBubble]}>
              <Text style={styles.inlineInfoText}>{infoText}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.subtasksCard}>
        {isTimer ? (
          <View style={styles.quantumTimerRow}>
            <View style={styles.quantumField}>
              <Text style={styles.quantumFieldLabel}>{labels.hour}</Text>
              <TextInput
                style={styles.quantumFieldInput}
                value={timerHours}
                onChangeText={onChangeTimerHours}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="00"
                placeholderTextColor="#626B78"
                accessibilityLabel={labels.timerHoursAccessibility}
              />
            </View>
            <View style={styles.quantumField}>
              <Text style={styles.quantumFieldLabel}>{labels.min}</Text>
              <TextInput
                style={styles.quantumFieldInput}
                value={timerMinutes}
                onChangeText={onChangeTimerMinutes}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="00"
                placeholderTextColor="#626B78"
                accessibilityLabel={labels.timerMinutesAccessibility}
              />
            </View>
          </View>
        ) : (
          <View style={styles.quantumCountRow}>
            <View style={styles.quantumField}>
              <Text style={styles.quantumFieldLabel}>{labels.count}</Text>
              <TextInput
                style={styles.quantumFieldInput}
                value={countValue}
                onChangeText={onChangeCountValue}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="0"
                placeholderTextColor="#626B78"
                accessibilityLabel={labels.countValueAccessibility}
              />
            </View>
            <View style={styles.quantumField}>
              <Text style={styles.quantumFieldLabel}>{labels.unit}</Text>
              <TextInput
                style={styles.quantumFieldInput}
                value={countUnit}
                onChangeText={onChangeCountUnit}
                maxLength={12}
                placeholder={labels.unit}
                placeholderTextColor="#626B78"
                accessibilityLabel={labels.countUnitAccessibility}
              />
            </View>
          </View>
        )}
        <View style={styles.quantumAnimationSection}>
          <Text style={styles.quantumFieldLabel}>{labels.animation}</Text>
          <View style={styles.quantumAnimationRow}>
            {QUANTUM_ANIMATIONS.map((animationKey) => {
              const isSelected = animation === animationKey;
              return (
                <Pressable
                  key={animationKey}
                  style={[
                    styles.quantumModeButton,
                    isSelected && styles.quantumModeButtonSelected,
                  ]}
                  onPress={() => onChangeAnimation(animationKey)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      styles.quantumModeButtonText,
                      isSelected && styles.quantumModeButtonTextSelected,
                    ]}
                  >
                    {labels.quantumAnimations?.[animationKey] ?? animationKey}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <Text style={styles.subtasksPanelHint}>
        {isTimer
          ? `${labels.timer}: ${labels.hour}/${labels.min}`
          : `${labels.count}: ${labels.unit}`}
      </Text>
    </View>
  );
}

export default QuantumPanel;
