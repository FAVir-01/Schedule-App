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
import Svg, { Path } from 'react-native-svg';
import { translations } from '../constants/i18n';
import { FALLBACK_EMOJI, USE_NATIVE_DRIVER } from '../constants/app';
import { clamp01 } from '../utils/mathUtils';
import { interpolateHexColor } from '../utils/colorUtils';
import { getQuantumProgressLabel, getQuantumProgressPercent } from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { buildWavePath } from '../utils/waveUtils';
import { triggerSelection } from '../utils/feedbackUtils';
import { AnimatedLinearGradient } from './animatedComponents';
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
  onAdjustQuantum,
  onCopy,
  onDelete,
  onEdit,
  language = 'en',
  isVisible = true,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const wavePhaseAnim = useRef(new Animated.Value(0)).current;
  const waveIntensityAnim = useRef(new Animated.Value(1)).current;
  const actionWidth = 168;
  const [isOpen, setIsOpen] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [wavePathFront, setWavePathFront] = useState('');
  const [wavePathBack, setWavePathBack] = useState('');
  const [waveColor, setWaveColor] = useState('#e9f5ff');
  const [hasImageError, setHasImageError] = useState(false);
  const waterLevelAnim = useRef(new Animated.Value(0)).current;
  const wavePhaseRef = useRef(0);
  const waveIntensityRef = useRef(1);
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
    onPress?.();
  }, [closeActions, isOpen, onPress]);

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
  const waveHeight = 34;
  const updateWavePaths = useCallback(() => {
    if (!cardSize.width) {
      return;
    }
    const intensityValue = waveIntensityRef.current;
    const phaseValue = wavePhaseRef.current;
    const frontAmplitude = 6 + intensityValue * 2.5;
    const backAmplitude = 4 + intensityValue * 1.6;
    const frontPath = buildWavePath({
      width: cardSize.width,
      height: waveHeight,
      amplitude: frontAmplitude,
      phase: phaseValue,
    });
    const backPath = buildWavePath({
      width: cardSize.width,
      height: waveHeight,
      amplitude: backAmplitude,
      phase: phaseValue + Math.PI / 2,
    });
    setWavePathFront(frontPath);
    setWavePathBack(backPath);
  }, [cardSize.width, waveHeight]);
  const waterFillHeight = useMemo(() => {
    if (!cardSize.height) {
      return 0;
    }
    return waterLevelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, cardSize.height],
    });
  }, [cardSize.height, waterLevelAnim]);

  useEffect(() => {
    if (!isQuantum || !isWaterAnimation || !isVisible) {
      wavePhaseAnim.stopAnimation();
      wavePhaseAnim.setValue(0);
      return undefined;
    }

    const animationLoop = Animated.loop(
      Animated.timing(wavePhaseAnim, {
        toValue: Math.PI * 2,
        duration: 3600,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      })
    );

    animationLoop.start();
    return () => {
      animationLoop.stop();
      wavePhaseAnim.setValue(0);
    };
  }, [isQuantum, isVisible, isWaterAnimation, wavePhaseAnim]);

  useEffect(() => {
    const id = wavePhaseAnim.addListener(({ value }) => {
      // Regenera o SVG da onda a ~30fps em vez de 60: metade do trabalho em JS
      // por card, sem diferença visual perceptível.
      if (Math.abs(value - wavePhaseRef.current) < 0.055) {
        return;
      }
      wavePhaseRef.current = value;
      updateWavePaths();
    });
    const intensityId = waveIntensityAnim.addListener(({ value }) => {
      waveIntensityRef.current = value;
      const normalized = clamp01((value - 1) / 4);
      setWaveColor(interpolateHexColor('#e9f5ff', '#c3e6ff', normalized));
      updateWavePaths();
    });
    return () => {
      wavePhaseAnim.removeListener(id);
      waveIntensityAnim.removeListener(intensityId);
    };
  }, [updateWavePaths, waveIntensityAnim, wavePhaseAnim]);

  useEffect(() => {
    updateWavePaths();
  }, [cardSize.width, updateWavePaths]);

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
        toValue: 4.8,
        damping: 6,
        stiffness: 180,
        mass: 0.6,
        useNativeDriver: false,
      }),
      Animated.spring(waveIntensityAnim, {
        toValue: 1,
        damping: 8,
        stiffness: 120,
        mass: 0.8,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isQuantum, isWaterAnimation, task.quantum?.wavePulse, waveIntensityAnim]);
  const toggleAction = isQuantum ? onAdjustQuantum : onToggleCompletion;
  const isQuantumComplete =
    isQuantum && getQuantumProgressLabel(task, dateKey) && task.completed;

  return (
    <View style={[styles.swipeableWrapper, { zIndex: isOpen ? 10 : 1 }]}>
      <View style={styles.swipeableActions}>
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionCopy]}
          onPress={() => handleAction(onCopy)}
          accessibilityRole="button"
          accessibilityLabel="Copy task"
        >
          <Ionicons name="copy-outline" size={18} color="#3c2ba7" />
          <Text style={styles.swipeActionText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.swipeActionButton,
            styles.swipeActionDelete,
            task.profileLocked && styles.swipeActionButtonDisabled,
          ]}
          onPress={() => handleAction(onDelete)}
          accessibilityRole="button"
          accessibilityLabel="Delete task"
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
            Delete
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
            <AnimatedLinearGradient
              colors={['rgba(107, 190, 255, 0.6)', 'rgba(64, 148, 255, 0.9)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[styles.waterFill, { height: waterFillHeight }]}
            >
              <Svg width={cardSize.width} height={waveHeight} style={styles.waterWaveSvg}>
                {wavePathBack ? (
                  <Path d={wavePathBack} fill={waveColor} opacity={0.55} />
                ) : null}
                {wavePathFront ? (
                  <Path d={wavePathFront} fill="#f4fbff" opacity={0.8} />
                ) : null}
              </Svg>
            </AnimatedLinearGradient>
          </View>
        )}
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
              <Text style={styles.taskTime}>{formatTaskTime(task.time, { language, anytimeLabel: translations[language]?.sheet?.anytime })}</Text>
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
              {translations[language]?.today?.missed ?? translations.en.today.missed}
            </Text>
          </View>
        )}
        {!isReminder && (
          <Pressable
            onPress={() => handleAction(toggleAction)}
            style={[
              styles.taskToggle,
              (isQuantumComplete || (!isQuantum && task.completed)) && styles.taskToggleCompleted,
            ]}
            accessibilityRole={isQuantum ? 'button' : 'checkbox'}
            accessibilityLabel={
              isQuantum
                ? 'Adjust quantum progress'
                : task.completed
                ? 'Mark task as incomplete'
                : 'Mark task as complete'
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
        )}
      </Animated.View>
    </View>
  );
});

export default SwipeableTaskCard;
