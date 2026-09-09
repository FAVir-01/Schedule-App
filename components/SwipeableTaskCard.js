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
  getTaskFinishedMilestoneForDate,
  getQuantumProgressLabel,
  getQuantumProgressPercent,
  getQuantumStepLabel,
} from '../utils/taskUtils';
import { formatTaskTime, getTimerTotalSeconds } from '../utils/timeUtils';
import { getTaskTimeForOccurrence } from '../domain/taskSchedule';
import {
  buildRepeatingWavePath,
  getWaterDisplayPercent,
  WATER_GRADIENT_BOTTOM_COLOR,
  WATER_GRADIENT_TOP_COLOR,
  WATER_WAVE_AMPLITUDE,
  WATER_WAVE_DURATION_MS,
  WATER_WAVE_HORIZONTAL_OVERSCAN,
  WATER_WAVE_MIN_FILL_HEIGHT,
} from '../utils/waveUtils';
import { triggerSelection } from '../utils/feedbackUtils';
import { styles } from '../styles/appStyles';
import FinishedMilestoneBadge from './FinishedMilestoneBadge';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const QUANTUM_STEPPER_HEIGHT = 47;
const QUANTUM_STEPPER_MARGIN_TOP = 12;
const QUANTUM_STEPPER_EXPANSION = QUANTUM_STEPPER_HEIGHT + QUANTUM_STEPPER_MARGIN_TOP;
const QUANTUM_STEPPER_OPEN_MS = 320;
const QUANTUM_STEPPER_CLOSE_MS = 280;
const QUANTUM_STEPPER_OPEN_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const QUANTUM_STEPPER_CLOSE_EASING = Easing.bezier(0.4, 0, 0.2, 1);

