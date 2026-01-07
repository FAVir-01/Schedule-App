import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { clamp01, interpolateHexColor, lightenColor } from '../utils/colorUtils';
import { getQuantumProgressLabel, getQuantumProgressPercent } from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { buildWavePath } from '../utils/waveUtils';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
const FALLBACK_EMOJI = '⭐';

function TaskCard({
  task,
  backgroundColor,
  borderColor,
  totalSubtasks = 0,
  completedSubtasks = 0,
  onPress,
  onToggleCompletion,
  onAdjustQuantum,
  previewProgress,
  previewLabel,
  ContainerComponent = View,
  containerStyle,
  containerProps,
  showToggle = true,
}) {
  const wavePhaseAnim = useRef(new Animated.Value(0)).current;
  const waveIntensityAnim = useRef(new Animated.Value(1)).current;
  const waterLevelAnim = useRef(new Animated.Value(0)).current;
  const wavePhaseRef = useRef(0);
  const waveIntensityRef = useRef(1);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [wavePathFront, setWavePathFront] = useState('');
  const [wavePathBack, setWavePathBack] = useState('');
  const [waveColor, setWaveColor] = useState('#e9f5ff');
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [task.customImage]);

  const totalLabel = useMemo(() => {
    if (previewLabel) {
      return previewLabel;
    }
    const quantumLabel = getQuantumProgressLabel(task);
    if (quantumLabel) {
      return quantumLabel;
    }
    if (!totalSubtasks) {
      return null;
    }
    return `${completedSubtasks}/${totalSubtasks}`;
  }, [completedSubtasks, previewLabel, task, totalSubtasks]);

  const isQuantum = task.type === 'quantum';
  const isWaterAnimation = task.quantum?.animation === 'water';
  const waterPercent = useMemo(() => {
    if (typeof previewProgress === 'number') {
      return clamp01(previewProgress);
    }
    return getQuantumProgressPercent(task);
  }, [previewProgress, task]);
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
    if (!isQuantum || !isWaterAnimation) {
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
  }, [isQuantum, isWaterAnimation, wavePhaseAnim]);

  useEffect(() => {
    const id = wavePhaseAnim.addListener(({ value }) => {
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
  const isQuantumComplete = isQuantum && getQuantumProgressLabel(task) && task.completed;

  return (
    <ContainerComponent
      {...containerProps}
      style={[
        styles.taskCard,
        containerStyle,
        {
          backgroundColor: backgroundColor || '#fff',
          borderColor: borderColor || lightenColor(task.color ?? '#ffffff', 0.1),
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
              {wavePathBack ? <Path d={wavePathBack} fill={waveColor} opacity={0.55} /> : null}
              {wavePathFront ? <Path d={wavePathFront} fill="#f4fbff" opacity={0.8} /> : null}
            </Svg>
          </AnimatedLinearGradient>
        </View>
      )}
      <Pressable style={styles.taskCardContent} onPress={onPress}>
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
              style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            <Text style={styles.taskTime}>{formatTaskTime(task.time)}</Text>
            {totalLabel && (
              <View style={styles.taskSubtaskSummary}>
                <Text style={styles.taskSubtaskSummaryText}>{totalLabel}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
      {showToggle ? (
        <Pressable
          onPress={toggleAction}
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
      ) : null}
    </ContainerComponent>
  );
}

const styles = StyleSheet.create({
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  waterFillContainer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  waterFill: {
    width: '100%',
    position: 'relative',
  },
  waterWaveSvg: {
    position: 'absolute',
    top: -18,
    left: 0,
    right: 0,
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskCardContent: {
    flex: 1,
    paddingRight: 12,
  },
  taskEmoji: {
    fontSize: 34,
  },
  taskEmojiImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    resizeMode: 'cover',
  },
  taskDetails: {
    marginLeft: 12,
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  taskTitleCompleted: {
    color: '#6f7a86',
    textDecorationLine: 'line-through',
  },
  taskTime: {
    marginTop: 4,
    fontSize: 13,
    color: '#6f7a86',
  },
  taskSubtaskSummary: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7dbeb',
  },
  taskSubtaskSummaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3c2ba7',
  },
  taskToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#c5cadb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  taskToggleCompleted: {
    backgroundColor: '#3dd598',
    borderColor: '#3dd598',
  },
});

export default TaskCard;
