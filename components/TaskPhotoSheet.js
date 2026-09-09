import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { differenceInCalendarDays, format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { lightenColor } from '../utils/colorUtils';
import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import {
  getMilestoneTierId,
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
import { getTaskScheduleRows } from '../utils/taskScheduleDetails';
import { getTaskTimeForDate } from '../domain/taskSchedule';
import { styles } from '../styles/appStyles';
import MilestoneSeal from './MilestoneSeal';
import PolaroidFrame, { getPolaroidHeight } from './PolaroidFrame';
import TaskHeatmap from './TaskHeatmap';
import NoteEditorModal from './NoteEditorModal';

const OPEN_DURATION = 460;
const CLOSE_DURATION = 320;
const SHEET_TRAVEL = 0.22;
const BACKDROP_END = 0.55;
const SHEET_FADE_END = 0.35;
const SHEET_END = 0.86;
const CONTENT_START = 0.44;
const OPEN_EASING = Easing.bezier(0.05, 0.7, 0.1, 1);
const CLOSE_EASING = Easing.bezier(0.3, 0, 0.8, 0.15);
// A aba cobre a tela inteira: o conteudo abaixo da foto e uma lista longa
// (nota do dia, metricas, heatmap, marcos, dados) e a faixa de card que sobrava
// no topo so tirava altura de rolagem sem mostrar nada.
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

function CompactDayNote({ note, task, onPress }) {
  const cardColor = note.cardColor ?? task.color;
  const imageCount = Array.isArray(note.images) ? note.images.length : 0;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.photoSheetCompactNote,
        {
          backgroundColor: lightenColor(cardColor, 0.78),
          borderColor: cardColor,
        },
        pressed && styles.photoSheetCompactNotePressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[styles.photoSheetCompactNoteAccent, { backgroundColor: cardColor }]} />
      <View style={styles.photoSheetCompactNoteContent}>
        <Text style={styles.photoSheetCompactNoteTitle} numberOfLines={1}>
          {note.title || task.title}
        </Text>
        {note.text ? (
          <Text style={styles.photoSheetCompactNoteText} numberOfLines={2}>
            {note.text}
          </Text>
        ) : null}
        {imageCount ? (
          <View style={styles.photoSheetCompactNoteImages}>
            <Ionicons name="image-outline" size={14} color="#626778" />
            <Text style={styles.photoSheetCompactNoteImageCount}>{imageCount}</Text>
          </View>
        ) : null}
      </View>
      {note.pinned ? <Ionicons name="pin" size={15} color="#655b83" /> : null}
    </Pressable>
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
  onSaveNote,
  onDeleteNote,
  onClose,
  onClosed,
}) {
  const { width, height } = useWindowDimensions();
  const onClosedRef = useRef(onClosed);
  const scrollRef = useRef(null);
  const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false);
  const t = translations[language] ?? translations.en;
  const locale = getDateLocale(language);

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    setIsNoteEditorOpen(false);
  }, [dateKey, task?.id, visible]);

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
    onClose?.();
  }, [onClose]);

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
    const selectedNoteDate = normalizeDateValue(selectedKey);
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
    const noteDateLabel =
      selectedKey === getDateKey(today) ? t.taskModal.today : formatDate(selectedNoteDate);
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
      ...getTaskScheduleRows(task, language),
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
    const latestMilestone = getTaskLatestFinishedMilestone(task);
    const currentTierId = getMilestoneTierId(latestMilestone);
    const nextTierId = getMilestoneTierId(nextMilestone);
    return {
      detailRows,
      finished,
      isRecurring,
      metrics,
      latestMilestone,
      noteDateLabel,
      nextMilestone,
      milestoneProgress: getMilestoneProgress(finished, nextMilestone),
      // O selo grande mostra a patente ja conquistada; quem ainda nao chegou ao
      // decimo ve o primeiro emblema apagado, para saber o que vem.
      emblemMilestone: latestMilestone ?? nextMilestone,
      emblemName: t.taskModal.emblems[currentTierId ?? nextTierId],
      emblemLabel: latestMilestone ? t.taskModal.currentEmblem : t.taskModal.nextEmblem,
      hasEmblem: Boolean(latestMilestone),
      // Da 300a em diante a patente e teto: os marcos continuam, o metal nao
      // muda mais, e ai o rodape anuncia so o proximo numero.
      nextEmblemName: nextTierId && nextTierId !== currentTierId
        ? t.taskModal.emblems[nextTierId]
        : null,
    };
  }, [dateKey, language, locale, t, task]);

  if (!task || !flight || !summary) {
    return null;
  }

  const frameSize = Math.min(MAX_FRAME, Math.round(width * 0.46));
  const frameHeight = getPolaroidHeight(frameSize);
  // A folha ocupa a janela inteira (o `top: 0` esta no estilo), entao quem
  // afasta o conteudo da barra de status e o recuo de seguranca aplicado ao topo
  // do que fica dentro dela.
  const photoTop = topInset + PHOTO_GAP;
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
            backgroundColor: lightenColor(task.color, 0.9),
            paddingTop: topInset + PHOTO_GAP + frameHeight + 18,
            paddingBottom: bottomInset + 16,
            opacity: range([0, 1, 1], [0, SHEET_FADE_END, 1]),
            transform: [
              { translateY: range([height * SHEET_TRAVEL, 0, 0], [0, SHEET_END, 1]) },
            ],
          },
        ]}
      >
        <Pressable
          style={[styles.photoSheetClose, { top: topInset + 14 }]}
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
            {formatTaskTime(getTaskTimeForDate(task, dateKey), {
              language,
              anytimeLabel: t.sheet.anytime,
            })}
          </Text>

          <ScrollView
            key={task.id}
            ref={scrollRef}
            style={styles.photoSheetScroll}
            contentContainerStyle={[
              styles.photoSheetScrollContent,
              { paddingBottom: 108 },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
            {task.note ? (
              <View>
                <Text style={styles.photoSheetSectionHeading}>
                  {t.taskModal.notesForDay.replace('{date}', summary.noteDateLabel)}
                </Text>
                <CompactDayNote
                  note={task.note}
                  task={task}
                  onPress={() => setIsNoteEditorOpen(true)}
                />
              </View>
            ) : null}

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
                    <MilestoneSeal
                      milestone={summary.emblemMilestone}
                      size={46}
                      style={summary.hasEmblem ? null : styles.photoSheetMilestoneSealLocked}
                    />
                    <View style={styles.photoSheetMilestoneHeaderText}>
                      <Text style={styles.photoSheetMilestoneLabel}>{summary.emblemLabel}</Text>
                      <Text style={styles.photoSheetMilestoneValue} numberOfLines={1}>
                        {summary.emblemName}
                      </Text>
                      <Text style={styles.photoSheetMilestoneCaption}>
                        {t.taskModal.emblemMilestone.replace(
                          '{count}',
                          String(summary.emblemMilestone)
                        )}
                      </Text>
                    </View>
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
                  <View style={styles.photoSheetMilestoneFooter}>
                    <Text style={styles.photoSheetMilestoneRemaining}>
                      {t.taskModal.remainingToMilestone.replace(
                        '{count}',
                        String(summary.nextMilestone - summary.finished)
                      )}
                    </Text>
                    {summary.hasEmblem ? (
                      <View style={styles.photoSheetMilestoneNext}>
                        {summary.nextEmblemName ? (
                          <MilestoneSeal milestone={summary.nextMilestone} size={18} />
                        ) : null}
                        <Text style={styles.photoSheetMilestoneNextText} numberOfLines={1}>
                          {summary.nextEmblemName
                            ? `${t.taskModal.nextEmblem}: ${summary.nextEmblemName}`
                            : t.taskModal.nextMilestoneCount.replace(
                                '{count}',
                                String(summary.nextMilestone)
                              )}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}

            <View>
              <Text style={styles.photoSheetSectionHeading}>{t.taskModal.details}</Text>
              <InfoRows rows={summary.detailRows} />
            </View>
          </ScrollView>
        </Animated.View>

        <Pressable
          style={({ pressed }) => [
            styles.notesFab,
            { bottom: bottomInset + 20 },
            pressed && styles.notesFabPressed,
          ]}
          onPress={() => setIsNoteEditorOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={task.note ? t.notes.editNote : t.notes.newNote}
        >
          <Ionicons
            name={task.note ? 'pencil' : 'add'}
            size={task.note ? 24 : 31}
            color="#ffffff"
          />
        </Pressable>
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

      <NoteEditorModal
        visible={isNoteEditorOpen}
        note={task.note}
        defaultTitle={task.title}
        taskContext={{
          taskTitle: task.title,
          taskImage: task.customImage,
          taskEmoji: task.emoji,
          taskColor: task.color,
        }}
        language={language}
        reduceMotion={reduceMotion}
        onClose={() => setIsNoteEditorOpen(false)}
        onSave={(content) =>
          onSaveNote?.(task.id, dateKey ?? getDateKey(new Date()), content)
        }
        onDelete={onDeleteNote}
      />
    </View>
  );
}