const SwipeableTaskCard = React.memo(function SwipeableTaskCard({
  task,
  backgroundColor,
  borderColor,
  dateKey,
  occurrenceKey,
  totalSubtasks,
  completedSubtasks,
  onPress,
  onToggleCompletion,
  onQuantumDelta,
  onCopy,
  onArchive,
  onEdit,
  language = 'en',
  isVisible = true,
  reduceMotion = false,
}) {
  const t = translations[language] ?? translations.en;
  // Presenca e progresso sao indexados pela ocorrencia: num dia com duas aulas
  // cada card tem a sua. Sem grupos, `occurrenceKey` e o proprio `dateKey`.
  const progressKey = occurrenceKey ?? dateKey;
  const translateX = useRef(new Animated.Value(0)).current;
  const waveShiftAnim = useRef(new Animated.Value(0)).current;
  const waveIntensityAnim = useRef(new Animated.Value(1)).current;
  // Nivel da agua: a lamina sobe e desce animada quando a quantidade muda.
  // A altura NAO entra mais na geometria do path — se entrar, cada mudanca
  // reconstroi a string inteira e o volume salta de uma vez.
  const waterLevelAnim = useRef(new Animated.Value(0)).current;
  const waterPanelOffsetAnim = useRef(new Animated.Value(0)).current;
  const hasWaterLevelRef = useRef(false);
  const previousWaterPanelOpenRef = useRef(false);
  const hasMeasuredCollapsedCardRef = useRef(false);
  const cardSizeRef = useRef({ width: 0, height: 0 });
  const actionWidth = 168;
  const [isOpen, setIsOpen] = useState(false);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [hasImageError, setHasImageError] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustStep, setAdjustStep] = useState(null);
  const [finishedMilestoneAnimationToken, setFinishedMilestoneAnimationToken] = useState(0);
  const adjustPanelProgress = useRef(new Animated.Value(0)).current;
  const currentOffsetRef = useRef(0);
  const previousCompletionRef = useRef({
    dateKey,
    completed: Boolean(task.completed),
  });

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
    const quantumLabel = getQuantumProgressLabel(task, progressKey);
    if (quantumLabel) {
      return quantumLabel;
    }
    if (task.type === 'reminder' || !totalSubtasks) {
      return null;
    }
    return `${completedSubtasks}/${totalSubtasks}`;
  }, [completedSubtasks, progressKey, task, totalSubtasks]);
  const finishedMilestone = useMemo(
    () => getTaskFinishedMilestoneForDate(task, progressKey),
    [progressKey, task]
  );
  const finishedMilestoneMessage = useMemo(
    () =>
      finishedMilestone
        ? t.taskCard.finishedMilestoneMessage.replace('{count}', String(finishedMilestone))
        : null,
    [finishedMilestone, t]
  );

  useEffect(() => {
    const previous = previousCompletionRef.current;
    const completed = Boolean(task.completed);
    if (
      previous.dateKey === progressKey &&
      !previous.completed &&
      completed &&
      finishedMilestone
    ) {
      setFinishedMilestoneAnimationToken((token) => token + 1);
    }
    previousCompletionRef.current = { dateKey: progressKey, completed };
  }, [progressKey, finishedMilestone, task.completed]);

  const isQuantum = task.type === 'quantum';
  const isReminder = task.type === 'reminder';
  const isWaterAnimation = task.quantum?.animation === 'water';
  const waterPercent = useMemo(
    () => getQuantumProgressPercent(task, progressKey),
    [progressKey, task]
  );
  const waterDisplayPercent = useMemo(
    () => getWaterDisplayPercent(waterPercent),
    [waterPercent]
  );
  // A geometria usa sempre a altura maxima do card. Durante a abertura do
  // stepper apenas o recorte do card e a translacao da agua mudam; o path SVG
  // nao e mais reconstruido a cada frame da animacao de layout.
  const waterRenderHeight = cardSize.height + QUANTUM_STEPPER_EXPANSION;
  const waterFillHeight = cardSize.height
    ? Math.max(WATER_WAVE_MIN_FILL_HEIGHT, cardSize.height * waterDisplayPercent)
    : 0;
  const expandedWaterFillHeight = cardSize.height
    ? Math.max(WATER_WAVE_MIN_FILL_HEIGHT, waterRenderHeight * waterDisplayPercent)
    : 0;
  // Onda e corpo são um único path com um único gradiente. Isso elimina a
  // junção horizontal que aparecia quando duas superfícies nativas se cruzavam.
  const waveGeometry = useMemo(() => {
    if (!cardSize.width || !waterRenderHeight) {
      return null;
    }
    const wavelength = Math.max(120, cardSize.width * 0.65);
    const totalWidth = cardSize.width + wavelength + WATER_WAVE_HORIZONTAL_OVERSCAN;
    return {
      wavelength,
      totalWidth,
      frontPath: buildRepeatingWavePath({
        totalWidth,
        wavelength,
        height: waterRenderHeight,
        amplitude: WATER_WAVE_AMPLITUDE,
      }),
    };
  }, [cardSize.width, waterRenderHeight]);
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
  const waveCombinedShift = useMemo(
    () => Animated.add(waveFrontShift, wavePulseShift),
    [waveFrontShift, wavePulseShift]
  );
  const waterTranslateY = useMemo(
    () => Animated.add(waterLevelAnim, waterPanelOffsetAnim),
    [waterLevelAnim, waterPanelOffsetAnim]
  );
  // Na primeira medicao do card assume o nivel direto; senao a agua "encheria"
  // toda vez que o card entra na lista.
  useEffect(() => {
    if (!cardSize.height) {
      return undefined;
    }
    const target = Math.max(0, waterRenderHeight - waterFillHeight);
    const panelOffsetTarget = isAdjustOpen
      ? waterFillHeight - expandedWaterFillHeight
      : 0;
    const panelStateChanged = previousWaterPanelOpenRef.current !== isAdjustOpen;
    previousWaterPanelOpenRef.current = isAdjustOpen;
    if (!hasWaterLevelRef.current || reduceMotion) {
      hasWaterLevelRef.current = true;
      waterLevelAnim.setValue(target);
      waterPanelOffsetAnim.setValue(panelOffsetTarget);
      return undefined;
    }
    const duration = panelStateChanged
      ? isAdjustOpen
        ? QUANTUM_STEPPER_OPEN_MS
        : QUANTUM_STEPPER_CLOSE_MS
      : 520;
    const easing = panelStateChanged
      ? isAdjustOpen
        ? QUANTUM_STEPPER_OPEN_EASING
        : QUANTUM_STEPPER_CLOSE_EASING
      : Easing.out(Easing.cubic);
    const rise = Animated.parallel([
      Animated.timing(waterLevelAnim, {
        toValue: target,
        duration,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(waterPanelOffsetAnim, {
        toValue: panelOffsetTarget,
        duration,
        easing,
        useNativeDriver: true,
      }),
    ]);
    rise.start();
    return () => {
      rise.stop();
    };
  }, [
    cardSize.height,
    expandedWaterFillHeight,
    isAdjustOpen,
    reduceMotion,
    waterFillHeight,
    waterLevelAnim,
    waterPanelOffsetAnim,
    waterRenderHeight,
  ]);

  const waterGradientId = useMemo(
    () => `water-gradient-${String(task.id).replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [task.id]
  );


  useEffect(() => {
    if (!isQuantum || !isWaterAnimation || !isVisible || reduceMotion) {
      waveShiftAnim.stopAnimation();
      waveShiftAnim.setValue(0);
      return undefined;
    }

    waveShiftAnim.stopAnimation();
    waveShiftAnim.setValue(0);
    const animation = Animated.loop(
      Animated.timing(waveShiftAnim, {
        toValue: 1,
        duration: WATER_WAVE_DURATION_MS,
        easing: Easing.linear,
        // Fabric/Android deixa filhos SVG transparentes com transform nativo.
        // Aqui o JS altera apenas a transformação da view já desenhada.
        useNativeDriver: false,
      })
    );

    animation.start();
    return () => {
      animation.stop();
      waveShiftAnim.setValue(0);
    };
  }, [
    isQuantum,
    isVisible,
    isWaterAnimation,
    reduceMotion,
    waveShiftAnim,
  ]);

  useEffect(() => {
    if (!isQuantum || !isWaterAnimation || !task.quantum?.wavePulse || reduceMotion) {
      waveIntensityAnim.stopAnimation();
      waveIntensityAnim.setValue(1);
      return undefined;
    }
    waveIntensityAnim.stopAnimation();
    waveIntensityAnim.setValue(1);
    const animation = Animated.sequence([
      Animated.spring(waveIntensityAnim, {
        toValue: 1.6,
        damping: 7,
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
    ]);
    animation.start();
    return () => animation.stop();
  }, [
    isQuantum,
    isWaterAnimation,
    reduceMotion,
    task.quantum?.wavePulse,
    waveIntensityAnim,
  ]);
  const isQuantumComplete =
    isQuantum && getQuantumProgressLabel(task, progressKey) && task.completed;

  // Stepper inline: tap no ⊕ soma o passo direto (água/contador reagem na hora);
  // long-press abre o painel com −/+, presets e OK.
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
      duration: isAdjustOpen ? QUANTUM_STEPPER_OPEN_MS : QUANTUM_STEPPER_CLOSE_MS,
      easing: isAdjustOpen
        ? QUANTUM_STEPPER_OPEN_EASING
        : QUANTUM_STEPPER_CLOSE_EASING,
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
  const handleTogglePress = useCallback(() => {
    if (isQuantum) {
      closeActions();
      if (isQuantumComplete) {
        // Meta cheia: somar seria clampado (nada acontecia). Tap abre o
        // painel p/ decrescer ou ajustar.
        handleToggleLongPress();
        return;
      }
      applyQuantumStep(1);
      return;
    }
    handleAction(() => onToggleCompletion?.(task));
  }, [
    applyQuantumStep,
    closeActions,
    handleAction,
    handleToggleLongPress,
    isQuantum,
    isQuantumComplete,
    onToggleCompletion,
    task,
  ]);

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
            styles.swipeActionArchive,
            task.profileLocked && styles.swipeActionButtonDisabled,
          ]}
          onPress={() => handleAction(() => onArchive?.(task))}
          accessibilityRole="button"
          accessibilityLabel={t.taskCard.archiveTask}
          disabled={task.profileLocked}
        >
          <Ionicons name="archive-outline" size={18} color="#fff" />
          <Text
            style={[
              styles.swipeActionText,
              styles.swipeActionTextArchive,
              task.profileLocked && styles.swipeActionTextDisabled,
            ]}
          >
            {t.taskCard.archive}
          </Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.taskCard,
          {
            backgroundColor: backgroundColor || '#fff',
            borderColor,
            transform: [{ translateX }],
          },
        ]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          // O primeiro layout acontece com o painel fechado. Guardar essa
          // altura impede um setState por frame ao abrir/fechar o stepper.
          const collapsedHeight = hasMeasuredCollapsedCardRef.current
            ? cardSizeRef.current.height
            : height;
          hasMeasuredCollapsedCardRef.current = true;
          if (
            cardSizeRef.current.width === width &&
            cardSizeRef.current.height === collapsedHeight
          ) {
            return;
          }
          const nextSize = { width, height: collapsedHeight };
          cardSizeRef.current = nextSize;
          setCardSize(nextSize);
        }}
      >
        {isQuantum && isWaterAnimation && waveGeometry ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.waterFallbackFill,
              {
                height: waterRenderHeight,
                transform: [{ translateY: waterTranslateY }],
              },
            ]}
          >
            <Svg
              width={cardSize.width}
              height={waterRenderHeight}
              style={styles.waterFallbackWave}
            >
              <Defs>
                <SvgLinearGradient id={waterGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor={WATER_GRADIENT_TOP_COLOR} />
                  <Stop offset="100%" stopColor={WATER_GRADIENT_BOTTOM_COLOR} />
                </SvgLinearGradient>
              </Defs>
              <AnimatedPath
                d={waveGeometry.frontPath}
                fill={`url(#${waterGradientId})`}
                style={{ transform: [{ translateX: waveCombinedShift }] }}
              />
            </Svg>
          </Animated.View>
        ) : null}
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
                style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
                numberOfLines={1}
              >
                {task.title}
              </Text>
              <View style={styles.taskTimeRow}>
                <Text style={styles.taskTime} numberOfLines={1}>
                  {formatTaskTime(getTaskTimeForOccurrence(task, dateKey), {
                    language,
                    anytimeLabel: t.sheet.anytime,
                  })}
                </Text>
                <FinishedMilestoneBadge
                  value={finishedMilestone}
                  message={finishedMilestoneMessage}
                  animationToken={finishedMilestoneAnimationToken}
                  reduceMotion={reduceMotion}
                  accessibilityLabel={t.taskCard.finishedMilestoneAccessibility.replace(
                    '{count}',
                    String(finishedMilestone ?? '')
                  )}
                  style={styles.finishedMilestoneBadge}
                />
              </View>
              {totalLabel ? (
                <View style={styles.taskMetaRow}>
                  <View style={[styles.taskSubtaskSummary, styles.taskSubtaskSummaryInline]}>
                    <Text style={styles.taskSubtaskSummaryText}>{totalLabel}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
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
                isQuantumComplete
                  ? t.taskCard.adjustProgress
                  : isQuantum && quantumStepLabel
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
                <Ionicons name="options-outline" size={10} color="#666b7d" />
              </Pressable>
            ) : null}
          </View>
        )}
        </View>
        {isQuantum && (
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
                  outputRange: [0, QUANTUM_STEPPER_HEIGHT],
                }),
                marginTop: adjustPanelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, QUANTUM_STEPPER_MARGIN_TOP],
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
