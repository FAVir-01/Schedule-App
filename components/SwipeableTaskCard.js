import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { translations } from '../constants/i18n';
import { FALLBACK_EMOJI, USE_NATIVE_DRIVER } from '../constants/app';
import {
  getQuantumProgressLabel,
  getQuantumProgressPercent,
  getQuantumStepLabel,
} from '../utils/taskUtils';
import { formatTaskTime, getTimerTotalSeconds } from '../utils/timeUtils';
import { buildRepeatingWavePath } from '../utils/waveUtils';
import { triggerSelection } from '../utils/feedbackUtils';
import { styles } from '../styles/appStyles';

const SwipeableTaskCard = React.memo(function SwipeableTaskCard({
  task,
  backgroundColor,
  borderColor,
  dateKey,
  totalSubtasks,
  completedSubtasks,
  onPress,
  onToggleCompletion,
  onQuantumDelta,
  onCopy,
  onDelete,
  onEdit,
  language = 'en',
  isVisible = true,
  reduceMotion = false,
}) {
  const t = translations[language] ?? translations.en;
  const translateX = useRef(new Animated.Value(0)).current;
  const waveShiftAnim = useRef(new Animated.Value(0)).current;
  const waveIntensityAnim = useRef(new Animated.Value(1)).current;
  const actionWidth = 168;
  const [isOpen, setIsOpen] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [hasImageError, setHasImageError] = useState(false);
  const waterLevelAnim = useRef(new Animated.Value(0)).current;
  const currentOffsetRef = useRef(0);

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentOffsetRef.current = value;
    });
    return () => {
      translateX.removeListener(id);
    };
  }, [translateX]);

  useEffect(() => {
    setHasImageError(false);
  }, [task.customImage]);

  const closeActions = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => setIsOpen(false));
  }, [translateX]);

  const handlePanRelease = useCallback(() => {
    const clampedValue = Math.min(0, Math.max(-actionWidth, currentOffsetRef.current));
    const shouldOpen = clampedValue <= -actionWidth * 0.5;
    const targetValue = shouldOpen ? -actionWidth : 0;

    setIsOpen(shouldOpen);
    currentOffsetRef.current = targetValue;

    Animated.spring(translateX, {
      toValue: targetValue,
      damping: 20,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [actionWidth, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 6 && Math.abs(gesture.dy) < 10,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dx < 0) {
            translateX.setValue(Math.max(-actionWidth, gesture.dx));
          } else if (isOpen) {
            translateX.setValue(Math.min(0, -actionWidth + gesture.dx));
          }
        },
        onPanResponderRelease: () => {
          handlePanRelease();
        },
        onPanResponderTerminate: () => {
          handlePanRelease();
        },
      }),
    [actionWidth, handlePanRelease, isOpen, translateX]
  );

  const handlePress = useCallback(() => {
    if (isOpen) {
      closeActions();
      return;
    }
    onPress?.(task);
  }, [closeActions, isOpen, onPress, task]);

  const handleAction = useCallback(
    (callback) => {
      closeActions();
      if (callback) {
        triggerSelection();
        callback();
      }
    },
    [closeActions]
  );

  const totalLabel = useMemo(() => {
    const quantumLabel = getQuantumProgressLabel(task, dateKey);
    if (quantumLabel) {
      return quantumLabel;
    }
    if (task.type === 'reminder' || !totalSubtasks) {
      return null;
    }
    return `${completedSubtasks}/${totalSubtasks}`;
  }, [completedSubtasks, dateKey, task, totalSubtasks]);

  const isQuantum = task.type === 'quantum';
  const isReminder = task.type === 'reminder';
  const isWaterAnimation = task.quantum?.animation === 'water';
  const waterPercent = useMemo(
    () => getQuantumProgressPercent(task, dateKey),
    [dateKey, task]
  );
  const waveHeight = 19;
  const waterLayerHeight = cardSize.height ? cardSize.height + waveHeight : 0;
  // Onda e corpo são um único path com um único gradiente. Isso elimina a
  // junção horizontal que aparecia quando duas superfícies nativas se cruzavam.
  const waveGeometry = useMemo(() => {
    if (!cardSize.width || !waterLayerHeight) {
      return null;
    }
    const wavelength = Math.max(120, cardSize.width * 0.65);
    const totalWidth = cardSize.width + wavelength;
    return {
      wavelength,
      totalWidth,
      frontPath: buildRepeatingWavePath({
        totalWidth,
        wavelength,
        height: waterLayerHeight,
        amplitude: 4,
      }),
    };
  }, [cardSize.width, waterLayerHeight]);
  const waterLayerTranslateY = useMemo(() => {
    if (!cardSize.height) {
      return 0;
    }
    return waterLevelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [waterLayerHeight, 0],
      extrapolate: 'clamp',
    });
  }, [cardSize.height, waterLayerHeight, waterLevelAnim]);
  const waveFrontShift = useMemo(
    () =>
      waveGeometry
        ? waveShiftAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -waveGeometry.wavelength],
          })
        : 0,
    [waveGeometry, waveShiftAnim]
  );
  const wavePulseShift = useMemo(
    () =>
      waveIntensityAnim.interpolate({
        inputRange: [1, 1.6],
        outputRange: [0, -10],
        extrapolate: 'clamp',
      }),
    [waveIntensityAnim]
  );
  const waterGradientId = useMemo(
    () => `water-gradient-${String(task.id).replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [task.id]
  );


  useEffect(() => {
    if (!isQuantum || !isWaterAnimation || !isVisible) {
      waveShiftAnim.stopAnimation();
      waveShiftAnim.setValue(0);
      return undefined;
    }

    const animationLoop = Animated.loop(
      Animated.timing(waveShiftAnim, {
        toValue: 1,
        duration: 4500,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );

    animationLoop.start();
    return () => {
      animationLoop.stop();
      waveShiftAnim.setValue(0);
    };
  }, [isQuantum, isVisible, isWaterAnimation, waveShiftAnim]);

  useEffect(() => {
    if (!isQuantum || !isWaterAnimation || !cardSize.height) {
      return;
    }
    Animated.spring(waterLevelAnim, {
      toValue: waterPercent,
      damping: 10,
      stiffness: 140,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  }, [cardSize.height, isQuantum, isWaterAnimation, waterLevelAnim, waterPercent]);

  useEffect(() => {
    if (!isQuantum || !isWaterAnimation || !task.quantum?.wavePulse) {
      return;
    }
    waveIntensityAnim.stopAnimation();
    waveIntensityAnim.setValue(1);
    Animated.sequence([
      Animated.spring(waveIntensityAnim, {
        toValue: 1.6,
        damping: 7,
        stiffness: 180,
        mass: 0.6,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.spring(waveIntensityAnim, {
        toValue: 1,
        damping: 8,
        stiffness: 120,
        mass: 0.8,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [isQuantum, isWaterAnimation, task.quantum?.wavePulse, waveIntensityAnim]);
  const isQuantumComplete =
    isQuantum && getQuantumProgressLabel(task, dateKey) && task.completed;

  // Stepper inline: tap no ⊕ soma o passo direto (água/contador reagem na hora);
  // long-press abre o painel com −/+, presets e OK.
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustStep, setAdjustStep] = useState(null);
  const adjustPanelProgress = useRef(new Animated.Value(0)).current;
  const isTimerMode = task.quantum?.mode === 'timer';
  const timerLimitSeconds = isTimerMode ? getTimerTotalSeconds(task.quantum?.timer) : 0;
  const countLimit = task.quantum?.count?.value ?? 0;
  const defaultStep = isTimerMode
    ? Math.min(
        Math.max(task.quantum?.lastAdjustTimerSeconds || 900, 60),
        timerLimitSeconds || Number.MAX_SAFE_INTEGER
      )
    : Math.max(task.quantum?.lastAdjustCount || 1, 1);
  const quantumStep = adjustStep ?? defaultStep;
  const quantumStepLabel = getQuantumStepLabel(task, quantumStep);
  const stepOptions = useMemo(() => {
    if (!isQuantum) {
      return [];
    }
    if (isTimerMode) {
      const options = [
        { label: '5m', value: 300 },
        { label: '15m', value: 900 },
        { label: '30m', value: 1800 },
        { label: '1h', value: 3600 },
      ];
      return timerLimitSeconds
        ? options.filter((option) => option.value <= timerLimitSeconds)
        : options;
    }
    const options = [{ label: '1', value: 1 }];
    const half = countLimit ? Math.max(1, Math.round(countLimit / 2)) : 0;
    if (half > 1) {
      options.push({ label: t.taskCard.half, value: half });
    }
    if (countLimit > 1 && countLimit !== half) {
      options.push({ label: t.taskCard.maximum, value: countLimit });
    }
    return options;
  }, [countLimit, isQuantum, isTimerMode, t.taskCard.half, t.taskCard.maximum, timerLimitSeconds]);
  // Painel some sozinho após alguns segundos sem interação — sem botão de fechar.
  const adjustCloseTimerRef = useRef(null);
  const bumpAdjustClose = useCallback(() => {
    if (adjustCloseTimerRef.current) {
      clearTimeout(adjustCloseTimerRef.current);
    }
    adjustCloseTimerRef.current = setTimeout(() => setIsAdjustOpen(false), 4000);
  }, []);
  useEffect(() => {
    adjustPanelProgress.stopAnimation();
    if (reduceMotion) {
      adjustPanelProgress.setValue(isAdjustOpen ? 1 : 0);
      return undefined;
    }
    const animation = Animated.timing(adjustPanelProgress, {
      toValue: isAdjustOpen ? 1 : 0,
      duration: isAdjustOpen ? 220 : 180,
      easing: isAdjustOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [adjustPanelProgress, isAdjustOpen, reduceMotion]);
  useEffect(() => {
    if (isQuantumComplete) {
      setIsAdjustOpen(false);
    }
  }, [isQuantumComplete]);
  useEffect(
    () => () => {
      clearTimeout(adjustCloseTimerRef.current);
      adjustPanelProgress.stopAnimation();
    },
    [adjustPanelProgress]
  );
  const applyQuantumStep = useCallback(
    (direction) => {
      triggerSelection();
      onQuantumDelta?.(task, direction, quantumStep);
    },
    [onQuantumDelta, quantumStep, task]
  );
  const handleTogglePress = useCallback(() => {
    if (isQuantum) {
      closeActions();
      applyQuantumStep(1);
      return;
    }
    handleAction(() => onToggleCompletion?.(task));
  }, [applyQuantumStep, closeActions, handleAction, isQuantum, onToggleCompletion, task]);
  const handleToggleLongPress = useCallback(() => {
    if (!isQuantum) {
      return;
    }
    triggerSelection();
    setIsAdjustOpen((previous) => {
      const willOpen = !previous;
      if (willOpen) {
        bumpAdjustClose();
      } else if (adjustCloseTimerRef.current) {
        clearTimeout(adjustCloseTimerRef.current);
      }
      return willOpen;
    });
  }, [bumpAdjustClose, isQuantum]);

  return (
    <View style={[styles.swipeableWrapper, { zIndex: isOpen ? 10 : 1 }]}>
      <View style={styles.swipeableActions}>
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionCopy]}
          onPress={() => handleAction(() => onCopy?.(task))}
          accessibilityRole="button"
          accessibilityLabel={t.taskCard.copyTask}
        >
          <Ionicons name="copy-outline" size={18} color="#3c2ba7" />
          <Text style={styles.swipeActionText}>{t.taskCard.copy}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.swipeActionButton,
            styles.swipeActionDelete,
            task.profileLocked && styles.swipeActionButtonDisabled,
          ]}
          onPress={() => handleAction(() => onDelete?.(task))}
          accessibilityRole="button"
          accessibilityLabel={t.taskCard.deleteTask}
          disabled={task.profileLocked}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text
            style={[
              styles.swipeActionText,
              styles.swipeActionTextDelete,
              task.profileLocked && styles.swipeActionTextDisabled,
            ]}
          >
            {t.taskCard.delete}
          </Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.taskCard,
          task.missed && styles.taskCardMissed,
          {
            backgroundColor: backgroundColor || '#fff',
            borderColor,
            transform: [{ translateX }],
          },
        ]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCardSize({ width, height });
        }}
      >
        {isQuantum && isWaterAnimation && (
          <View pointerEvents="none" style={styles.waterFillContainer}>
            {waveGeometry && (
              <Animated.View
                style={[
                  styles.waterLevelLayer,
                  {
                    width: waveGeometry.totalWidth,
                    height: waterLayerHeight,
                    transform: [{ translateY: waterLayerTranslateY }],
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.waterWaveLayer,
                    {
                      width: waveGeometry.totalWidth,
                      height: waterLayerHeight,
                      transform: [
                        { translateX: waveFrontShift },
                        { translateX: wavePulseShift },
                      ],
                    },
                  ]}
                >
                  <Svg width={waveGeometry.totalWidth} height={waterLayerHeight}>
                    <Defs>
                      <SvgLinearGradient id={waterGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                        <Stop offset="0%" stopColor="rgb(153, 199, 252)" />
                        <Stop offset="100%" stopColor="rgb(100, 158, 248)" />
                      </SvgLinearGradient>
                    </Defs>
                    <Path d={waveGeometry.frontPath} fill={`url(#${waterGradientId})`} />
                  </Svg>
                </Animated.View>
              </Animated.View>
            )}
          </View>
        )}
        <View style={styles.taskCardMain}>
        <Pressable style={styles.taskCardContent} onPress={handlePress}>
          <View style={styles.taskInfo}>
            {task.customImage && !hasImageError ? (
              <Image
                source={{ uri: task.customImage }}
                style={styles.taskEmojiImage}
                onError={() => setHasImageError(true)}
              />
            ) : (
              <Text style={styles.taskEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
            )}
            <View style={styles.taskDetails}>
              <Text
                style={[styles.taskTitle, task.completed && !task.missed && styles.taskTitleCompleted]}
                numberOfLines={1}
              >
                {task.title}
              </Text>
              <Text style={styles.taskTime}>{formatTaskTime(task.time, { language, anytimeLabel: t.sheet.anytime })}</Text>
              {totalLabel && (
                <View style={styles.taskSubtaskSummary}>
                  <Text style={styles.taskSubtaskSummaryText}>{totalLabel}</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
        {isReminder && task.missed && (
          <View style={styles.missedBadge} pointerEvents="none">
            <Text style={styles.missedBadgeText}>
              {t.today.missed}
            </Text>
          </View>
        )}
        {!isReminder && (
          <View style={styles.taskToggleGroup}>
            <Pressable
              onPress={handleTogglePress}
              onLongPress={handleToggleLongPress}
              delayLongPress={350}
              style={[
                styles.taskToggle,
                (isQuantumComplete || (!isQuantum && task.completed)) && styles.taskToggleCompleted,
              ]}
              accessibilityRole={isQuantum ? 'button' : 'checkbox'}
              accessibilityLabel={
                isQuantum && quantumStepLabel
                  ? t.taskCard.addQuantumProgressStep.replace('{step}', quantumStepLabel)
                  : isQuantum
                  ? t.taskCard.addQuantumProgress
                  : task.completed
                  ? t.taskModal.markTaskIncomplete
                  : t.taskModal.markTaskComplete
              }
              accessibilityState={isQuantum ? undefined : { checked: task.completed }}
            >
              {isQuantum ? (
                isQuantumComplete ? (
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                ) : (
                  <Ionicons name="add" size={18} color="#1F2742" />
                )
              ) : (
                task.completed && <Ionicons name="checkmark" size={18} color="#ffffff" />
              )}
            </Pressable>
            {isQuantum && !isQuantumComplete && quantumStepLabel ? (
              <Pressable
                style={styles.taskToggleStepButton}
                onPress={handleToggleLongPress}
                accessibilityRole="button"
                accessibilityLabel={t.taskCard.adjustProgress}
                accessibilityState={{ expanded: isAdjustOpen }}
                hitSlop={4}
              >
                <Text style={styles.taskToggleStepLabel}>+{quantumStepLabel}</Text>
                <Ionicons name="options-outline" size={10} color="#777d90" />
              </Pressable>
            ) : null}
          </View>
        )}
        </View>
        {isQuantum && !isQuantumComplete && (
          <Animated.View
            pointerEvents={isAdjustOpen ? 'auto' : 'none'}
            importantForAccessibility={isAdjustOpen ? 'auto' : 'no-hide-descendants'}
            style={[
              styles.quantumStepper,
              styles.quantumStepperAnimated,
              {
                opacity: adjustPanelProgress,
                height: adjustPanelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 47],
                }),
                marginTop: adjustPanelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 12],
                }),
                transform: [
                  {
                    translateY: adjustPanelProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-4, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={styles.quantumStepperButton}
              onPress={() => {
                applyQuantumStep(-1);
                bumpAdjustClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={t.taskCard.subtractProgress}
            >
              <Ionicons name="remove" size={18} color="#1a1a2e" />
            </Pressable>
            <View style={styles.quantumStepperPresets}>
              {stepOptions.map((option) => (
                <Pressable
                  key={option.label}
                  style={[
                    styles.quantumStepperPreset,
                    quantumStep === option.value && styles.quantumStepperPresetSelected,
                  ]}
                  onPress={() => {
                    triggerSelection();
                    setAdjustStep(option.value);
                    bumpAdjustClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t.taskCard.setStep.replace('{step}', option.label)}
                >
                  <Text
                    style={[
                      styles.quantumStepperPresetText,
                      quantumStep === option.value && styles.quantumStepperPresetTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.quantumStepperButton, styles.quantumStepperButtonAdd]}
              onPress={() => {
                applyQuantumStep(1);
                bumpAdjustClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={t.taskCard.addProgress}
            >
              <Ionicons name="add" size={18} color="#ffffff" />
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
});

export default SwipeableTaskCard;
