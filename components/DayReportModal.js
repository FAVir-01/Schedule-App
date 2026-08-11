import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Line } from 'react-native-svg';
import { format } from 'date-fns';
import { getMonthImageSource, getMonthReducedMotionColor } from '../constants/months';
import { translations } from '../constants/i18n';
import { getDateKey } from '../utils/dateUtils';
import { lightenColor } from '../utils/colorUtils';
import { getMoodMarker } from '../utils/moodUtils';
import {
  getQuantumProgressLabel,
  shouldCountTaskTowardsCompletion,
} from '../utils/taskUtils';
import { FALLBACK_EMOJI } from '../constants/app';
import { styles } from '../styles/appStyles';

function DayReportModal({
  visible,
  date,
  tasks,
  onClose,
  customImages,
  language = 'en',
  mood = null,
  moodAppearance = {},
  onEditReflection,
  reduceMotion = false,
}) {
  const { height } = useWindowDimensions();
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);

  // 1. Configuração da Animação
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [displayRate, setDisplayRate] = useState(0);

  // 2. Lógica para pegar o GIF do mês correto
  // Se 'date' for nulo, não quebra o app
  const monthIndex = date?.getMonth() ?? 0;
  const imageSource = date
    ? getMonthImageSource(monthIndex, customImages, { reduceMotion })
    : null;
  const reducedMotionColor = getMonthReducedMotionColor(monthIndex);

  const scoredTasks = tasks.filter(shouldCountTaskTowardsCompletion);
  const totalTasks = scoredTasks.length;
  const reminderTasks = tasks.filter((task) => task.type === 'reminder');
  const hasOnlyReminders = reminderTasks.length > 0 && totalTasks === 0;
  const dateKey = date ? getDateKey(date) : null;
  const completedTasks = scoredTasks.filter((t) => t.completed).length;
  const targetSuccessRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const t = translations[language] ?? translations.en;
  const [imageErrors, setImageErrors] = useState({});

  useEffect(() => {
    setImageErrors({});
  }, [date, tasks, visible]);

  useEffect(() => {
    if (visible) {
      progressAnim.setValue(0);
      setDisplayRate(0);

      Animated.timing(progressAnim, {
        toValue: targetSuccessRate,
        duration: 1000,
        useNativeDriver: false,
      }).start();

      const listenerId = progressAnim.addListener(({ value }) => {
        setDisplayRate(Math.round(value));
      });

      return () => {
        progressAnim.removeListener(listenerId);
      };
    }
  }, [visible, targetSuccessRate, progressAnim]);

  // Gauge de ticks: arco aberto embaixo, estilo velocímetro.
  const TICK_COUNT = 45;
  const ARC_DEGREES = 210;
  const START_ANGLE = -105; // 0 = topo; arco vai de -105° a +105°
  const R_OUTER = 68;
  const R_INNER = 52;
  const TICK_WIDTH = 3;
  const GAUGE_SIZE = 144;
  const gaugeCenter = GAUGE_SIZE / 2;

  if (!visible || !date) return null;

  const getSummaryText = () => {
    if (hasOnlyReminders) {
      return t.report.onlyReminders.replace('{total}', String(reminderTasks.length));
    }
    if (totalTasks === 0) return t.report.noHabits;
    if (targetSuccessRate === 100) return t.report.perfect;
    if (targetSuccessRate === 0)
      return t.report.noneCompleted
      .replace('{total}', String(totalTasks));
    return t.report.partialCompleted
      .replace('{completed}', String(completedTasks))
      .replace('{total}', String(totalTasks));
  };

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.reportOverlay}>
        <Pressable style={styles.reportBackdrop} onPress={onClose} accessible={false} />

        <View style={[styles.reportSheet, { maxHeight: height * 0.9 }]}>
          <ImageBackground
            source={imageSource}
            style={[styles.reportHeaderImage, { backgroundColor: reducedMotionColor }]}
            imageStyle={{ resizeMode: 'cover' }}
          >
            {/* Overlay removido aqui */}

            <View style={styles.reportDateContainer}>
              <Text style={styles.reportDateBig}>{format(date, 'd MMM')}</Text>
              <Text style={styles.reportYear}>{format(date, 'yyyy')}</Text>
            </View>

            <Pressable
              onPress={onClose}
              style={styles.reportCloseButton}
              accessibilityRole="button"
              accessibilityLabel={t.report.close}
            >
              <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </ImageBackground>

          <ScrollView contentContainerStyle={styles.reportScrollContent}>
            <Text style={styles.reportSummaryText}>{getSummaryText()}</Text>

            {mood ? (
              <View style={styles.reportMoodCard}>
                {/* Estilo "post de rede social": humor no lugar do avatar,
                    nível como nome, tags como status, texto e foto grande.
                    Editar é só pelo lápis; tocar na foto abre em tela cheia. */}
                <View style={styles.reportMoodHeader}>
                  <View style={styles.reportMoodAvatar}>
                    {(() => {
                      const marker = getMoodMarker(mood, moodAppearance);
                      return marker?.image ? (
                        <Image source={{ uri: marker.image }} style={styles.reportMoodImage} />
                      ) : (
                        <Text style={styles.reportMoodEmoji}>{marker?.emoji || '📝'}</Text>
                      );
                    })()}
                  </View>
                  <View style={styles.reportMoodTextWrapper}>
                    <Text style={styles.reportMoodTitle}>
                      {mood.level ? t.reflection.levels[mood.level] : t.reflection.title}
                    </Text>
                    {mood.tags?.length ? (
                      <Text style={styles.reportMoodTags}>
                        {mood.tags.map((tag) => t.reflection.tags[tag] ?? tag).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => onEditReflection?.(dateKey)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={t.reflection.editReflection}
                  >
                    <Ionicons name="pencil" size={18} color="#625f79" />
                  </Pressable>
                </View>
                {mood.note ? (
                  <Text style={styles.reportMoodNote}>{mood.note}</Text>
                ) : null}
                {mood.photo ? (
                  <Pressable
                    onPress={() => setIsPhotoOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t.reflection.openPhoto}
                  >
                    <Image
                      source={{ uri: mood.photo }}
                      style={styles.reportMoodPhoto}
                      accessible={false}
                    />
                  </Pressable>
                ) : null}
                {mood.photo ? (
                  <Modal
                    visible={isPhotoOpen}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setIsPhotoOpen(false)}
                  >
                    <Pressable
                      style={styles.reportPhotoViewerOverlay}
                      onPress={() => setIsPhotoOpen(false)}
                      accessibilityRole="button"
                      accessibilityLabel={t.reflection.closePhoto}
                    >
                      <Image
                        source={{ uri: mood.photo }}
                        style={styles.reportPhotoViewerImage}
                        resizeMode="contain"
                        accessible={false}
                      />
                    </Pressable>
                  </Modal>
                ) : null}
              </View>
            ) : (
              <Pressable
                style={styles.reportAddMoodButton}
                onPress={() => onEditReflection?.(dateKey)}
                accessibilityRole="button"
                accessibilityLabel={t.reflection.addReflection}
              >
                <Ionicons name="happy-outline" size={18} color="#3c2ba7" />
                <Text style={styles.reportAddMoodText}>{t.reflection.addReflection}</Text>
              </Pressable>
            )}

            <Text style={styles.reportSectionTitle}>{t.report.dailyStats}</Text>

            <View style={styles.statsCard}>
              <View style={styles.gaugeContainer}>
                <View
                  style={{
                    width: GAUGE_SIZE,
                    height: GAUGE_SIZE,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
                    {Array.from({ length: TICK_COUNT }, (_, i) => {
                      const angle = START_ANGLE + (i / (TICK_COUNT - 1)) * ARC_DEGREES;
                      const isFilled =
                        displayRate > 0 && (i / (TICK_COUNT - 1)) * 100 <= displayRate;
                      return (
                        <G key={i} rotation={angle} origin={`${gaugeCenter}, ${gaugeCenter}`}>
                          <Line
                            x1={gaugeCenter}
                            y1={gaugeCenter - R_OUTER}
                            x2={gaugeCenter}
                            y2={gaugeCenter - R_INNER}
                            stroke={isFilled ? '#1f9d6d' : '#e8eaf0'}
                            strokeWidth={TICK_WIDTH}
                            strokeLinecap="round"
                          />
                        </G>
                      );
                    })}
                  </Svg>

                  <View
                    style={{
                      position: 'absolute',
                      top: '36%',
                      left: 0,
                      right: 0,
                      alignItems: 'center',
                    }}
                  >
                    <View style={styles.gaugeValueRow}>
                      <Text style={styles.gaugePercentage}>{displayRate}</Text>
                      <Text style={styles.gaugePercentSign}>%</Text>
                    </View>
                    <Text style={styles.gaugeLabel}>{t.report.successRate}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t.report.committed}</Text>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statNumber}>{totalTasks}</Text>
                    <View style={[styles.statIconChip, { backgroundColor: '#efecfb' }]}>
                      <Ionicons name="create-outline" size={16} color="#3c2ba7" />
                    </View>
                  </View>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t.report.completed}</Text>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statNumber}>{completedTasks}</Text>
                    <View style={[styles.statIconChip, { backgroundColor: '#d9f2e5' }]}>
                      <Ionicons name="checkmark" size={16} color="#1f9d6d" />
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {tasks.length > 0 && (
              <>
                <Text style={styles.reportSectionTitle}>
                  {hasOnlyReminders ? t.report.reminders : t.report.habits}
                </Text>
                <View style={styles.reportTaskList}>
                  {tasks.map((task, index) => {
                    const baseColor = task.color || '#3c2ba7';
                    const lightBg = lightenColor(baseColor, 0.85);
                    const quantumLabel = getQuantumProgressLabel(task, dateKey);

                    return (
                      <View
                        key={index}
                        style={[
                          styles.reportTaskRow,
                          { backgroundColor: lightBg, borderColor: lightenColor(baseColor, 0.6), borderWidth: 1 },
                        ]}
                      >
                        <View
                          style={[
                            styles.reportTaskIcon,
                            { backgroundColor: '#fff' },
                          ]}
                        >
                          {task.customImage && !imageErrors[task.id] ? (
                            <Image
                              source={{ uri: task.customImage }}
                              style={styles.reportTaskIconImage}
                              onError={() =>
                                setImageErrors((prev) => ({ ...prev, [task.id]: true }))
                              }
                            />
                          ) : (
                            <Text style={{ fontSize: 18 }}>{task.emoji || FALLBACK_EMOJI}</Text>
                          )}
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.reportTaskTitle,
                              task.completed && { textDecorationLine: 'line-through', color: '#888' },
                            ]}
                          >
                            {task.title}
                          </Text>

                          {quantumLabel ? (
                            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                              {quantumLabel}
                            </Text>
                          ) : task.type !== 'reminder' && task.totalSubtasks > 0 ? (
                            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                              {task.completedSubtasks}/{task.totalSubtasks} subtasks
                            </Text>
                          ) : null}
                        </View>

                        {task.type !== 'reminder' &&
                          (task.completed ? (
                            <Ionicons name="checkmark-circle" size={24} color={baseColor} />
                          ) : (
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                borderWidth: 2,
                                borderColor: '#ddd',
                              }}
                            />
                          ))}
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default DayReportModal;
