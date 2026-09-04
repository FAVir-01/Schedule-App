import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { differenceInCalendarDays, format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { lightenColor } from '../utils/colorUtils';
import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import {
  getQuantumProgressLabel,
  getSubtaskCompletionStatus,
  getTaskFinishedCount,
  getTaskLastCompletionDateKey,
  getTaskLatestFinishedMilestone,
  getTaskRepeatDisplayLabel,
  getTaskStreak,
  getTaskTagDisplayLabel,
  getTaskTypeDisplayLabel,
  shouldCountTaskTowardsStreak,
} from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { NOTES_MAX_LENGTH } from '../domain/taskDraft';
import { styles } from '../styles/appStyles';
import PolaroidFrame, { getPolaroidHeight } from './PolaroidFrame';
import TaskHeatmap from './TaskHeatmap';

const OPEN_DURATION = 460;
const CLOSE_DURATION = 320;
const SHEET_TRAVEL = 0.22;
const BACKDROP_END = 0.55;
const SHEET_FADE_END = 0.35;
const SHEET_END = 0.86;
const CONTENT_START = 0.44;
const OPEN_EASING = Easing.bezier(0.05, 0.7, 0.1, 1);
const CLOSE_EASING = Easing.bezier(0.3, 0, 0.8, 0.15);
const SHEET_GAP = 40;
const PHOTO_GAP = 26;
const MAX_FRAME = 190;

const getNextMilestone = (finished) => {
  if (finished < 10) {
    return 10;
  }
  if (finished < 50) {
    return 50;
  }
  return (Math.floor(finished / 50) + 1) * 50;
};

const getMilestoneProgress = (finished, next) => {
  const previous = finished < 10 ? 0 : finished < 50 ? 10 : Math.floor(finished / 50) * 50;
  const span = next - previous;
  return span > 0 ? Math.max(0, Math.min(100, ((finished - previous) / span) * 100)) : 0;
};

function Metric({ label, value }) {
  return (
    <View style={styles.photoSheetMetric}>
      <Text style={styles.photoSheetMetricValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.photoSheetMetricLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function InfoRows({ rows }) {
  return (
    <View style={styles.photoSheetRowsContent}>
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={[
            styles.photoSheetRow,
            index === rows.length - 1 && styles.photoSheetRowLast,
          ]}
        >
          <Text style={styles.photoSheetRowLabel}>{row.label}</Text>
          <Text style={styles.photoSheetRowValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function TaskPhotoSheet({
  visible,
  task,
  dateKey,
  flight,
  progress,
  language = 'en',
  reduceMotion = false,
  topInset = 0,
  bottomInset = 0,
  hasImageError = false,
  onImageError,
  onUpdateNotes,
  onClose,
  onClosed,
}) {
  const { width, height } = useWindowDimensions();
  const onClosedRef = useRef(onClosed);
  const scrollRef = useRef(null);
  const keyboardHeightRef = useRef(0);
  const baseWindowHeightRef = useRef(height);
  const [notesDraft, setNotesDraft] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const t = translations[language] ?? translations.en;
  const locale = getDateLocale(language);

  const scrollNotesIntoView = useCallback((animated = true) => {
    scrollRef.current?.scrollTo({
      // A nota é o primeiro bloco desta aba. Mantê-la ancorada no início
      // evita que o ajuste do teclado corte o rótulo ou as primeiras linhas.
      y: 0,
      animated,
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = event?.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = nextHeight;
      setKeyboardHeight(nextHeight);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  // Replica o comportamento da nota em Emotions: depois que a janela termina
  // de se ajustar ao teclado, reposiciona o campo novamente. No Android
  // edge-to-edge, uma única rolagem no onFocus acontece cedo demais.
  useEffect(() => {
    if (keyboardHeight <= 0) {
      return undefined;
    }
    const earlyId = setTimeout(() => scrollNotesIntoView(false), 100);
    const lateId = setTimeout(() => scrollNotesIntoView(true), 450);
    return () => {
      clearTimeout(earlyId);
      clearTimeout(lateId);
    };
  }, [keyboardHeight, scrollNotesIntoView]);

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    setNotesDraft(`${task?.notes ?? ''}`);
  }, [task?.id, task?.notes]);

  // O componente permanece montado durante a animação de volta. Sem zerar
  // aqui, a próxima abertura herdava a rolagem anterior e podia começar no
  // heatmap, escondendo justamente nota e visão geral.
  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const resetScroll = () => scrollRef.current?.scrollTo({ y: 0, animated: false });
    const frameId = requestAnimationFrame(resetScroll);
    // O ScrollView nativo pode restaurar o offset depois do primeiro layout,
    // especialmente quando outra tarefa abre durante a animação de fechamento.
    // Reaplicar no fim da entrada deixa toda abertura determinística.
    const layoutId = setTimeout(resetScroll, 80);
    const animationId = setTimeout(resetScroll, OPEN_DURATION + 80);
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(layoutId);
      clearTimeout(animationId);
    };
  }, [task?.id, visible]);

  const taskId = task?.id;
  const commitNotes = useCallback(() => {
    if (taskId != null) {
      onUpdateNotes?.(taskId, notesDraft);
    }
  }, [notesDraft, onUpdateNotes, taskId]);

  const wasVisibleRef = useRef(false);
  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      commitNotes();
    }
    wasVisibleRef.current = visible;
  }, [commitNotes, visible]);

  useEffect(() => {
    if (!flight) {
      return undefined;
    }
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : visible ? OPEN_DURATION : CLOSE_DURATION,
      easing: visible ? OPEN_EASING : CLOSE_EASING,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) {
        onClosedRef.current?.();
      }
    });
    return () => animation.stop();
  }, [flight, progress, reduceMotion, visible]);

  const handleClose = useCallback(() => {
    commitNotes();
    Keyboard.dismiss();
    onClose?.();
  }, [commitNotes, onClose]);

  const summary = useMemo(() => {
    if (!task) {
      return null;
    }
    const today = normalizeDateValue(new Date());
    const startDate = normalizeDateValue(task.dateKey ?? task.date);
    const endDate = normalizeDateValue(task.repeat?.endDate);
    const archivedDate = normalizeDateValue(task.archivedAt);
    const lastFinishedKey = getTaskLastCompletionDateKey(task);
    const lastFinishedDate = normalizeDateValue(lastFinishedKey);
    const finished = getTaskFinishedCount(task);
    const isRecurring = shouldCountTaskTowardsStreak(task);
    const isReminder = task.type === 'reminder';
    const selectedKey = dateKey ?? getDateKey(today);
    const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
    const completedSubtasks = totalSubtasks
      ? task.subtasks.filter((subtask) => getSubtaskCompletionStatus(subtask, selectedKey)).length
      : 0;

    let activeThrough = today;
    for (const candidate of [endDate, archivedDate]) {
      if (candidate && candidate < activeThrough) {
        activeThrough = candidate;
      }
    }
    if (!isRecurring && !isReminder && lastFinishedDate && lastFinishedDate < activeThrough) {
      activeThrough = lastFinishedDate;
    }
    const activeDays = startDate
      ? Math.max(0, differenceInCalendarDays(activeThrough, startDate) + 1)
      : 0;

    const formatDate = (date) =>
      date ? format(date, 'PPP', { locale }) : t.common.notSet;
    const lastFinishedLabel = lastFinishedDate
      ? getDateKey(lastFinishedDate) === getDateKey(today)
        ? t.taskModal.today
        : formatDate(lastFinishedDate)
      : t.taskModal.noCompletions;
    const activeDaysLabel = `${activeDays} ${
      activeDays === 1 ? t.profile.day : t.profile.days
    }`;
    const quantumProgress = getQuantumProgressLabel(task, selectedKey);

    const detailRows = [
      {
        key: 'repeat',
        label: t.taskDetails.repeat,
        value: getTaskRepeatDisplayLabel(task.repeat, t.taskDisplay.repeats),
      },
      { key: 'startDate', label: t.taskDetails.startDate, value: formatDate(startDate) },
      ...(endDate
        ? [{ key: 'endDate', label: t.taskModal.endDate, value: formatDate(endDate) }]
        : []),
      ...(quantumProgress
        ? [{ key: 'progress', label: t.taskModal.currentProgress, value: quantumProgress }]
        : []),
      ...(totalSubtasks > 0
        ? [
            {
              key: 'subtasks',
              label: t.taskDetails.subtasks,
              value: t.taskModal.subtaskProgress
                .replace('{completed}', String(completedSubtasks))
                .replace('{total}', String(totalSubtasks)),
            },
          ]
        : []),
      { key: 'type', label: t.taskDetails.type, value: getTaskTypeDisplayLabel(task, t.taskDisplay.types) },
      {
        key: 'tag',
        label: t.taskDetails.tag,
        value: getTaskTagDisplayLabel(task, t.taskDisplay.tags) ?? t.sheet.noTag,
      },
      ...(!isReminder
        ? [{ key: 'lastFinished', label: t.taskModal.lastFinished, value: lastFinishedLabel }]
        : []),
    ];

    const metrics = isRecurring
      ? [
          { key: 'streak', label: t.taskModal.currentStreak, value: getTaskStreak(task) },
          { key: 'finished', label: t.taskModal.totalFinished, value: finished },
          { key: 'active', label: t.taskModal.activeFor, value: activeDaysLabel },
        ]
      : isReminder
      ? [{ key: 'active', label: t.taskModal.activeFor, value: activeDaysLabel }]
      : [
          {
            key: 'status',
            label: t.taskModal.status,
            value: finished > 0 ? t.taskModal.completedStatus : t.taskModal.pendingStatus,
          },
          {
            key: 'active',
            label: finished > 0 ? t.taskModal.daysToFinish : t.taskModal.daysPending,
            value: activeDaysLabel,
          },
        ];

    const nextMilestone = getNextMilestone(finished);
    return {
      detailRows,
      finished,
      isRecurring,
      metrics,
      latestMilestone: getTaskLatestFinishedMilestone(task),
      nextMilestone,
      milestoneProgress: getMilestoneProgress(finished, nextMilestone),
    };
  }, [dateKey, locale, t, task]);

  if (!task || !flight || !summary) {
    return null;
  }

  if (keyboardHeight <= 0 && height > baseWindowHeightRef.current) {
    baseWindowHeightRef.current = height;
  }
  const resizeCompensated = Math.max(0, baseWindowHeightRef.current - height);
  const keyboardOverlap = Math.max(0, keyboardHeight - resizeCompensated);
  const frameSize = Math.min(MAX_FRAME, Math.round(width * 0.46));
  const frameHeight = getPolaroidHeight(frameSize);
  const sheetTop = topInset + SHEET_GAP;
  const photoTop = sheetTop + PHOTO_GAP;
  const photoLeft = (width - frameSize) / 2;
  const fromScale = flight.w / frameSize;
  const fromX = flight.x + flight.w / 2 - (photoLeft + frameSize / 2);
  const fromY = flight.y + flight.h / 2 - (photoTop + frameHeight / 2);
  const range = (outputRange, inputRange = [0, 1]) =>
    progress.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });

  return (
    <View style={styles.photoSheetRoot} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View
        style={[styles.photoSheetBackdrop, { opacity: range([0, 1, 1], [0, BACKDROP_END, 1]) }]}
        pointerEvents="none"
      />
      <Pressable
        style={styles.photoSheetDismiss}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel={t.taskDetails.close}
      />

      <Animated.View
        style={[
          styles.photoSheet,
          {
            top: sheetTop,
            backgroundColor: lightenColor(task.color, 0.9),
            paddingTop: PHOTO_GAP + frameHeight + 18,
            paddingBottom: (keyboardHeight > 0 ? keyboardOverlap : bottomInset) + 16,
            opacity: range([0, 1, 1], [0, SHEET_FADE_END, 1]),
            transform: [
              { translateY: range([height * SHEET_TRAVEL, 0, 0], [0, SHEET_END, 1]) },
            ],
          },
        ]}
      >
        <Pressable
          style={styles.photoSheetClose}
          onPress={handleClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t.taskDetails.close}
        >
          <Ionicons name="close" size={20} color="#1a1a2e" />
        </Pressable>

        <Animated.View
          style={[
            styles.photoSheetContent,
            {
              opacity: range([0, 0, 1], [0, CONTENT_START, 1]),
              transform: [{ translateY: range([14, 14, 0], [0, CONTENT_START, 1]) }],
            },
          ]}
        >
          <Text style={styles.photoSheetTitle} numberOfLines={2}>
            {task.title}
          </Text>
          <Text style={styles.photoSheetTime}>
            {formatTaskTime(task.time, { language, anytimeLabel: t.sheet.anytime })}
          </Text>

          <ScrollView
            key={task.id}
            ref={scrollRef}
            style={styles.photoSheetScroll}
            contentContainerStyle={styles.photoSheetScrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onLayout={() => {
              if (keyboardHeightRef.current > 0) {
                scrollNotesIntoView(false);
              }
            }}
          >
            <View>
              <Text style={styles.photoSheetSectionHeading}>{t.taskModal.notes}</Text>
              <View style={[styles.reflectionNoteField, styles.photoSheetNoteField]}>
                <TextInput
                  style={[styles.reflectionNoteInput, styles.photoSheetNotesInput]}
                  value={notesDraft}
                  onChangeText={setNotesDraft}
                  onFocus={() => setTimeout(() => scrollNotesIntoView(true), 120)}
                  onBlur={commitNotes}
                  multiline
                  maxLength={NOTES_MAX_LENGTH}
                  placeholder={t.taskModal.notesPlaceholder}
                  placeholderTextColor="#68637f"
                  selectionColor={task.color}
                  textAlignVertical="top"
                  accessibilityLabel={t.taskModal.notes}
                />
                <View style={styles.photoSheetNoteFooter}>
                  <Text style={styles.photoSheetNoteCount}>
                    {`${notesDraft.length}/${NOTES_MAX_LENGTH}`}
                  </Text>
                </View>
              </View>
            </View>

            <View>
              <Text style={styles.photoSheetSectionHeading}>{t.taskModal.overview}</Text>
              <View style={styles.photoSheetMetrics}>
                {summary.metrics.map((metric, index) => (
                  <React.Fragment key={metric.key}>
                    {index > 0 ? <View style={styles.photoSheetMetricDivider} /> : null}
                    <Metric label={metric.label} value={metric.value} />
                  </React.Fragment>
                ))}
              </View>
            </View>

            {summary.isRecurring ? (
              <TaskHeatmap
                task={task}
                language={language}
                labels={{
                  title: t.taskModal.activity,
                  period: t.taskModal.recentPeriod,
                  completed: t.taskModal.completed,
                  notCompleted: t.taskModal.notCompleted,
                  scheduled: t.taskModal.scheduled,
                  successRate: t.taskModal.successRate,
                }}
              />
            ) : null}

            {summary.isRecurring ? (
              <View>
                <Text style={styles.photoSheetSectionHeading}>{t.taskModal.milestone}</Text>
                <View style={styles.photoSheetMilestone}>
                  <View style={styles.photoSheetMilestoneHeader}>
                    <View>
                      <Text style={styles.photoSheetMilestoneLabel}>
                        {t.taskModal.nextMilestone}
                      </Text>
                      <Text style={styles.photoSheetMilestoneValue}>{summary.nextMilestone}</Text>
                    </View>
                    <Text style={styles.photoSheetMilestoneRemaining}>
                      {t.taskModal.remainingToMilestone.replace(
                        '{count}',
                        String(summary.nextMilestone - summary.finished)
                      )}
                    </Text>
                  </View>
                  <View style={styles.photoSheetMilestoneTrack}>
                    <View
                      style={[
                        styles.photoSheetMilestoneFill,
                        {
                          backgroundColor: task.color,
                          width: `${summary.milestoneProgress}%`,
                        },
                      ]}
                    />
                  </View>
                  {summary.latestMilestone ? (
                    <Text style={styles.photoSheetMilestoneLatest}>
                      {`${t.taskModal.latestMilestone}: ${summary.latestMilestone}`}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View>
              <Text style={styles.photoSheetSectionHeading}>{t.taskModal.details}</Text>
              <InfoRows rows={summary.detailRows} />
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.photoSheetFlyer,
          {
            left: photoLeft,
            top: photoTop,
            transform: [
              { translateX: range([fromX, 0, 0], [0, 0.9, 1]) },
              { translateY: range([fromY, 0, 0], [0, 0.9, 1]) },
              { scale: range([fromScale, 1]) },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <PolaroidFrame
          size={frameSize}
          task={task}
          hasImageError={hasImageError}
          onImageError={onImageError}
        />
      </Animated.View>
    </View>
  );
}
