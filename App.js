import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  Easing,
  Platform,
  Image,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import {
  addMonths as addMonthsDateFns,
  eachDayOfInterval,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getWeeksInMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  loadHistory,
  loadMonthImages,
  loadTasks,
  loadUserSettings,
  saveHistory,
  saveMonthImages,
  saveTasks,
  saveUserSettings,
} from './storage';
import AddHabitSheet from './components/AddHabitSheet';
import { MONTH_NAMES, getMonthImageSource } from './constants/months';
import { DEFAULT_USER_SETTINGS } from './constants/userSettings';
import { LEFT_TABS, RIGHT_TABS, getNavigationBarThemeForTab } from './constants/navigation';
import { interpolateHexColor, lightenColor } from './utils/colorUtils';
import {
  getDateKey,
  getMonthId,
  getMonthStart,
  normalizeDateValue,
  shouldTaskAppearOnDate,
} from './utils/dateUtils';
import { clamp01, clampValue } from './utils/mathUtils';
import {
  getQuantumProgressLabel,
  getQuantumProgressPercent,
  getSubtaskCompletionStatus,
  getTaskCompletionStatus,
  getTaskTagDisplayLabel,
  normalizeTaskTagKey,
} from './utils/taskUtils';
import { formatTaskTime, toMinutes } from './utils/timeUtils';
import { buildWavePath } from './utils/waveUtils';

// --- COMPONENTE DA FAIXA DO TOPO ---
const StickyMonthHeader = ({ date, customImages }) => {
  if (!date) return null;

  const monthIndex = date.getMonth();
  const imageSource = getMonthImageSource(monthIndex, customImages);

  return (
    <ImageBackground
      source={imageSource}
      style={styles.stickyHeader}
      imageStyle={{ resizeMode: 'cover' }}
    >
      {/* Overlay removido aqui */}
      <Text style={styles.stickyHeaderText}>
        {format(date, 'MMMM', { locale: ptBR })}
      </Text>
    </ImageBackground>
  );
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';
const NOTIFICATIONS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';
const FALLBACK_EMOJI = '📝';
const DEFAULT_REPEAT_CONFIG = { enabled: true, frequency: 'daily', interval: 1 };
const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#845ec2'];
const CONFETTI_COUNT = 32;
const CONFETTI_DURATION_MS = 2400;
const REMINDER_OFFSETS = {
  none: null,
  at_time: 0,
  '5m': -5,
  '15m': -15,
  '30m': -30,
  '1h': -60,
};

if (NOTIFICATIONS_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const normalizeRepeatConfig = (repeatConfig) => {
  if (!repeatConfig) {
    return DEFAULT_REPEAT_CONFIG;
  }
  const { option, frequency, interval, enabled, ...rest } = repeatConfig;
  const resolvedFrequency = frequency ?? option ?? DEFAULT_REPEAT_CONFIG.frequency;
  const parsedInterval = Number.parseInt(interval, 10);
  const resolvedInterval = Number.isFinite(parsedInterval) && parsedInterval > 0
    ? parsedInterval
    : DEFAULT_REPEAT_CONFIG.interval;
  const resolvedEnabled = enabled === undefined ? true : Boolean(enabled);

  return {
    ...rest,
    enabled: resolvedEnabled,
    frequency: resolvedFrequency,
    interval: resolvedInterval,
  };
};

const triggerImpact = (style) => {
  if (!HAPTICS_SUPPORTED) {
    return;
  }
  try {
    void Haptics.impactAsync(style);
  } catch (error) {
    // Ignore web environments without haptics support
  }
};

const triggerSelection = () => {
  if (!HAPTICS_SUPPORTED) {
    return;
  }
  try {
    void Haptics.selectionAsync();
  } catch (error) {
    // Ignore web environments without haptics support
  }
};

const triggerSuccessFeedback = async () => {
  if (HAPTICS_SUPPORTED) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log('Unable to trigger success haptics', error);
    }
  }

  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://www.soundjay.com/buttons/sounds/button-30.mp3' },
      { shouldPlay: true, volume: 0.25 }
    );

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
  } catch (error) {
    console.log('Unable to play success sound', error);
  }
};

const ConfettiOverlay = React.memo(({ visible, onComplete }) => {
  const { width, height } = useWindowDimensions();
  const hasStartedRef = useRef(false);
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
        id: `${Date.now()}-${index}`,
        baseX: new Animated.Value(Math.random() * width),
        size: 6 + Math.random() * 6,
        delay: Math.random() * 400,
        rotate: Math.random() * 120,
        heightRatio: Math.random() > 0.5 ? 1.5 : 0.8,
        rotationTurns: 360 * (Math.random() * 4 + 1),
        swayAmplitude: 12 + Math.random() * 18,
        swayDuration: 800 + Math.random() * 900,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        anim: new Animated.Value(-20 - Math.random() * 120),
        swayAnim: new Animated.Value(0),
        scaleAnim: new Animated.Value(Math.random() * 0.5 + 0.5),
        duration: CONFETTI_DURATION_MS + Math.random() * 1000,
      })),
    [width]
  );

  useEffect(() => {
    if (!visible) {
      hasStartedRef.current = false;
      return undefined;
    }
    if (hasStartedRef.current) {
      return undefined;
    }
    hasStartedRef.current = true;

    const animations = pieces.map((piece) =>
      Animated.timing(piece.anim, {
        toValue: height + 100,
        duration: piece.duration,
        delay: piece.delay,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      })
    );
    const swayLoops = pieces.map((piece) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(piece.swayAnim, {
            toValue: piece.swayAmplitude,
            duration: piece.swayDuration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(piece.swayAnim, {
            toValue: -piece.swayAmplitude,
            duration: piece.swayDuration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );

    const animation = Animated.stagger(40, animations);
    animation.start();
    swayLoops.forEach((loop) => loop.start());

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, CONFETTI_DURATION_MS + 1500);

    return () => {
      animation.stop();
      swayLoops.forEach((loop) => loop.stop());
      clearTimeout(timeoutId);
    };
  }, [height, onComplete, pieces, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.confettiContainer}>
      {pieces.map((piece) => (
        <Animated.View
          key={piece.id}
          style={[
            styles.confettiPiece,
            {
              width: piece.size,
              height: piece.size * piece.heightRatio,
              backgroundColor: piece.color,
              opacity: 0.8,
              transform: [
                { translateX: Animated.add(piece.baseX, piece.swayAnim) },
                { translateY: piece.anim },
                {
                  rotate: piece.anim.interpolate({
                    inputRange: [0, height],
                    outputRange: ['0deg', `${piece.rotationTurns}deg`],
                  }),
                },
                { scale: piece.scaleAnim },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
});

const SCREEN_WIDTH = Dimensions.get('window').width;
const CALENDAR_DAY_SIZE = Math.floor(SCREEN_WIDTH / 7);

// --- CÉLULA DO DIA ATUALIZADA (COM DESTAQUE PARA HOJE) ---
const CalendarDayCell = ({ date, isCurrentMonth, status, onPress, isToday }) => {
  if (!isCurrentMonth) {
    return <View style={{ width: CALENDAR_DAY_SIZE, height: CALENDAR_DAY_SIZE }} />;
  }

  const isSuccess = status === 'success';

  return (
    <Pressable
      onPress={() => onPress(date)}
      style={({ pressed }) => [
        styles.calendarDayCellWrapper,
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
      ]}
    >
      {isSuccess ? (
        <View style={styles.calendarSuccessCircle}>
          <Ionicons name="checkmark" size={20} color="white" />
        </View>
      ) : isToday ? (
        <View style={styles.calendarTodayCircle}>
          <Text style={styles.calendarTodayText}>{format(date, 'd')}</Text>
        </View>
      ) : (
        <Text style={styles.calendarDayText}>{format(date, 'd')}</Text>
      )}
    </Pressable>
  );
};

// --- ITEM DO MÊS ATUALIZADO ---
const CalendarMonthItem = ({ item, getDayStatus, onDayPress, customImages }) => {
  const monthStart = startOfMonth(item.date);
  const monthEnd = endOfMonth(item.date);
  const imageSource = getMonthImageSource(item.date.getMonth(), customImages);

  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });

  // Função simples para checar se é hoje
  const checkIsToday = (date) => {
    const now = new Date();
    return (
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  };

  return (
    <View style={styles.calendarMonthContainer}>
      <ImageBackground
        source={imageSource}
        style={styles.calendarMonthHeader}
        imageStyle={{ resizeMode: 'cover' }}
      >
        {/* Overlay removido aqui */}
        <Text style={styles.calendarMonthTitle}>{format(item.date, 'MMMM yyyy', { locale: ptBR })}</Text>
      </ImageBackground>

      <View style={styles.calendarDaysGrid}>
        {days.map((day) => (
          <CalendarDayCell
            key={day.toISOString()}
            date={day}
            isCurrentMonth={day.getMonth() === item.date.getMonth()}
            status={getDayStatus ? getDayStatus(day) : 'pending'}
            onPress={onDayPress}
            isToday={checkIsToday(day)}
          />
        ))}
      </View>
    </View>
  );
};

// --- COMPONENTE CUSTOMIZE CALENDAR MODAL ---
function CustomizeCalendarModal({ visible, onClose, customImages, onUpdateImage }) {
  if (!visible) return null;

  const handlePickImage = async (index) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const selectedUri = asset.uri;

        if (Platform.OS === 'web') {
          onUpdateImage(index, selectedUri);
          return;
        }

        const extension = selectedUri.split('.').pop().split(/\#|\?/)[0] || 'jpg';
        const fileName = `custom_month_${index}_${Date.now()}.${extension}`;
        const newPath = FileSystem.documentDirectory + fileName;

        await FileSystem.copyAsync({
          from: selectedUri,
          to: newPath,
        });

        onUpdateImage(index, newPath);
      }
    } catch (error) {
      console.log('Erro ao selecionar imagem:', error);
      alert('Não foi possível carregar a imagem.');
    }
  };

  return (
    <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.customizeModalContainer}>
        <View style={styles.customizeHeader}>
          <Text style={styles.customizeTitle}>Customize Calendar</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#1a1a2e" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.customizeScrollContent} showsVerticalScrollIndicator={false}>
          {MONTH_NAMES.map((name, index) => {
            const source = getMonthImageSource(index, customImages);

            return (
              <View key={name} style={styles.customizeRow}>
                <ImageBackground
                  source={source}
                  style={styles.customizeCard}
                  imageStyle={{ borderRadius: 16 }}
                >
                  {/* Overlay removido aqui */}
                  <Text style={styles.customizeCardText}>{name}</Text>
                </ImageBackground>

                <TouchableOpacity
                  style={styles.customizeAddButton}
                  activeOpacity={0.7}
                  onPress={() => handlePickImage(index)}
                >
                   <Ionicons name="add" size={24} color="#3c2ba7" />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}


function DayReportModal({ visible, date, tasks, onClose, customImages }) {
  const { height } = useWindowDimensions();

  // 1. Configuração da Animação
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [displayRate, setDisplayRate] = useState(0);

  // 2. Lógica para pegar o GIF do mês correto
  // Se 'date' for nulo, não quebra o app
  const imageSource = date ? getMonthImageSource(date.getMonth(), customImages) : null;

  const totalTasks = tasks.length;
  const dateKey = date ? getDateKey(date) : null;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const targetSuccessRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
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

  // Configurações do Círculo
  const radius = 60; // Raio do círculo
  const strokeWidth = 14; // Espessura da barra
  const circleSize = radius * 2 + strokeWidth;
  const circumference = 2 * Math.PI * radius;
  // Calcula o offset do traço baseado na porcentagem (inverso porque strokeDashoffset esconde o traço)
  const strokeDashoffset = circumference - (displayRate / 100) * circumference;

  if (!visible || !date) return null;

  const getSummaryText = () => {
    if (totalTasks === 0) return 'No habits scheduled for this day.';
    if (targetSuccessRate === 100) return 'Incredible! You crushed all your habits!';
    if (targetSuccessRate === 0)
      return `You had ${totalTasks} habit(s) and completed none. Let's see what they were 👀`;
    return `You completed ${completedTasks} out of ${totalTasks} habit(s). Keep going!`;
  };

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.reportOverlay}>
        <Pressable style={styles.reportBackdrop} onPress={onClose} />

        <View style={[styles.reportSheet, { maxHeight: height * 0.9 }]}>
          <ImageBackground
            source={imageSource}
            style={styles.reportHeaderImage}
            imageStyle={{ resizeMode: 'cover' }}
          >
            {/* Overlay removido aqui */}

            <View style={styles.reportDateContainer}>
              <Text style={styles.reportDateBig}>{format(date, 'd MMM')}</Text>
              <Text style={styles.reportYear}>{format(date, 'yyyy')}</Text>
            </View>

            <Pressable onPress={onClose} style={styles.reportCloseButton}>
              <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </ImageBackground>

          <ScrollView contentContainerStyle={styles.reportScrollContent}>
            <Text style={styles.reportSummaryText}>{getSummaryText()}</Text>

            <Text style={styles.reportSectionTitle}>Daily stats</Text>

            <View style={styles.statsCard}>
              <View style={styles.gaugeContainer}>
                <View
                  style={{
                    width: circleSize,
                    height: circleSize,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Svg width={circleSize} height={circleSize} viewBox={`0 0 ${circleSize} ${circleSize}`}>
                    <Circle
                      cx={circleSize / 2}
                      cy={circleSize / 2}
                      r={radius}
                      stroke="#f0efff"
                      strokeWidth={strokeWidth}
                      fill="transparent"
                    />
                    <Circle
                      cx={circleSize / 2}
                      cy={circleSize / 2}
                      r={radius}
                      stroke="#3c2ba7"
                      strokeWidth={strokeWidth}
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      rotation="-90"
                      origin={`${circleSize / 2}, ${circleSize / 2}`}
                    />
                  </Svg>

                  <View
                    style={{
                      position: 'absolute',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={styles.gaugePercentage}>{displayRate}</Text>
                    <Text style={styles.gaugeLabel}>Success rate</Text>
                  </View>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Committed</Text>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statNumber}>{totalTasks}</Text>
                    <Text style={{ fontSize: 20 }}>✍️</Text>
                  </View>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Completed</Text>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statNumber}>{completedTasks}</Text>
                    <Ionicons name="checkbox" size={24} color="#3dd598" />
                  </View>
                </View>
              </View>
            </View>

            {totalTasks > 0 && (
              <>
                <Text style={styles.reportSectionTitle}>Habits</Text>
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
                          ) : task.totalSubtasks > 0 ? (
                            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                              {task.completedSubtasks}/{task.totalSubtasks} subtasks
                            </Text>
                          ) : null}
                        </View>

                        {task.completed ? (
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
                        )}
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
function ScheduleApp() {
  const [userSettings, setUserSettings] = useState(DEFAULT_USER_SETTINGS);
  const [activeTab, setActiveTab] = useState(DEFAULT_USER_SETTINGS.activeTab);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabMenuMounted, setIsFabMenuMounted] = useState(false);
  const [isHabitSheetOpen, setIsHabitSheetOpen] = useState(false);
  const [habitSheetMode, setHabitSheetMode] = useState('create');
  const [habitSheetInitialTask, setHabitSheetInitialTask] = useState(null);
  const [isCustomizeCalendarOpen, setCustomizeCalendarOpen] = useState(false);
  const [isProfileTasksOpen, setProfileTasksOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [tasks, setTasks] = useState([]);
  const [reportDate, setReportDate] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeProfileTaskId, setActiveProfileTaskId] = useState(null);
  const [quantumAdjustTaskId, setQuantumAdjustTaskId] = useState(null);
  const [quantumAdjustMinutes, setQuantumAdjustMinutes] = useState('0');
  const [quantumAdjustSeconds, setQuantumAdjustSeconds] = useState('0');
  const [quantumAdjustCount, setQuantumAdjustCount] = useState('1');
  const [selectedTagFilter, setSelectedTagFilter] = useState(
    DEFAULT_USER_SETTINGS.selectedTagFilter
  );
  const [history, setHistory] = useState([]);
  const [customMonthImages, setCustomMonthImages] = useState({});
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimeoutRef = useRef(null);
  const [calendarMonths, setCalendarMonths] = useState(() => {
    const today = new Date();
    const months = [];

    for (let i = -60; i <= 24; i++) {
      const date = getMonthStart(addMonthsDateFns(today, i));
      months.push({ id: i, date: date });
    }

    return months;
  });
  const [visibleCalendarDate, setVisibleCalendarDate] = useState(new Date());
  const initialCalendarIndex = useMemo(() => {
    const todayId = getMonthId(new Date());
    return calendarMonths.findIndex((month) => getMonthId(month.date) === todayId);
  }, [calendarMonths]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;
  const fabSize = isCompact ? 48 : 56;
  const centerGap = isCompact ? fabSize * 0.8 : fabSize * 0.95;
  const horizontalPadding = useMemo(() => Math.max(16, Math.min(32, width * 0.06)), [width]);
  const bottomBarPadding = useMemo(() => Math.max(16, horizontalPadding * 0.75), [horizontalPadding]);
  const iconSize = isCompact ? 18 : 20;
  const cardSize = isCompact ? 136 : 152;
  const cardIconSize = Math.round(cardSize * 0.75);
  const cardSpacing = isCompact ? 16 : 24;
  const cardBorderRadius = isCompact ? 30 : 34;
  const cardVerticalOffset = isCompact ? 200 : 230;
  const fabHaloSize = fabSize + (isCompact ? 26 : 30);
  const fabBaseSize = fabSize + (isCompact ? 14 : 18);
  const fabIconSize = isCompact ? 28 : 30;
  const HEADER_HEIGHT = 100;
  const MARGINS = 30;
  const BASE_HEIGHT = HEADER_HEIGHT + MARGINS;
  const buildMonthLayouts = useCallback((months) => {
    let currentOffset = 0;
    const layouts = months.map((month, index) => {
      const weeks = getWeeksInMonth(month.date);
      const length = BASE_HEIGHT + weeks * CALENDAR_DAY_SIZE;
      const layout = { length, offset: currentOffset, index };
      currentOffset += length;
      return layout;
    });

    return layouts;
  }, [BASE_HEIGHT]);
  const monthLayouts = useMemo(() => {
    return buildMonthLayouts(calendarMonths);
  }, [buildMonthLayouts, calendarMonths]);
  const monthLayoutsRef = useRef(monthLayouts);
  useEffect(() => {
    monthLayoutsRef.current = monthLayouts;
  }, [monthLayouts]);

  const getItemLayout = useCallback(
    (data, index) => {
      const cachedLayout = monthLayoutsRef.current[index];
      if (cachedLayout) {
        return cachedLayout;
      }
      if (!data?.[index]) {
        return { length: 0, offset: 0, index };
      }
      const previousLayout = monthLayoutsRef.current[index - 1];
      const offset = previousLayout ? previousLayout.offset + previousLayout.length : 0;
      const weeks = getWeeksInMonth(data[index].date);
      const length = BASE_HEIGHT + weeks * CALENDAR_DAY_SIZE;
      const layout = { length, offset, index };
      monthLayoutsRef.current[index] = layout;
      return layout;
    },
    [BASE_HEIGHT]
  );
  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const selectedDateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
  const isSelectedToday = selectedDateKey === todayKey;
  const selectedDateLabel = useMemo(() => {
    if (isSelectedToday) {
      return 'Today';
    }
    const weekday = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday}, ${selectedDate.getDate()}`;
  }, [isSelectedToday, selectedDate]);
  useEffect(() => {
    const monthStart = getMonthStart(selectedDate);
    setCalendarMonths((previous) => {
      const exists = previous.some(({ date }) => getMonthId(date) === getMonthId(monthStart));
      if (exists) {
        return previous;
      }
      const nextId = previous.reduce((max, month) => Math.max(max, month.id), -1) + 1;
      const updated = [...previous, { id: nextId, date: monthStart }];
      return updated.sort((a, b) => a.date.getTime() - b.date.getTime());
    });
  }, [selectedDate]);
  const weekDays = useMemo(() => {
    const base = new Date(today);
    return Array.from({ length: 7 }, (_, index) => {
      const offset = index - 3;
      const date = new Date(base);
      date.setDate(base.getDate() + offset);
      const key = getDateKey(date);
      const dayTasks = tasks.filter((task) => shouldTaskAppearOnDate(task, date));
      const allCompleted =
        dayTasks.length > 0 && dayTasks.every((task) => getTaskCompletionStatus(task, key));
      return {
        date,
        key,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        dayNumber: date.getDate(),
        allCompleted,
      };
    });
  }, [tasks, today]);
  const getDayStatusForCalendar = useCallback(
    (day) => {
      const dateKey = getDateKey(day);
      const dayTasks = tasks.filter((task) => shouldTaskAppearOnDate(task, day));
      const allCompleted =
        dayTasks.length > 0 && dayTasks.every((task) => getTaskCompletionStatus(task, dateKey));
      return allCompleted ? 'success' : 'pending';
    },
    [tasks]
  );

  const reportTasks = useMemo(() => {
    if (!reportDate) return [];
    const dateKey = getDateKey(reportDate);

    return tasks
      .filter((task) => shouldTaskAppearOnDate(task, reportDate))
      .map((task) => {
        const isCompleted = getTaskCompletionStatus(task, dateKey);

        const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
        const totalSubtasks = subtasks.length;
        const completedSubtasks = subtasks.filter((s) => getSubtaskCompletionStatus(s, dateKey)).length;

        return {
          ...task,
          completed: isCompleted,
          totalSubtasks,
          completedSubtasks,
        };
      });
  }, [reportDate, tasks]);

  const handleOpenReport = useCallback((date) => {
    setReportDate(date);
  }, []);
  const handleOpenProfileTasks = useCallback(() => {
    setProfileTasksOpen(true);
  }, []);
  const handleCloseProfileTasks = useCallback(() => {
    setProfileTasksOpen(false);
    setActiveProfileTaskId(null);
  }, []);
  const handleDeleteProfileTasks = useCallback(
    (taskIds) => {
      const tasksToDelete = tasks.filter((task) => taskIds.includes(task.id));
      tasksToDelete.forEach((task) => {
        void cancelTaskReminder(task.notificationId);
      });
      setTasks((previous) =>
        previous.filter((task) => task.profileLocked || !taskIds.includes(task.id))
      );
      setActiveProfileTaskId((current) => (taskIds.includes(current) ? null : current));
    },
    [cancelTaskReminder, tasks]
  );
  const handleDeleteProfileTask = useCallback(
    (taskId) => {
      handleDeleteProfileTasks([taskId]);
    },
    [handleDeleteProfileTasks]
  );
  const handleToggleProfileTaskLock = useCallback((taskId) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId
          ? { ...task, profileLocked: !task.profileLocked }
          : task
      )
    );
  }, []);

  const loadMoreCalendarMonths = useCallback(() => {
    setCalendarMonths((previous) => {
      if (previous.length === 0) {
        return previous;
      }
      const lastMonth = previous[previous.length - 1].date;
      const nextId = previous.reduce((max, month) => Math.max(max, month.id), -1) + 1;
      const nextMonthDate = getMonthStart(addMonthsDateFns(lastMonth, 1));
      const exists = previous.some(({ date }) => getMonthId(date) === getMonthId(nextMonthDate));
      if (exists) {
        return previous;
      }
      return [...previous, { id: nextId, date: nextMonthDate }];
    });
  }, []);

  const renderCalendarMonth = useCallback(
    ({ item }) => (
      <CalendarMonthItem
        item={item}
        getDayStatus={getDayStatusForCalendar}
        onDayPress={handleOpenReport}
        customImages={customMonthImages}
      />
    ),
    [customMonthImages, getDayStatusForCalendar, handleOpenReport]
  );
  const tasksForSelectedDate = useMemo(() => {
    const filtered = tasks.filter((task) => shouldTaskAppearOnDate(task, selectedDate));
    const getSortValue = (task) => {
      if (!task.time || !task.time.specified) {
        return Number.MAX_SAFE_INTEGER;
      }
      if (task.time.mode === 'period' && task.time.period) {
        return toMinutes(task.time.period.start);
      }
      if (task.time.point) {
        return toMinutes(task.time.point);
      }
      return Number.MAX_SAFE_INTEGER;
    };
    return filtered.slice().sort((a, b) => getSortValue(a) - getSortValue(b));
  }, [selectedDate, tasks]);
  const availableTagOptions = useMemo(() => {
    const seen = new Set();
    return tasks.reduce((options, task) => {
      const key = normalizeTaskTagKey(task);
      if (!key || seen.has(key)) {
        return options;
      }
      seen.add(key);
      options.push({
        key,
        label: getTaskTagDisplayLabel(task) ?? 'Tag',
      });
      return options;
    }, []);
  }, [tasks]);
  const tagOptions = useMemo(() => {
    const seen = new Set();
    return tasksForSelectedDate.reduce((options, task) => {
      const key = normalizeTaskTagKey(task);
      if (!key || seen.has(key)) {
        return options;
      }
      seen.add(key);
      options.push({
        key,
        label: getTaskTagDisplayLabel(task) ?? 'Tag',
      });
      return options;
    }, []);
  }, [tasksForSelectedDate]);
  useEffect(() => {
    if (
      selectedTagFilter !== 'all' &&
      availableTagOptions.length > 0 &&
      !availableTagOptions.some((option) => option.key === selectedTagFilter)
    ) {
      setSelectedTagFilter('all');
      updateUserSettings({ selectedTagFilter: 'all' });
    }
  }, [availableTagOptions, selectedTagFilter, updateUserSettings]);
  const visibleTasks = useMemo(() => {
    if (selectedTagFilter === 'all') {
      return tasksForSelectedDate;
    }
    return tasksForSelectedDate.filter((task) => normalizeTaskTagKey(task) === selectedTagFilter);
  }, [selectedTagFilter, tasksForSelectedDate]);
  const visibleTasksForSelectedDay = useMemo(
    () =>
      visibleTasks.map((task) => ({
        ...task,
        completed: getTaskCompletionStatus(task, selectedDateKey),
      })),
    [selectedDateKey, visibleTasks]
  );
  const visibleTasksWithStats = useMemo(
    () =>
      visibleTasksForSelectedDay.map((task) => {
        const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
        const completedSubtasks = Array.isArray(task.subtasks)
          ? task.subtasks.filter((item) => getSubtaskCompletionStatus(item, selectedDateKey)).length
          : 0;

        return {
          ...task,
          totalSubtasks,
          completedSubtasks,
          backgroundColor: lightenColor(task.color, 0.75),
          borderColor: task.color,
        };
      }),
    [selectedDateKey, visibleTasksForSelectedDay]
  );
  const profileTasks = useMemo(() => {
    const getSortDate = (task) => {
      const normalized = normalizeDateValue(task.date ?? task.dateKey);
      return normalized ? normalized.getTime() : Number.MAX_SAFE_INTEGER;
    };
    const getSortTime = (task) => {
      if (!task.time || !task.time.specified) {
        return Number.MAX_SAFE_INTEGER;
      }
      if (task.time.mode === 'period' && task.time.period) {
        return toMinutes(task.time.period.start);
      }
      if (task.time.point) {
        return toMinutes(task.time.point);
      }
      return Number.MAX_SAFE_INTEGER;
    };
    return tasks
      .slice()
      .sort((a, b) => getSortDate(a) - getSortDate(b) || getSortTime(a) - getSortTime(b));
  }, [tasks]);
  const allTasksCompletedForSelectedDay =
    tasksForSelectedDate.length > 0 &&
    tasksForSelectedDate.every((task) => getTaskCompletionStatus(task, selectedDateKey));
  const completedTaskCount = useMemo(
    () => tasksForSelectedDate.filter((task) => getTaskCompletionStatus(task, selectedDateKey)).length,
    [selectedDateKey, tasksForSelectedDate]
  );
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const previousCompletionRef = useRef(false);
  const handleConfettiComplete = useCallback(() => {
    setShowConfetti(false);
  }, []);

  useEffect(() => {
    if (allTasksCompletedForSelectedDay && !previousCompletionRef.current) {
      setConfettiKey((previous) => previous + 1);
      setShowConfetti(true);
      void triggerSuccessFeedback();
    }
    previousCompletionRef.current = allTasksCompletedForSelectedDay;
  }, [allTasksCompletedForSelectedDay]);

  useEffect(() => {
    previousCompletionRef.current = false;
  }, [selectedDateKey]);
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks]
  );
  const activeProfileTask = useMemo(
    () => tasks.find((task) => task.id === activeProfileTaskId) ?? null,
    [activeProfileTaskId, tasks]
  );
  const profileStats = useMemo(() => {
    const committedHabits = tasks.length;
    const dateCandidates = [];

    history.forEach((entry) => {
      if (entry?.timestamp) {
        const normalized = normalizeDateValue(entry.timestamp);
        if (normalized) {
          dateCandidates.push(normalized);
        }
      }
    });

    tasks.forEach((task) => {
      const normalized = normalizeDateValue(task.date ?? task.dateKey);
      if (normalized) {
        dateCandidates.push(normalized);
      }
    });

    const minDate = dateCandidates.length
      ? new Date(Math.min(...dateCandidates.map((date) => date.getTime())))
      : today;
    const startDate = minDate > today ? today : minDate;
    const totalDays = Math.max(0, differenceInCalendarDays(today, startDate) + 1);

    if (!tasks.length) {
      return {
        totalDays,
        committedHabits,
        currentStreak: 0,
        bestStreak: 0,
      };
    }

    const dateRange = eachDayOfInterval({ start: startDate, end: today });
    let currentStreak = 0;
    let bestStreak = 0;

    dateRange.forEach((date) => {
      const scheduledTasks = tasks.filter((task) => shouldTaskAppearOnDate(task, date));
      if (scheduledTasks.length === 0) {
        return;
      }
      const isComplete = scheduledTasks.every((task) => getTaskCompletionStatus(task, date));
      if (isComplete) {
        currentStreak += 1;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });

    return {
      totalDays,
      committedHabits,
      currentStreak,
      bestStreak,
    };
  }, [history, tasks, today]);
  const totalDaysUnit = profileStats.totalDays === 1 ? 'day' : 'days';
  const habitsUnit = profileStats.committedHabits === 1 ? 'habit' : 'habits';
  const currentStreakUnit = profileStats.currentStreak === 1 ? 'day' : 'days';
  const bestStreakUnit = profileStats.bestStreak === 1 ? 'day' : 'days';
  const activeTaskForSelectedDate = useMemo(
    () =>
      activeTask
        ? {
            ...activeTask,
            completed: getTaskCompletionStatus(activeTask, selectedDateKey),
            subtasks: Array.isArray(activeTask.subtasks)
              ? activeTask.subtasks.map((subtask) => ({
                  ...subtask,
                  completed: getSubtaskCompletionStatus(subtask, selectedDateKey),
                }))
              : activeTask.subtasks,
          }
        : null,
    [activeTask, selectedDateKey]
  );

  const openQuantumAdjust = useCallback((task) => {
    if (!task || task.type !== 'quantum') {
      return;
    }
    setQuantumAdjustTaskId(task.id);
    if (task.quantum?.mode === 'timer') {
      const limitSeconds =
        (task.quantum?.timer?.minutes ?? 0) * 60 + (task.quantum?.timer?.seconds ?? 0);
      const lastAdjustSeconds = task.quantum?.lastAdjustTimerSeconds ?? 0;
      const clampedSeconds = limitSeconds
        ? Math.min(Math.max(lastAdjustSeconds, 0), limitSeconds)
        : Math.max(lastAdjustSeconds, 0);
      const lastHours = Math.floor(clampedSeconds / 60);
      const lastMinutes = clampedSeconds % 60;
      setQuantumAdjustMinutes(String(lastHours));
      setQuantumAdjustSeconds(String(lastMinutes));
    } else {
      const lastAdjust = task.quantum?.lastAdjustCount;
      setQuantumAdjustCount(String(lastAdjust ?? 1));
    }
  }, []);

  const closeQuantumAdjust = useCallback(() => {
    setQuantumAdjustTaskId(null);
  }, []);

  const handleQuantumAdjustment = useCallback(
    (direction) => {
      if (!quantumAdjustTaskId) {
        return;
      }
      const targetTask = tasks.find((task) => task.id === quantumAdjustTaskId);
      if (!targetTask) {
        return;
      }
      const mode = targetTask.quantum?.mode;
      const dateKey = selectedDateKey;
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== quantumAdjustTaskId) {
            return task;
          }
          if (mode === 'timer') {
            const minutes = Number.parseInt(quantumAdjustMinutes, 10) || 0;
            const seconds = Number.parseInt(quantumAdjustSeconds, 10) || 0;
            const deltaSeconds = minutes * 60 + seconds;
            if (!deltaSeconds) {
              return task;
            }
            const limitSeconds =
              (task.quantum?.timer?.minutes ?? 0) * 60 + (task.quantum?.timer?.seconds ?? 0);
            if (!limitSeconds) {
              return task;
            }
            const baseDateKey =
              dateKey ?? task.dateKey ?? (task.date ? getDateKey(task.date) : null);
            if (!baseDateKey) {
              return task;
            }
            const progressByDate = {
              ...(task.quantum?.progressByDate ?? {}),
            };
            const currentEntry = progressByDate[baseDateKey] ?? {};
            const currentSeconds = currentEntry?.doneSeconds ?? 0;
            const nextSeconds = clampValue(
              currentSeconds + direction * deltaSeconds,
              0,
              limitSeconds
            );
            const completedDates = { ...(task.completedDates ?? {}) };
            if (baseDateKey) {
              if (nextSeconds === limitSeconds) {
                completedDates[baseDateKey] = true;
              } else {
                delete completedDates[baseDateKey];
              }
            }
            return {
              ...task,
              completedDates,
              quantum: {
                ...task.quantum,
                progressByDate: {
                  ...progressByDate,
                  [baseDateKey]: {
                    ...currentEntry,
                    doneSeconds: nextSeconds,
                  },
                },
                doneSeconds: nextSeconds,
                lastAdjustTimerSeconds: deltaSeconds,
                wavePulse: Date.now(),
              },
            };
          }
          const deltaCount = Number.parseInt(quantumAdjustCount, 10) || 0;
          if (!deltaCount) {
            return task;
          }
          const limitCount = task.quantum?.count?.value ?? 0;
          if (!limitCount) {
            return task;
          }
          const baseDateKey =
            dateKey ?? task.dateKey ?? (task.date ? getDateKey(task.date) : null);
          if (!baseDateKey) {
            return task;
          }
          const progressByDate = {
            ...(task.quantum?.progressByDate ?? {}),
          };
          const currentEntry = progressByDate[baseDateKey] ?? {};
          const currentCount = currentEntry?.doneCount ?? 0;
          const nextCount = clampValue(
            currentCount + direction * deltaCount,
            0,
            limitCount
          );
          const completedDates = { ...(task.completedDates ?? {}) };
          if (baseDateKey) {
            if (nextCount === limitCount) {
              completedDates[baseDateKey] = true;
            } else {
              delete completedDates[baseDateKey];
            }
          }
          return {
            ...task,
            completedDates,
            quantum: {
              ...task.quantum,
              progressByDate: {
                ...progressByDate,
                [baseDateKey]: {
                  ...currentEntry,
                  doneCount: nextCount,
                },
              },
              doneCount: nextCount,
              lastAdjustCount: deltaCount,
              wavePulse: Date.now(),
            },
          };
        })
      );
    },
    [
      quantumAdjustCount,
      quantumAdjustMinutes,
      quantumAdjustSeconds,
      quantumAdjustTaskId,
      selectedDateKey,
      tasks,
    ]
  );
  const lastToggleRef = useRef(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const actionsScale = useRef(new Animated.Value(0.85)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(12)).current;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    waitForInteraction: false,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const topItem = viewableItems[0];
      if (topItem && topItem.item && topItem.item.date) {
        setVisibleCalendarDate(topItem.item.date);
      }
    }
  }).current;
  const emptyStateIconSize = isCompact ? 98 : 112;
  const normalizeStoredTasks = useCallback((storedTasks) => {
    const normalizeCompletedDates = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
      }
      return value;
    };

    return storedTasks.filter(Boolean).map((task) => {
      const baseDateKey = task.dateKey ?? (task.date ? getDateKey(task.date) : null);
      const completedDates = { ...normalizeCompletedDates(task.completedDates) };

      if (task.completed && baseDateKey && !completedDates[baseDateKey]) {
        completedDates[baseDateKey] = true;
      }

      const normalizedQuantum = task.quantum
        ? (() => {
            const progressByDate =
              task.quantum.progressByDate &&
              typeof task.quantum.progressByDate === 'object' &&
              !Array.isArray(task.quantum.progressByDate)
                ? { ...task.quantum.progressByDate }
                : {};
            if (baseDateKey) {
              const legacyDoneSeconds = task.quantum.doneSeconds;
              const legacyDoneCount = task.quantum.doneCount;
              if (
                typeof legacyDoneSeconds === 'number' ||
                typeof legacyDoneCount === 'number'
              ) {
                progressByDate[baseDateKey] = {
                  ...progressByDate[baseDateKey],
                  doneSeconds: typeof legacyDoneSeconds === 'number' ? legacyDoneSeconds : 0,
                  doneCount: typeof legacyDoneCount === 'number' ? legacyDoneCount : 0,
                };
              }
            }
            return {
              ...task.quantum,
              progressByDate,
            };
          })()
        : task.quantum;

      const normalizedSubtasks = Array.isArray(task.subtasks)
        ? task.subtasks.map((subtask) => {
            const subtaskCompletedDates = {
              ...normalizeCompletedDates(subtask.completedDates),
            };
            if (subtask.completed && baseDateKey && !subtaskCompletedDates[baseDateKey]) {
              subtaskCompletedDates[baseDateKey] = true;
            }
            const { completed, ...restSubtask } = subtask;
            return {
              ...restSubtask,
              completedDates: subtaskCompletedDates,
            };
          })
        : task.subtasks;

      const { completed, ...restTask } = task;

      return {
        ...restTask,
        dateKey: baseDateKey,
        completedDates,
        subtasks: normalizedSubtasks,
        repeat: normalizeRepeatConfig(task.repeat),
        quantum: normalizedQuantum,
      };
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const hydrateFromStorage = async () => {
      try {
        const [storedTasks, storedSettings, storedHistory, storedImages] = await Promise.all([
          loadTasks(),
          loadUserSettings(),
          loadHistory(),
          loadMonthImages(),
        ]);

        if (!isMounted) {
          return;
        }

        if (Array.isArray(storedTasks)) {
          setTasks(normalizeStoredTasks(storedTasks));
        }

        if (storedSettings) {
          const mergedSettings = { ...DEFAULT_USER_SETTINGS, ...storedSettings };
          setUserSettings(mergedSettings);
          setActiveTab(mergedSettings.activeTab ?? DEFAULT_USER_SETTINGS.activeTab);
          setSelectedTagFilter(
            mergedSettings.selectedTagFilter ?? DEFAULT_USER_SETTINGS.selectedTagFilter
          );
        }

        if (Array.isArray(storedHistory)) {
          setHistory(storedHistory);
        }

        if (storedImages) {
          setCustomMonthImages(storedImages);
        }
      } catch (error) {
        console.warn('Failed to load stored data', error);
      } finally {
        if (isMounted) {
          setIsHydrated(true);
        }
      }
    };

    void hydrateFromStorage();

    return () => {
      isMounted = false;
    };
  }, [normalizeStoredTasks]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    tasks.forEach((task) => {
      if (!task.notificationId && REMINDER_OFFSETS[task.reminder] != null) {
        void refreshTaskReminder(task, null);
      }
    });
  }, [isHydrated, refreshTaskReminder, tasks]);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const timeoutId = setTimeout(() => {
      const normalizedTasks = tasks.map((task) => ({
        ...task,
        repeat: normalizeRepeatConfig(task.repeat),
      }));
      void saveTasks(normalizedTasks);
      void saveUserSettings(userSettings);
      void saveHistory(history);
    }, 500);

    saveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
    };
  }, [history, isHydrated, tasks, userSettings]);

  const handleUpdateMonthImage = useCallback(
    async (monthIndex, uri) => {
      const updatedImages = {
        ...customMonthImages,
        [monthIndex]: uri,
      };

      setCustomMonthImages(updatedImages);
      await saveMonthImages(updatedImages);
    },
    [customMonthImages]
  );

  const appendHistoryEntry = useCallback((type, details = {}) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp: new Date().toISOString(),
      details,
    };
    setHistory((previous) => [entry, ...previous].slice(0, 200));
  }, []);

  const updateUserSettings = useCallback((updates) => {
    setUserSettings((previous) => ({
      ...previous,
      ...updates,
    }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    void applyNavigationBarThemeForTab(activeTab);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void applyNavigationBarThemeForTab(activeTab);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [activeTab, applyNavigationBarThemeForTab]);

  const dynamicStyles = useMemo(
    () => ({
      content: {
        paddingHorizontal: horizontalPadding,
        paddingTop: isCompact ? 32 : 48,
      },
      calendarListContent: {
        paddingHorizontal: horizontalPadding,
        paddingTop: isCompact ? 24 : 32,
        paddingBottom: isCompact ? 56 : 72,
      },
      description: {
        fontSize: isCompact ? 15 : 16,
        lineHeight: isCompact ? 20 : 22,
      },
      emptyStateIllustration: {
        width: isCompact ? 220 : 260,
        height: isCompact ? 220 : 260,
        borderRadius: isCompact ? 110 : 130,
      },
      bottomBarContainer: {
        paddingHorizontal: 0,
        paddingBottom: insets.bottom,
        backgroundColor: '#000000',
      },
      bottomBar: {
        paddingHorizontal: bottomBarPadding,
        paddingVertical: isCompact ? 8 : 10,
      },
      tabLabel: {
        fontSize: isCompact ? 10 : 11,
        marginTop: isCompact ? 2 : 4,
      },
      tabGroupLeft: {
        paddingRight: centerGap / 2,
        marginRight: centerGap / 4,
      },
      tabGroupRight: {
        paddingLeft: centerGap / 2,
        marginLeft: centerGap / 4,
      },
      addButton: {
        width: fabSize,
        height: fabSize,
        borderRadius: fabSize / 2,
        top: isCompact ? -20 : -24,
      },
    }),
    [
      bottomBarPadding,
      centerGap,
      fabSize,
      horizontalPadding,
      insets.bottom,
      isCompact,
    ]
  );

  const openFabMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 200) {
      return;
    }
    lastToggleRef.current = now;
    if (isFabOpen) {
      return;
    }
    setIsFabMenuMounted(true);
    setIsFabOpen(true);
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
  }, [isFabOpen]);

  const closeFabMenu = useCallback(() => {
    if (!isFabOpen && !isFabMenuMounted) {
      return;
    }
    const now = Date.now();
    if (now - lastToggleRef.current < 200) {
      return;
    }
    lastToggleRef.current = now;
    setIsFabOpen(false);
  }, [isFabMenuMounted, isFabOpen]);

  const handleToggleFab = useCallback(() => {
    if (isFabOpen) {
      closeFabMenu();
    } else {
      openFabMenu();
    }
  }, [closeFabMenu, isFabOpen, openFabMenu]);

  const handleAddHabit = useCallback(() => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    closeFabMenu();
    setHabitSheetMode('create');
    setHabitSheetInitialTask(null);
    setIsHabitSheetOpen(true);
  }, [closeFabMenu]);

  const handleAddReflection = useCallback(() => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    console.log('Add reflection action triggered');
    closeFabMenu();
  }, [closeFabMenu]);

  const handleCloseCreateHabit = useCallback(() => {
    setIsHabitSheetOpen(false);
    setHabitSheetMode('create');
    setHabitSheetInitialTask(null);
  }, []);

  const handleSelectDate = useCallback((date) => {
    triggerSelection();
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    setSelectedDate(normalized);
  }, []);
  const handleSelectCalendarDate = useCallback(
    (date) => {
      handleSelectDate(date);
    },
    [handleSelectDate]
  );

  const applyNavigationBarThemeForTab = useCallback(async (tabKey) => {
    if (Platform.OS !== 'android') {
      return;
    }

    const theme = getNavigationBarThemeForTab(tabKey);
    // Only adjust navigation bar button style. Android edge-to-edge prevents background/position
    // tweaks, and some devices warn when unsupported methods are called.
    if (!theme || !theme.buttonStyle) {
      return;
    }
    // Lazy-require to avoid importing when not available on platform
    const NavigationBar = require('expo-navigation-bar');
    if (NavigationBar?.setButtonStyleAsync) {
      try {
        await NavigationBar.setButtonStyleAsync(theme.buttonStyle);
      } catch (error) {
        // Ignore when navigation bar button style can't be updated
      }
    }
  }, []);

  const handleChangeTab = useCallback(
    (tabKey) => {
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      setActiveTab(tabKey);
      updateUserSettings({ activeTab: tabKey });
      void applyNavigationBarThemeForTab(tabKey);
    },
    [applyNavigationBarThemeForTab, updateUserSettings]
  );

  const handleSelectTagFilter = useCallback(
    (filterKey) => {
      setSelectedTagFilter(filterKey);
      updateUserSettings({ selectedTagFilter: filterKey });
    },
    [updateUserSettings]
  );

  const handleToggleTaskCompletion = useCallback(
    (taskId, dateKey = selectedDateKey) => {
      const initialDateKey = dateKey ?? selectedDateKey;
      const targetTask = tasks.find((task) => task.id === taskId);
      const resolvedDateKey =
        initialDateKey ??
        targetTask?.dateKey ??
        (targetTask?.date ? getDateKey(targetTask.date) : null);
      const wasCompleted = targetTask
        ? getTaskCompletionStatus(targetTask, resolvedDateKey)
        : false;

      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          const completedDates = { ...(task.completedDates ?? {}) };
          const isCompletedForDate = getTaskCompletionStatus(task, resolvedDateKey);

          if (isCompletedForDate) {
            delete completedDates[resolvedDateKey];
          } else if (resolvedDateKey) {
            completedDates[resolvedDateKey] = true;
          }

          return {
            ...task,
            completedDates,
          };
        })
      );

      appendHistoryEntry('task_completion_toggled', {
        taskId,
        dateKey: resolvedDateKey,
        completed: !wasCompleted,
      });
    },
    [appendHistoryEntry, selectedDateKey, tasks]
  );

  const convertSubtasks = useCallback((subtasks, existing = []) => {
    const remainingExisting = [...existing];
    const now = Date.now();
    return subtasks
      .map((item) => item.trim())
      .filter(Boolean)
      .map((title, index) => {
        const existingIndex = remainingExisting.findIndex((subtask) => subtask.title === title);
        if (existingIndex >= 0) {
          const [found] = remainingExisting.splice(existingIndex, 1);
          return { ...found, title, completedDates: found.completedDates ?? {} };
        }
        return {
          id: `${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          completedDates: {},
        };
      });
  }, []);

  const getUniqueTitle = useCallback(
    (requestedTitle, excludeTaskId) => {
      const baseTitle = (requestedTitle || 'Untitled task').trim() || 'Untitled task';
      const normalizedBase = baseTitle.toLowerCase();

      const existingTitles = new Set(
        tasks
          .filter((task) => task.id !== excludeTaskId)
          .map((task) => (task.title || '').trim().toLowerCase())
      );

      if (!existingTitles.has(normalizedBase)) {
        return baseTitle;
      }

      let suffix = 1;
      let candidate = `${baseTitle} ${suffix}`;
      while (existingTitles.has(candidate.toLowerCase())) {
        suffix += 1;
        candidate = `${baseTitle} ${suffix}`;
      }
      return candidate;
    },
    [tasks]
  );

  const getReminderBaseTime = useCallback((time) => {
    if (!time?.specified) {
      return null;
    }
    if (time.mode === 'period') {
      return time.period?.start ?? null;
    }
    return time.point ?? null;
  }, []);

  const buildReminderDateTime = useCallback((date, timeValue, offsetMinutes) => {
    if (!date || !timeValue || typeof offsetMinutes !== 'number') {
      return null;
    }
    const reminderDate = new Date(date);
    reminderDate.setHours(0, 0, 0, 0);
    reminderDate.setMinutes(toMinutes(timeValue) + offsetMinutes);
    return reminderDate;
  }, []);

  const findNextReminderDate = useCallback(
    (task) => {
      const offsetMinutes = REMINDER_OFFSETS[task?.reminder] ?? null;
      if (offsetMinutes === null) {
        return null;
      }
      const baseTime = getReminderBaseTime(task?.time);
      if (!baseTime) {
        return null;
      }
      const startDate = normalizeDateValue(task?.date ?? task?.dateKey);
      if (!startDate) {
        return null;
      }
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const initialDate = startDate > today ? startDate : today;
      const limitDays = 366;

      for (let offset = 0; offset <= limitDays; offset += 1) {
        const candidateDate = new Date(initialDate);
        candidateDate.setDate(candidateDate.getDate() + offset);
        if (!shouldTaskAppearOnDate(task, candidateDate)) {
          continue;
        }
        const reminderDate = buildReminderDateTime(candidateDate, baseTime, offsetMinutes);
        if (!reminderDate) {
          continue;
        }
        if (reminderDate > now) {
          return reminderDate;
        }
        const msDifference = now.getTime() - reminderDate.getTime();
        if (offset === 0 && msDifference <= 60000) {
          return new Date(now.getTime() + 5000);
        }
      }
      return null;
    },
    [buildReminderDateTime, getReminderBaseTime]
  );

  const scheduleTaskReminder = useCallback(
    async (task) => {
      if (!NOTIFICATIONS_SUPPORTED) {
        return null;
      }
      const offsetMinutes = REMINDER_OFFSETS[task?.reminder] ?? null;
      if (offsetMinutes === null) {
        return null;
      }
      const permissionResponse = await Notifications.getPermissionsAsync();
      if (permissionResponse.status !== 'granted') {
        const requestResponse = await Notifications.requestPermissionsAsync();
        if (requestResponse.status !== 'granted') {
          return null;
        }
      }
      const reminderDate = findNextReminderDate(task);
      if (!reminderDate) {
        return null;
      }
      const diffSeconds = Math.max(
        1,
        Math.ceil((reminderDate.getTime() - Date.now()) / 1000)
      );
      const timeIntervalType =
        Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval';
      const dateType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
      const trigger =
        diffSeconds <= 120
          ? {
              type: timeIntervalType,
              seconds: diffSeconds,
              repeats: false,
            }
          : {
              type: dateType,
              date: reminderDate,
            };
      return Notifications.scheduleNotificationAsync({
        content: {
          title: 'Lembrete',
          body: task?.title ? `Hora de: ${task.title}` : 'Você tem uma tarefa pendente.',
          sound: true,
          channelId: 'default',
        },
        trigger,
      });
    },
    [findNextReminderDate]
  );

  const cancelTaskReminder = useCallback(async (notificationId) => {
    if (!NOTIFICATIONS_SUPPORTED || !notificationId) {
      return;
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.warn('Failed to cancel notification', error);
    }
  }, []);

  const updateTaskNotificationId = useCallback((taskId, notificationId) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId ? { ...task, notificationId } : task
      )
    );
  }, []);

  const refreshTaskReminder = useCallback(
    async (task, existingNotificationId) => {
      if (existingNotificationId) {
        await cancelTaskReminder(existingNotificationId);
      }
      const nextNotificationId = await scheduleTaskReminder(task);
      if (nextNotificationId) {
        updateTaskNotificationId(task.id, nextNotificationId);
      } else if (existingNotificationId) {
        updateTaskNotificationId(task.id, null);
      }
    },
    [cancelTaskReminder, scheduleTaskReminder, updateTaskNotificationId]
  );

  const handleCreateHabit = useCallback((habit) => {
    const normalizedDate = new Date(habit?.startDate ?? new Date());
    normalizedDate.setHours(0, 0, 0, 0);
    const dateKey = getDateKey(normalizedDate);
    const color = habit?.color ?? '#d1d7ff';
    const title = getUniqueTitle(habit?.title, null);
    const repeat = normalizeRepeatConfig(habit?.repeat);
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      color,
      emoji: habit?.emoji ?? '✅',
      customImage: habit?.customImage ?? null,
      time: habit?.time,
      date: normalizedDate,
      dateKey,
      completedDates: {},
      subtasks: convertSubtasks(habit?.subtasks ?? []),
      repeat,
      reminder: habit?.reminder,
      tag: habit?.tag,
      tagLabel: habit?.tagLabel,
      type: habit?.type ?? 'normal',
      typeLabel: habit?.typeLabel,
      quantum: habit?.quantum,
      profileLocked: false,
      notificationId: null,
    };
    setTasks((previous) => [...previous, newTask]);
    void refreshTaskReminder(newTask, null);
    setSelectedDate(normalizedDate);
    triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    appendHistoryEntry('task_created', {
      taskId: newTask.id,
      title,
      dateKey: newTask.dateKey,
    });
  }, [appendHistoryEntry, convertSubtasks, getUniqueTitle, refreshTaskReminder]);

  const handleUpdateHabit = useCallback(
    (taskId, habit) => {
      const normalizedDate = habit?.startDate ? new Date(habit.startDate) : null;
      if (normalizedDate) {
        normalizedDate.setHours(0, 0, 0, 0);
      }
      const existingTask = tasks.find((task) => task.id === taskId);
      if (!existingTask) {
        return;
      }
      const nextTitle = habit?.title
        ? getUniqueTitle(habit.title, taskId)
        : existingTask?.title ?? 'Untitled task';
      const existingNotificationId = existingTask?.notificationId ?? null;
      const nextDate = normalizedDate ? new Date(normalizedDate) : new Date(existingTask.date);
      nextDate.setHours(0, 0, 0, 0);
      const nextQuantum = habit?.quantum ?? existingTask.quantum;
      let mergedQuantum = nextQuantum;
      if (nextQuantum && existingTask.quantum) {
        const sameMode = nextQuantum.mode === existingTask.quantum.mode;
        mergedQuantum = {
          ...existingTask.quantum,
          ...nextQuantum,
          doneSeconds: sameMode ? existingTask.quantum.doneSeconds ?? 0 : 0,
          doneCount: sameMode ? existingTask.quantum.doneCount ?? 0 : 0,
        };
      }
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          return {
            ...task,
            title: nextTitle,
            color: habit?.color ?? task.color,
            emoji: habit?.emoji ?? task.emoji,
            customImage: habit?.customImage ?? task.customImage ?? null,
            time: habit?.time,
            subtasks: convertSubtasks(habit?.subtasks ?? [], task.subtasks ?? []),
            repeat: normalizeRepeatConfig(habit?.repeat ?? task.repeat),
            reminder: habit?.reminder,
            tag: habit?.tag,
            tagLabel: habit?.tagLabel,
            type: habit?.type,
            typeLabel: habit?.typeLabel,
            quantum: mergedQuantum,
            date: nextDate,
            dateKey: getDateKey(nextDate),
            profileLocked: task.profileLocked ?? false,
            notificationId: task.notificationId ?? null,
          };
        })
      );
      if (existingTask) {
        const updatedTask = {
          ...existingTask,
          title: nextTitle,
          color: habit?.color ?? existingTask.color,
          emoji: habit?.emoji ?? existingTask.emoji,
          customImage: habit?.customImage ?? existingTask.customImage ?? null,
          time: habit?.time,
          subtasks: convertSubtasks(habit?.subtasks ?? [], existingTask.subtasks ?? []),
          repeat: normalizeRepeatConfig(habit?.repeat ?? existingTask.repeat),
          reminder: habit?.reminder,
          tag: habit?.tag,
          tagLabel: habit?.tagLabel,
          type: habit?.type,
          typeLabel: habit?.typeLabel,
          quantum: mergedQuantum,
          date: nextDate,
          dateKey: getDateKey(nextDate),
          profileLocked: existingTask.profileLocked ?? false,
          notificationId: existingNotificationId,
        };
        void refreshTaskReminder(updatedTask, existingNotificationId);
      }
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      if (normalizedDate) {
        setSelectedDate(normalizedDate);
      }
      appendHistoryEntry('task_updated', {
        taskId,
        title: nextTitle,
        dateKey: normalizedDate ? getDateKey(normalizedDate) : undefined,
      });
    },
    [appendHistoryEntry, convertSubtasks, getUniqueTitle, refreshTaskReminder, tasks]
  );

  const handleToggleSubtask = useCallback(
    (taskId, subtaskId) => {
      triggerSelection();
      const targetTask = tasks.find((task) => task.id === taskId);
      const targetDateKey =
        selectedDateKey ??
        targetTask?.dateKey ??
        (targetTask?.date ? getDateKey(targetTask.date) : null);
      const targetSubtask = targetTask?.subtasks?.find((item) => item.id === subtaskId);
      const wasCompleted = targetSubtask
        ? getSubtaskCompletionStatus(targetSubtask, targetDateKey)
        : false;
      setTasks((previous) =>
        previous.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          return {
            ...task,
            subtasks: (task.subtasks ?? []).map((subtask) => {
              if (subtask.id !== subtaskId) {
                return subtask;
              }
              const completedDates = { ...(subtask.completedDates ?? {}) };
              const isCompletedForDate = getSubtaskCompletionStatus(subtask, targetDateKey);
              if (isCompletedForDate) {
                delete completedDates[targetDateKey];
              } else if (targetDateKey) {
                completedDates[targetDateKey] = true;
              }
              return {
                ...subtask,
                completedDates,
              };
            }),
          };
        })
      );
      appendHistoryEntry('subtask_completion_toggled', {
        taskId,
        subtaskId,
        dateKey: targetDateKey,
        completed: !wasCompleted,
      });
    },
    [appendHistoryEntry, selectedDateKey, tasks]
  );

  const openHabitSheet = useCallback((mode, task = null) => {
    setHabitSheetMode(mode);
    setHabitSheetInitialTask(task);
    setIsHabitSheetOpen(true);
  }, []);

  const closeTaskDetail = useCallback(() => {
    setActiveTaskId(null);
  }, []);

  useEffect(() => {
    if (activeTaskId && !tasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(null);
    }
  }, [activeTaskId, tasks]);

  useEffect(() => {
    if (!isFabOpen || Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFabMenu();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [closeFabMenu, isFabOpen]);

  useEffect(() => {
    if (!isFabMenuMounted) {
      overlayOpacity.setValue(0);
      actionsScale.setValue(0.85);
      actionsOpacity.setValue(0);
      actionsTranslateY.setValue(12);
      return;
    }

    if (isFabOpen) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.spring(actionsScale, {
          toValue: 1,
          damping: 18,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 0,
          duration: 160,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 12,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(actionsScale, {
          toValue: 0.85,
          duration: 150,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(({ finished }) => {
        if (finished && !isFabOpen) {
          setIsFabMenuMounted(false);
        }
      });
    }
  }, [actionsOpacity, actionsScale, actionsTranslateY, isFabMenuMounted, isFabOpen, overlayOpacity]);

  const renderTabButton = ({ key, label, icon }) => {
    const isActive = activeTab === key;
    return (
      <TouchableOpacity
        key={key}
        style={styles.tabButton}
        onPress={() => handleChangeTab(key)}
        accessibilityRole="button"
        accessibilityLabel={`${label} tab`}
        disabled={isFabOpen}
      >
        <Ionicons
          name={icon}
          size={iconSize}
          color={isActive ? styles.activeColor.color : styles.inactiveColor.color}
        />
        <Text
          style={[
            styles.tabLabel,
            dynamicStyles.tabLabel,
            isActive ? styles.activeColor : styles.inactiveColor,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.appFrame,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#f6f6fb"
        translucent={false}
      />

      <ConfettiOverlay
        key={confettiKey}
        visible={showConfetti}
        onComplete={handleConfettiComplete}
      />

      <View style={styles.container}>
        <View
          style={[
            styles.content,
            dynamicStyles.content,
            activeTab === 'calendar' && { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
            activeTab === 'profile' && { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, alignItems: 'center', justifyContent: 'center' },
          ]}
          importantForAccessibility={isFabOpen ? 'no-hide-descendants' : 'auto'}
        >
          {activeTab === 'today' ? (
            <ScrollView
              contentContainerStyle={styles.todayContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.todayHeader}>
                <Text style={styles.todayTitle}>{selectedDateLabel}</Text>
                {tasksForSelectedDate.length > 0 && (
                  <Text
                    style={[
                      styles.todaySubtitle,
                      allTasksCompletedForSelectedDay
                        ? styles.todaySubtitleSuccess
                        : styles.todaySubtitleInProgress,
                    ]}
                  >
                    {allTasksCompletedForSelectedDay
                      ? 'All tasks completed'
                      : `${completedTaskCount}/${tasksForSelectedDate.length} completed`}
                  </Text>
                )}
              </View>

              <View style={styles.daySelector}>
                {weekDays.map((day) => {
                  const isSelected = day.key === selectedDateKey;
                  const isToday = day.key === todayKey;
                  const dayContainerStyles = [styles.dayNumber];
                  const dayTextStyles = [styles.dayNumberText];
                  if (isSelected) {
                    dayContainerStyles.push(styles.dayNumberSelected);
                    dayTextStyles.push(styles.dayNumberTextSelected);
                  }
                  if (day.allCompleted) {
                    dayContainerStyles.push(styles.dayNumberCompleted);
                    dayTextStyles.push(styles.dayNumberTextCompleted);
                  }
                  const indicatorStyles = [styles.todayIndicator];
                  if (day.allCompleted) {
                    indicatorStyles.push(styles.todayIndicatorOnCompleted);
                  }
                  return (
                    <Pressable
                      key={day.key}
                      style={styles.dayItem}
                      onPress={() => handleSelectDate(day.date)}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.label} ${day.dayNumber}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>
                        {day.label}
                      </Text>
                      <View style={dayContainerStyles}>
                        <Text style={dayTextStyles}>{day.dayNumber}</Text>
                        {isToday && <View style={indicatorStyles} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {tagOptions.length > 0 && (
                <View style={styles.tagFilterContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tagFilterScroll}
                  >
                    <Pressable
                      key="all"
                      style={[
                        styles.tagPill,
                        selectedTagFilter === 'all' && styles.tagPillSelected,
                      ]}
                      onPress={() => {
                        if (selectedTagFilter !== 'all') {
                          triggerSelection();
                          handleSelectTagFilter('all');
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Show all tags"
                      accessibilityState={{ selected: selectedTagFilter === 'all' }}
                    >
                      <Text
                        style={[
                          styles.tagPillText,
                          selectedTagFilter === 'all' && styles.tagPillTextSelected,
                        ]}
                      >
                        All
                      </Text>
                    </Pressable>
                    {tagOptions.map((option) => {
                      const isSelected = selectedTagFilter === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          style={[styles.tagPill, isSelected && styles.tagPillSelected]}
                          onPress={() => {
                            if (!isSelected) {
                              triggerSelection();
                              handleSelectTagFilter(option.key);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Show tasks tagged ${option.label}`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[styles.tagPillText, isSelected && styles.tagPillTextSelected]}
                            numberOfLines={1}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.tasksSection}>
                {visibleTasksWithStats.length === 0 ? (
                  <View style={styles.emptyStateContainer}>
                    <View
                      style={[styles.emptyStateIllustration, dynamicStyles.emptyStateIllustration]}
                      accessible
                      accessibilityRole="image"
                      accessibilityLabel="Illustration showing an empty schedule"
                    >
                      <Ionicons name="calendar-clear-outline" size={emptyStateIconSize} color="#3c2ba7" />
                    </View>
                    <Text style={styles.emptyState}>
                      {selectedTagFilter === 'all'
                        ? 'No tasks for this day yet. Use the add button to create one.'
                        : 'No tasks with this tag for this day yet.'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={visibleTasksWithStats}
                    renderItem={({ item: task }) => (
                      <SwipeableTaskCard
                        task={task}
                        backgroundColor={task.backgroundColor}
                        borderColor={task.borderColor}
                        dateKey={selectedDateKey}
                        totalSubtasks={task.totalSubtasks}
                        completedSubtasks={task.completedSubtasks}
                        onPress={() => setActiveTaskId(task.id)}
                        onToggleCompletion={() => handleToggleTaskCompletion(task.id, selectedDateKey)}
                        onAdjustQuantum={() => openQuantumAdjust(task)}
                        onCopy={() => {
                          const duplicated = {
                            ...task,
                            title: `${task.title} 1`,
                            subtasks: task.subtasks?.map((subtask) => subtask.title) ?? [],
                            startDate: task.date,
                          };
                          openHabitSheet('copy', duplicated);
                        }}
                        onDelete={() => {
                          if (task.profileLocked) {
                            return;
                          }
                          setTasks((previous) => previous.filter((current) => current.id !== task.id));
                        }}
                        onEdit={() => {
                          const editable = {
                            ...task,
                            startDate: task.date,
                            subtasks: task.subtasks?.map((subtask) => subtask.title) ?? [],
                          };
                          openHabitSheet('edit', editable);
                        }}
                      />
                    )}
                    keyExtractor={(task) => task.id}
                    scrollEnabled={false}
                    contentContainerStyle={styles.tasksList}
                  />
                )}
              </View>
            </ScrollView>
          ) : activeTab === 'calendar' ? (
            <View style={{ flex: 1 }}>
              <StickyMonthHeader date={visibleCalendarDate} customImages={customMonthImages} />

              <FlatList
                data={calendarMonths}
                renderItem={renderCalendarMonth}
                keyExtractor={(item) => item.id.toString()}
                showsVerticalScrollIndicator={false}
                initialScrollIndex={initialCalendarIndex !== -1 ? initialCalendarIndex : 60}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                getItemLayout={getItemLayout}
                onScrollToIndexFailed={(info) => {
                  const wait = new Promise((resolve) => setTimeout(resolve, 500));
                  wait.then(() => {
                    // Retry can be added here if a ref is available
                  });
                }}
                contentContainerStyle={[
                  styles.calendarListContent,
                  {
                    paddingTop: 0,
                    paddingBottom: isCompact ? 56 : 72,
                    paddingHorizontal: 0,
                  },
                ]}
                onEndReached={loadMoreCalendarMonths}
                onEndReachedThreshold={0.5}
              />
            </View>
          ) : activeTab === 'profile' ? (
             <View style={styles.profileContainer}>
                <View style={styles.profileStatsSection}>
                  <Text style={styles.profileStatsTitle}>Stats</Text>
                  <View style={styles.profileStatsGrid}>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>Total days</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.totalDays}</Text>
                        <Text style={styles.profileStatUnit}>{totalDaysUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>Committed habits</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.committedHabits}</Text>
                        <Text style={styles.profileStatUnit}>{habitsUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>Current streak</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.currentStreak}</Text>
                        <Text style={styles.profileStatUnit}>{currentStreakUnit}</Text>
                      </View>
                    </View>
                    <View style={styles.profileStatCard}>
                      <Text style={styles.profileStatLabel}>Best streak</Text>
                      <View style={styles.profileStatValueRow}>
                        <Text style={styles.profileStatValue}>{profileStats.bestStreak}</Text>
                        <Text style={styles.profileStatUnit}>{bestStreakUnit}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.customizeButton}
                  onPress={() => setCustomizeCalendarOpen(true)}
                  activeOpacity={0.8}
                >
                   <Ionicons name="images-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                   <Text style={styles.customizeButtonText}>Customize Calendar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileTasksButton}
                  onPress={handleOpenProfileTasks}
                  activeOpacity={0.85}
                >
                  <Ionicons name="list-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.profileTasksButtonText}>Open tasks</Text>
                </TouchableOpacity>
             </View>
          ) : (
            <View style={styles.placeholderContainer}>
              <View style={styles.placeholderIconWrapper}>
                <Ionicons
                  name={
                    activeTab === 'discover'
                      ? 'planet-outline'
                      : 'person-circle-outline'
                  }
                  size={48}
                  color="#3c2ba7"
                />
              </View>
              <Text style={styles.heading}>
                {activeTab === 'discover'
                  ? 'Discover'
                  : 'Profile'}
              </Text>
              <Text style={[styles.description, dynamicStyles.description, styles.placeholderDescription]}>
                {activeTab === 'discover'
                  ? 'Explore new routines, templates, and ideas to add to your day.'
                  : 'View and personalize your profile, preferences, and progress.'}
              </Text>
            </View>
          )}
        </View>

        <View
          style={[styles.bottomBarContainer, dynamicStyles.bottomBarContainer]}
          importantForAccessibility={isFabOpen ? 'no-hide-descendants' : 'auto'}
        >
          <View
            style={[
              styles.bottomBar,
              dynamicStyles.bottomBar,
              isFabOpen && styles.bottomBarDimmed,
            ]}
          >
            <View style={[styles.tabGroup, dynamicStyles.tabGroupLeft]}>
              {LEFT_TABS.map(renderTabButton)}
            </View>
            <View style={[styles.tabGroup, dynamicStyles.tabGroupRight]}>
              {RIGHT_TABS.map(renderTabButton)}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.addButton,
              dynamicStyles.addButton,
              isFabOpen && styles.addButtonActive,
            ]}
            onPress={handleToggleFab}
            accessibilityRole="button"
            accessibilityLabel={isFabOpen ? 'Close add menu' : 'Open add menu'}
            activeOpacity={0.85}
          >
            {isFabOpen && (
              <View
                pointerEvents="none"
                style={[
                  styles.addButtonBase,
                  {
                    width: fabBaseSize,
                    height: fabBaseSize,
                    borderRadius: fabBaseSize / 2,
                    top: (fabSize - fabBaseSize) / 2,
                    left: (fabSize - fabBaseSize) / 2,
                  },
                ]}
              />
            )}
            {isFabOpen && (
              <View
                pointerEvents="none"
                style={[
                  styles.addButtonHalo,
                  {
                    width: fabHaloSize,
                    height: fabHaloSize,
                    borderRadius: fabHaloSize / 2,
                    top: (fabSize - fabHaloSize) / 2,
                    left: (fabSize - fabHaloSize) / 2,
                  },
                ]}
              />
            )}
            <Ionicons
              name={isFabOpen ? 'close' : 'add'}
              size={fabIconSize}
              color={isFabOpen ? '#3c2ba7' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {isFabMenuMounted && (
          <AnimatedPressable
            style={[styles.overlay, { opacity: overlayOpacity }]}
            onPress={closeFabMenu}
            accessibilityRole="button"
            accessibilityLabel="Close add menu"
            pointerEvents="auto"
            accessibilityHint="Tap to dismiss the add options"
          >
          </AnimatedPressable>
        )}

        {isFabMenuMounted && (
          <Animated.View
            pointerEvents={isFabOpen ? 'auto' : 'none'}
            style={[
              styles.fabActionsContainer,
              {
                bottom: insets.bottom + fabSize / 2 + cardVerticalOffset,
                opacity: actionsOpacity,
                transform: [
                  { scale: actionsScale },
                  { translateY: actionsTranslateY },
                ],
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.fabActionsRow}>
              <TouchableOpacity
                style={[
                  styles.fabCard,
                  {
                    width: cardSize,
                    height: cardSize,
                    borderRadius: cardBorderRadius,
                    marginHorizontal: cardSpacing / 2,
                    transform: [{ rotate: '-7deg' }],
                    borderWidth: isCompact ? 4 : 5,
                    borderColor: '#ffffff',
                  },
                ]}
                onPress={handleAddHabit}
                accessibilityRole="button"
                accessibilityLabel="Add habit"
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#C084FC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.fabCardBackground,
                    {
                      borderRadius: cardBorderRadius,
                      paddingHorizontal: cardSize * 0.14,
                      paddingVertical: isCompact ? 18 : 22,
                    },
                  ]}
                >
                  <View style={styles.fabCardContent}>
                    <Image
                      source={habitImage}
                      style={[
                        styles.fabCardIcon,
                        {
                          width: cardIconSize,
                          height: cardIconSize,
                          marginBottom: isCompact ? 12 : 14,
                        },
                      ]}
                      resizeMode="contain"
                      accessible
                      accessibilityLabel="Illustration of adding a habit"
                    />
                    <Text
                      style={[
                        styles.fabCardTitle,
                        {
                          fontSize: isCompact ? 16 : 17,
                          marginBottom: isCompact ? 6 : 8,
                        },
                      ]}
                    >
                      Add habit
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        {
                          fontSize: isCompact ? 12 : 13,
                          lineHeight: isCompact ? 18 : 20,
                        },
                      ]}
                    >
                      {`Add a new routine\nto your life`}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fabCard,
                  {
                    width: cardSize,
                    height: cardSize,
                    borderRadius: cardBorderRadius,
                    marginHorizontal: cardSpacing / 2,
                    transform: [{ rotate: '7deg' }],
                    borderWidth: isCompact ? 4 : 5,
                    borderColor: '#ffffff',
                  },
                ]}
                onPress={handleAddReflection}
                accessibilityRole="button"
                accessibilityLabel="Add reflection"
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#F59E0B', '#FDE047']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.fabCardBackground,
                    {
                      borderRadius: cardBorderRadius,
                      paddingHorizontal: cardSize * 0.14,
                      paddingVertical: isCompact ? 18 : 22,
                    },
                  ]}
                >
                  <View style={styles.fabCardContent}>
                    <Image
                      source={reflectionImage}
                      style={[
                        styles.fabCardIcon,
                        {
                          width: cardIconSize,
                          height: cardIconSize,
                          marginBottom: isCompact ? 12 : 14,
                        },
                      ]}
                      resizeMode="contain"
                      accessible
                      accessibilityLabel="Illustration of adding a reflection"
                    />
                    <Text
                      style={[
                        styles.fabCardTitle,
                        {
                          fontSize: isCompact ? 16 : 17,
                          marginBottom: isCompact ? 6 : 8,
                        },
                      ]}
                    >
                      Add reflection
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        {
                          fontSize: isCompact ? 12 : 13,
                          lineHeight: isCompact ? 18 : 20,
                        },
                      ]}
                    >
                      {`Reflect on your day\nwith your mood and feelings`}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
      <TaskDetailModal
        visible={Boolean(activeTaskForSelectedDate)}
        task={activeTaskForSelectedDate}
        dateKey={selectedDateKey}
        onClose={closeTaskDetail}
        onToggleSubtask={handleToggleSubtask}
        onToggleCompletion={(taskId) => handleToggleTaskCompletion(taskId, selectedDateKey)}
        onEdit={(taskId) => {
          const taskToEdit = tasks.find((task) => task.id === taskId);
          if (!taskToEdit) {
            return;
          }
          const editable = {
            ...taskToEdit,
            startDate: taskToEdit.date,
            subtasks: taskToEdit.subtasks?.map((subtask) => subtask.title) ?? [],
          };
          openHabitSheet('edit', editable);
          closeTaskDetail();
        }}
      />
      <DayReportModal
        visible={!!reportDate}
        date={reportDate}
        tasks={reportTasks}
        onClose={() => setReportDate(null)}
        customImages={customMonthImages}
      />
      <AddHabitSheet
        visible={isHabitSheetOpen}
        onClose={handleCloseCreateHabit}
        onCreate={(habit) => {
          handleCreateHabit(habit);
          handleCloseCreateHabit();
        }}
        onUpdate={(habit) => {
          if (habitSheetInitialTask) {
            handleUpdateHabit(habitSheetInitialTask.id, habit);
          }
          handleCloseCreateHabit();
        }}
        mode={habitSheetMode}
        initialHabit={habitSheetInitialTask}
        availableTagOptions={availableTagOptions}
      />
      <QuantumAdjustModal
        task={tasks.find((task) => task.id === quantumAdjustTaskId) ?? null}
        visible={!!quantumAdjustTaskId}
        minutesValue={quantumAdjustMinutes}
        secondsValue={quantumAdjustSeconds}
        countValue={quantumAdjustCount}
        dateKey={selectedDateKey}
        onChangeMinutes={setQuantumAdjustMinutes}
        onChangeSeconds={setQuantumAdjustSeconds}
        onChangeCount={setQuantumAdjustCount}
        onAdd={() => handleQuantumAdjustment(1)}
        onSubtract={() => handleQuantumAdjustment(-1)}
        onClose={closeQuantumAdjust}
      />
      <CustomizeCalendarModal
        visible={isCustomizeCalendarOpen}
        onClose={() => setCustomizeCalendarOpen(false)}
        customImages={customMonthImages}
        onUpdateImage={handleUpdateMonthImage}
      />
      <ProfileTasksModal
        visible={isProfileTasksOpen}
        tasks={profileTasks}
        onClose={handleCloseProfileTasks}
        onSelectTask={(taskId) => setActiveProfileTaskId(taskId)}
        onDeleteTask={handleDeleteProfileTask}
        onDeleteSelected={handleDeleteProfileTasks}
      />
      <ProfileTaskDetailModal
        visible={isProfileTasksOpen && !!activeProfileTaskId}
        task={activeProfileTask}
        onClose={() => setActiveProfileTaskId(null)}
        onToggleLock={handleToggleProfileTaskLock}
      />
    </View>
  );
}

function SwipeableTaskCard({
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
    if (!totalSubtasks) {
      return null;
    }
    return `${completedSubtasks}/${totalSubtasks}`;
  }, [completedSubtasks, dateKey, task, totalSubtasks]);

  const isQuantum = task.type === 'quantum';
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
      </Animated.View>
    </View>
  );
}

function ProfileSwipeTaskCard({
  task,
  onPress,
  onDelete,
  onToggleSelect,
  isSelected,
  selectionMode,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionWidth = 92;
  const [isOpen, setIsOpen] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const currentOffsetRef = useRef(0);

  useEffect(() => {
    setHasImageError(false);
  }, [task.customImage]);

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentOffsetRef.current = value;
    });
    return () => {
      translateX.removeListener(id);
    };
  }, [translateX]);

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
    if (selectionMode) {
      onToggleSelect?.(task.id);
      return;
    }
    onPress?.();
  }, [closeActions, isOpen, onPress, onToggleSelect, selectionMode, task.id]);

  const handleLongPress = useCallback(() => {
    onToggleSelect?.(task.id);
  }, [onToggleSelect, task.id]);

  const handleDelete = useCallback(() => {
    closeActions();
    triggerSelection();
    onDelete?.(task.id);
  }, [closeActions, onDelete, task.id]);

  const tagLabel = getTaskTagDisplayLabel(task);
  const backgroundColor = lightenColor(task.color, 0.92);

  return (
    <View style={styles.profileSwipeWrapper}>
      <View style={styles.profileSwipeActions}>
        <TouchableOpacity
          style={[
            styles.profileSwipeDelete,
            task.profileLocked && styles.profileSwipeDeleteDisabled,
          ]}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete task"
          disabled={task.profileLocked}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.profileSwipeDeleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.profileTaskCard,
          isSelected && styles.profileTaskCardSelected,
          {
            borderColor: task.color,
            backgroundColor,
            transform: [{ translateX }],
          },
        ]}
      >
        <Pressable
          style={styles.profileTaskCardContent}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          <View style={styles.profileTaskIcon}>
            {task.customImage && !hasImageError ? (
              <Image
                source={{ uri: task.customImage }}
                style={styles.profileTaskEmojiImage}
                onError={() => setHasImageError(true)}
              />
            ) : (
              <Text style={styles.profileTaskEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
            )}
          </View>
          <View style={styles.profileTaskDetails}>
            <View style={styles.profileTaskTitleRow}>
              <Text style={styles.profileTaskTitle} numberOfLines={1}>
                {task.title}
              </Text>
              {task.profileLocked ? (
                <Ionicons
                  name="lock-closed"
                  size={14}
                  color="#9aa3b2"
                  style={styles.profileTaskLockIcon}
                />
              ) : null}
            </View>
            <View style={styles.profileTaskMetaRow}>
              <Text style={styles.profileTaskTime}>{formatTaskTime(task.time)}</Text>
              {tagLabel ? (
                <View style={styles.profileTaskTag}>
                  <Text style={styles.profileTaskTagText}>{tagLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ProfileTasksModal({
  visible,
  tasks,
  onClose,
  onSelectTask,
  onDeleteTask,
  onDeleteSelected,
}) {
  const [searchValue, setSearchValue] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [selectedRepeat, setSelectedRepeat] = useState('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  useEffect(() => {
    if (!visible) {
      setSearchValue('');
      setSelectedTag('all');
      setSelectedRepeat('all');
      setSelectedTaskIds([]);
    }
  }, [visible]);

  const tagOptions = useMemo(() => {
    const seen = new Map();
    tasks.forEach((task) => {
      const key = normalizeTaskTagKey(task);
      if (!key || seen.has(key)) {
        return;
      }
      seen.set(key, getTaskTagDisplayLabel(task) ?? 'Tag');
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [tasks]);

  const repeatOptions = useMemo(() => {
    const seen = new Set();
    tasks.forEach((task) => {
      const repeatConfig = normalizeRepeatConfig(task.repeat);
      if (!repeatConfig.enabled) {
        seen.add('one-time');
        return;
      }
      const frequency = repeatConfig.frequency ?? repeatConfig.option ?? 'daily';
      seen.add(frequency);
    });
    return Array.from(seen);
  }, [tasks]);

  const repeatLabels = useMemo(
    () => ({
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      weekend: 'Weekend',
      weekdays: 'Weekdays',
      'one-time': 'One-time',
    }),
    []
  );

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    return tasks.filter((task) => {
      if (
        normalizedSearch &&
        !(task.title || '').toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }
      if (selectedTag !== 'all' && normalizeTaskTagKey(task) !== selectedTag) {
        return false;
      }
      if (selectedRepeat !== 'all') {
        const repeatConfig = normalizeRepeatConfig(task.repeat);
        if (!repeatConfig.enabled) {
          return selectedRepeat === 'one-time';
        }
        const frequency = repeatConfig.frequency ?? repeatConfig.option ?? 'daily';
        if (frequency !== selectedRepeat) {
          return false;
        }
      }
      return true;
    });
  }, [searchValue, selectedTag, selectedRepeat, tasks]);

  const toggleSelectedTask = useCallback((taskId) => {
    setSelectedTaskIds((previous) =>
      previous.includes(taskId)
        ? previous.filter((id) => id !== taskId)
        : [...previous, taskId]
    );
  }, []);

  const selectionMode = selectedTaskIds.length > 0;
  const handleBulkDelete = useCallback(() => {
    if (selectedTaskIds.length === 0) {
      return;
    }
    onDeleteSelected?.(selectedTaskIds);
    setSelectedTaskIds([]);
  }, [onDeleteSelected, selectedTaskIds]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileTasksContainer}>
        <View style={styles.profileTasksHeader}>
          <View>
            <Text style={styles.profileTasksTitle}>Your tasks</Text>
            <Text style={styles.profileTasksSubtitle}>
              Minimal view to keep your profile organized.
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close profile tasks"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color="#1F2742" />
          </Pressable>
        </View>
        <View style={styles.profileTasksFilters}>
          <View style={styles.profileTasksSearchRow}>
            <Ionicons name="search-outline" size={18} color="#9aa5b5" />
            <TextInput
              style={styles.profileTasksSearchInput}
              value={searchValue}
              onChangeText={setSearchValue}
              placeholder="Search by name"
              placeholderTextColor="#9aa5b5"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksFilterRow}
          >
            <Pressable
              style={[
                styles.profileTasksFilterPill,
                selectedTag === 'all' && styles.profileTasksFilterPillActive,
              ]}
              onPress={() => setSelectedTag('all')}
            >
              <Text
                style={[
                  styles.profileTasksFilterText,
                  selectedTag === 'all' && styles.profileTasksFilterTextActive,
                ]}
              >
                All tags
              </Text>
            </Pressable>
            {tagOptions.map((option) => (
              <Pressable
                key={option.key}
                style={[
                  styles.profileTasksFilterPill,
                  selectedTag === option.key && styles.profileTasksFilterPillActive,
                ]}
                onPress={() => setSelectedTag(option.key)}
              >
                <Text
                  style={[
                    styles.profileTasksFilterText,
                    selectedTag === option.key && styles.profileTasksFilterTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksFilterRow}
          >
            <Pressable
              style={[
                styles.profileTasksFilterPill,
                selectedRepeat === 'all' && styles.profileTasksFilterPillActive,
              ]}
              onPress={() => setSelectedRepeat('all')}
            >
              <Text
                style={[
                  styles.profileTasksFilterText,
                  selectedRepeat === 'all' && styles.profileTasksFilterTextActive,
                ]}
              >
                All repeats
              </Text>
            </Pressable>
            {repeatOptions.map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.profileTasksFilterPill,
                  selectedRepeat === option && styles.profileTasksFilterPillActive,
                ]}
                onPress={() => setSelectedRepeat(option)}
              >
                <Text
                  style={[
                    styles.profileTasksFilterText,
                    selectedRepeat === option && styles.profileTasksFilterTextActive,
                  ]}
                >
                  {repeatLabels[option] ?? option}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {filteredTasks.length === 0 ? (
          <View style={styles.profileTasksEmpty}>
            <Text style={styles.profileTasksEmptyText}>
              No tasks match the current filters.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={(task) => task.id}
            renderItem={({ item }) => (
              <ProfileSwipeTaskCard
                task={item}
                onPress={() => onSelectTask?.(item.id)}
                onDelete={onDeleteTask}
                onToggleSelect={toggleSelectedTask}
                isSelected={selectedTaskIds.includes(item.id)}
                selectionMode={selectionMode}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksList}
          />
        )}
        {selectionMode ? (
          <View style={styles.profileTasksBulkBar}>
            <Text style={styles.profileTasksBulkText}>
              {selectedTaskIds.length} selected
            </Text>
            <Pressable
              style={styles.profileTasksBulkDelete}
              onPress={handleBulkDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete selected tasks"
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.profileTasksBulkDeleteText}>Delete selected</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ProfileTaskDetailModal({ visible, task, onClose, onToggleLock }) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [task?.customImage, visible]);

  if (!visible || !task) {
    return null;
  }

  const normalizedDate = normalizeDateValue(task.date ?? task.dateKey);
  const dateLabel = normalizedDate ? format(normalizedDate, 'PPP', { locale: ptBR }) : 'Not set';
  const tagLabel = getTaskTagDisplayLabel(task) ?? 'No tag';
  const typeLabel = task.typeLabel ?? task.type ?? 'Standard';
  const isQuantum = task.type === 'quantum';
  const repeatConfig = normalizeRepeatConfig(task.repeat);
  const todayKey = getDateKey(new Date());
  const quantumLabel = isQuantum ? getQuantumProgressLabel(task, todayKey) : null;
  const quantumModeLabel =
    task.quantum?.mode === 'timer' ? 'Timer' : task.quantum?.mode ? 'Cont' : 'Quantum';
  const repeatLabel = repeatConfig.enabled
    ? repeatConfig.frequency === 'daily'
      ? repeatConfig.interval === 1
        ? 'Daily'
        : `Every ${repeatConfig.interval} days`
      : repeatConfig.frequency === 'weekly'
      ? repeatConfig.interval === 1
        ? 'Weekly'
        : `Every ${repeatConfig.interval} weeks`
      : repeatConfig.frequency === 'monthly'
      ? repeatConfig.interval === 1
        ? 'Monthly'
        : `Every ${repeatConfig.interval} months`
      : repeatConfig.frequency === 'weekend'
      ? 'Weekends'
      : repeatConfig.frequency === 'weekdays'
      ? 'Weekdays'
      : repeatConfig.frequency
    : 'One-time';
  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.profileDetailOverlay}>
        <Pressable style={styles.profileDetailBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.profileDetailCard}>
          <View style={styles.profileDetailHeader}>
            <View style={styles.profileDetailHeaderInfo}>
              {task.customImage && !hasImageError ? (
                <Image
                  source={{ uri: task.customImage }}
                  style={styles.profileDetailEmojiImage}
                  onError={() => setHasImageError(true)}
                />
              ) : (
                <Text style={styles.profileDetailEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
              )}
              <View style={styles.profileDetailTitleBlock}>
                <Text style={styles.profileDetailTitle}>{task.title}</Text>
                <Text style={styles.profileDetailTime}>{formatTaskTime(task.time)}</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close task details"
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color="#1F2742" />
            </Pressable>
          </View>
          <View style={styles.profileDetailBody}>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Start date</Text>
              <Text style={styles.profileDetailValue}>{dateLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Repeat</Text>
              <Text style={styles.profileDetailValue}>{repeatLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Type</Text>
              <Text style={styles.profileDetailValue}>{typeLabel}</Text>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Tag</Text>
              <Text style={styles.profileDetailValue}>{tagLabel}</Text>
            </View>
            {isQuantum ? (
              <View style={styles.profileDetailRow}>
                <Text style={styles.profileDetailLabel}>{quantumModeLabel}</Text>
                <Text style={styles.profileDetailValue}>{quantumLabel ?? 'Not set'}</Text>
              </View>
            ) : (
              <View style={styles.profileDetailRow}>
                <Text style={styles.profileDetailLabel}>Subtasks</Text>
                <Text style={styles.profileDetailValue}>{totalSubtasks}</Text>
              </View>
            )}
          </View>
          <Pressable
            style={[
              styles.profileDetailLockButton,
              task.profileLocked && styles.profileDetailLockButtonActive,
            ]}
            onPress={() => onToggleLock?.(task.id)}
            accessibilityRole="button"
            accessibilityLabel={task.profileLocked ? 'Unlock task' : 'Lock task'}
          >
            <Ionicons
              name={task.profileLocked ? 'lock-closed' : 'lock-open'}
              size={18}
              color={task.profileLocked ? '#fff' : '#3c2ba7'}
            />
            <Text
              style={[
                styles.profileDetailLockButtonText,
                task.profileLocked && styles.profileDetailLockButtonTextActive,
              ]}
            >
              {task.profileLocked ? 'Unlock task' : 'Lock task'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TaskDetailModal({
  visible,
  task,
  dateKey,
  onClose,
  onToggleSubtask,
  onToggleCompletion,
  onEdit,
}) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [task?.customImage, visible]);

  if (!visible || !task) {
    return null;
  }

  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
  const completedSubtasks = Array.isArray(task.subtasks)
    ? task.subtasks.filter((item) => getSubtaskCompletionStatus(item, dateKey)).length
    : 0;
  const quantumLabel = getQuantumProgressLabel(task, dateKey);
  const cardBackground = lightenColor(task.color, 0.85);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.detailOverlay}>
        <Pressable style={styles.detailBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.detailCardContainer}>
          <View style={[styles.detailCard, { backgroundColor: cardBackground, borderColor: task.color }]}>
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailHeaderInfo}>
              {task.customImage && !hasImageError ? (
                <Image
                  source={{ uri: task.customImage }}
                  style={styles.detailEmojiImage}
                  onError={() => setHasImageError(true)}
                />
              ) : (
                <Text style={styles.detailEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
              )}
              <View style={styles.detailTitleContainer}>
                <View style={styles.detailTitleRow}>
                  <Text style={styles.detailTitle}>{task.title}</Text>
                  <Ionicons
                    name={task.profileLocked ? 'lock-closed' : 'lock-open-outline'}
                    size={14}
                    color="#9aa5b5"
                    style={styles.detailTitleLock}
                  />
                </View>
                <Text style={styles.detailTime}>{formatTaskTime(task.time)}</Text>
                {quantumLabel ? (
                  <Text style={styles.detailSubtaskSummaryLabel}>{quantumLabel}</Text>
                ) : totalSubtasks > 0 ? (
                    <Text style={styles.detailSubtaskSummaryLabel}>
                      {completedSubtasks}/{totalSubtasks} subtasks completed
                    </Text>
                  ) : null}
                </View>
              </View>
              <Pressable
                onPress={() => {
                  onToggleCompletion?.(task.id);
                }}
                style={[styles.detailToggle, task.completed && styles.detailToggleCompleted]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.completed }}
                accessibilityLabel={
                  task.completed ? 'Mark task as incomplete' : 'Mark task as complete'
                }
              >
                {task.completed && <Ionicons name="checkmark" size={18} color="#fff" />}
              </Pressable>
            </View>
            <ScrollView style={styles.detailSubtasksContainer}>
              {totalSubtasks === 0 ? (
                <Text style={styles.detailEmptySubtasks}>No subtasks added yet.</Text>
              ) : (
                task.subtasks.map((subtask) => (
                  <Pressable
                    key={subtask.id}
                    style={styles.detailSubtaskRow}
                    onPress={() => onToggleSubtask?.(task.id, subtask.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: getSubtaskCompletionStatus(subtask, dateKey) }}
                    accessibilityLabel={
                      getSubtaskCompletionStatus(subtask, dateKey)
                        ? `Mark ${subtask.title} as incomplete`
                        : `Mark ${subtask.title} as complete`
                    }
                  >
                    <View
                      style={[
                        styles.detailSubtaskIndicator,
                        getSubtaskCompletionStatus(subtask, dateKey) &&
                          styles.detailSubtaskIndicatorCompleted,
                      ]}
                    >
                      {getSubtaskCompletionStatus(subtask, dateKey) && (
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.detailSubtaskText,
                        getSubtaskCompletionStatus(subtask, dateKey) &&
                          styles.detailSubtaskTextCompleted,
                      ]}
                    >
                      {subtask.title}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable
              style={styles.detailEditLink}
              onPress={() => onEdit?.(task.id)}
              accessibilityRole="button"
              accessibilityLabel="Edit task"
            >
              <View style={styles.detailEditContent}>
                <Ionicons name="create-outline" size={18} color="#3c2ba7" />
                <Text style={styles.detailEditButtonText}>Edit Task</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QuantumAdjustModal({
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
    },
    [onChangeCount]
  );
  const handlePresetSelect = useCallback(
    (value) => {
      if (!value) {
        return;
      }
      onChangeCount(String(value));
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

const WHEEL_ITEM_HEIGHT = 34;
const WHEEL_VISIBLE_ITEMS = 3;

const TIMER_HOUR_OPTIONS = Array.from({ length: 100 }, (_, index) =>
  String(index).padStart(2, '0')
);
const TIMER_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, '0')
);

function normalizeTimerValue(value, options) {
  const sanitized = value?.replace(/\D/g, '') ?? '';
  if (!sanitized) {
    return options[0];
  }
  const normalized = Number.parseInt(sanitized, 10);
  if (Number.isNaN(normalized)) {
    return options[0];
  }
  const clamped = Math.min(Math.max(normalized, 0), options.length - 1);
  return options[clamped];
}

function WheelPicker({ values, value, onChange, accessibilityLabel, itemHeight = WHEEL_ITEM_HEIGHT }) {
  const scrollRef = useRef(null);
  const isMomentumScrolling = useRef(false);
  const isDragging = useRef(false);
  const valueIndex = Math.max(0, values.indexOf(value));

  useEffect(() => {
    if (!scrollRef.current || isMomentumScrolling.current || isDragging.current) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: valueIndex * itemHeight, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [valueIndex, itemHeight]);

  const finalizeSelection = useCallback(
    (offsetY) => {
      const maxOffset = Math.max(0, (values.length - 1) * itemHeight);
      const clampedOffset = Math.min(Math.max(offsetY, 0), maxOffset);
      const index = Math.round(clampedOffset / itemHeight);
      const clampedIndex = Math.min(Math.max(index, 0), values.length - 1);
      const nextValue = values[clampedIndex];

      if (nextValue && clampedIndex !== valueIndex) {
        onChange(nextValue);
        if (HAPTICS_SUPPORTED && typeof Haptics.selectionAsync === 'function') {
          try {
            Haptics.selectionAsync();
          } catch {
            // Ignore missing haptics support on web
          }
        }
      }
    },
    [itemHeight, onChange, valueIndex, values]
  );

  const handleMomentumBegin = useCallback(() => {
    isMomentumScrolling.current = true;
  }, []);

  const handleMomentumEnd = useCallback(
    (event) => {
      isMomentumScrolling.current = false;
      finalizeSelection(event.nativeEvent.contentOffset.y ?? 0);
    },
    [finalizeSelection]
  );

  const handleScrollBeginDrag = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleScrollEndDrag = useCallback(
    (event) => {
      isDragging.current = false;
      if (!isMomentumScrolling.current) {
        finalizeSelection(event.nativeEvent.contentOffset.y ?? 0);
      }
    },
    [finalizeSelection]
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.timerWheelColumn}
      contentContainerStyle={[styles.timerWheelColumnContent, { paddingVertical: itemHeight }]}
      showsVerticalScrollIndicator={false}
      snapToInterval={itemHeight}
      decelerationRate={Platform.select({ ios: 'fast', android: 0.998 })}
      overScrollMode="never"
      bounces
      scrollEventThrottle={16}
      nestedScrollEnabled
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onMomentumScrollBegin={handleMomentumBegin}
      onMomentumScrollEnd={handleMomentumEnd}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      accessibilityLabel={accessibilityLabel}
    >
      {values.map((item, index) => {
        const isActive = index === valueIndex;
        return (
          <View key={`${item}-${index}`} style={[styles.timerWheelItem, { height: itemHeight }]}>
            <Text style={[styles.timerWheelItemText, isActive && styles.timerWheelItemTextActive]}>
              {item}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function App() {
  useEffect(() => {
    const lockOrientation = async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      } catch {
        // Orientation lock best effort only
      }
    };

    void lockOrientation();
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
    });
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScheduleApp />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6fb',
    position: 'relative',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f6fb',
  },
  appFrame: {
    flex: 1,
    backgroundColor: '#f6f6fb',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 10,
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 2,
    opacity: 0.9,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    color: '#4b4b63',
  },
  todayContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  todayHeader: {
    marginBottom: 24,
  },
  todayTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  todaySubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  todaySubtitleSuccess: {
    color: '#2f9e44',
  },
  todaySubtitleInProgress: {
    color: '#6f7a86',
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  tagFilterContainer: {
    marginBottom: 16,
  },
  tagFilterScroll: {
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#edefff',
  },
  tagPillSelected: {
    backgroundColor: '#3c2ba7',
  },
  tagPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3c2ba7',
  },
  tagPillTextSelected: {
    color: '#ffffff',
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#9ba0b0',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dayLabelSelected: {
    color: '#3c2ba7',
  },
  dayNumber: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e7f6e6',
    position: 'relative',
  },
  dayNumberSelected: {
    backgroundColor: '#f0faee',
  },
  dayNumberCompleted: {
    backgroundColor: '#3dd598',
  },
  dayNumberText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  dayNumberTextSelected: {
    color: '#2f2a6f',
  },
  dayNumberTextCompleted: {
    color: '#ffffff',
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 6,
    width: '54%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#3c2ba7',
  },
  todayIndicatorOnCompleted: {
    backgroundColor: '#ffffff',
  },
  tasksSection: {
    marginTop: 8,
  },
  tasksList: {
    paddingBottom: 4,
  },
  emptyState: {
    fontSize: 15,
    color: '#6f7a86',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  emptyStateIllustration: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e7e9f8',
    borderWidth: 1,
    borderColor: '#d7dbeb',
  },
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
  swipeableWrapper: {
    marginBottom: 14,
    position: 'relative',
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  swipeableActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 168,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f6f6fb',
    borderRadius: 18,
    zIndex: -1,
  },
  swipeActionButton: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#eef1ff',
  },
  swipeActionCopy: {
    backgroundColor: '#eef1ff',
  },
  swipeActionDelete: {
    backgroundColor: '#ff6b6b',
  },
  swipeActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a2e',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  swipeActionTextDelete: {
    color: '#ffffff',
  },
  swipeActionButtonDisabled: {
    opacity: 0.55,
  },
  swipeActionTextDisabled: {
    color: '#ffffff',
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
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 11, 30, 0.45)',
    justifyContent: 'flex-end',
  },
  detailBackdrop: {
    flex: 1,
  },
  detailCardContainer: {
    padding: 20,
  },
  detailCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailEmoji: {
    fontSize: 36,
  },
  detailEmojiImage: {
    width: 53,
    height: 53,
    borderRadius: 26.5,
    resizeMode: 'cover',
  },
  detailTitleContainer: {
    marginLeft: 12,
    flex: 1,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  detailTitleLock: {
    opacity: 0.7,
  },
  detailTime: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#4b4b63',
  },
  detailSubtaskSummaryLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#3c2ba7',
    fontWeight: '600',
  },
  detailToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#c5cadb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  detailToggleCompleted: {
    backgroundColor: '#3dd598',
    borderColor: '#3dd598',
  },
  detailSubtasksContainer: {
    maxHeight: 260,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  detailEmptySubtasks: {
    fontSize: 14,
    color: '#6f7a86',
  },
  quantumModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  quantumModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  quantumModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  quantumModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quantumModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2742',
  },
  quantumModalSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#7F8A9A',
  },
  quantumModalRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  quantumModalPresetRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  quantumModalPresetButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FB',
    borderWidth: 1,
    borderColor: '#D5DBE8',
  },
  quantumModalPresetButtonSelected: {
    backgroundColor: '#1F2742',
    borderColor: '#1F2742',
  },
  quantumModalPresetText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2742',
  },
  quantumModalPresetTextSelected: {
    color: '#FFFFFF',
  },
  quantumModalField: {
    flex: 1,
    gap: 6,
  },
  quantumModalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F8A9A',
  },
  quantumModalInput: {
    backgroundColor: '#F4F6FB',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2742',
  },
  quantumModalAmount: {
    marginTop: 16,
  },
  quantumModalAmountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F8A9A',
    marginBottom: 8,
  },
  quantumModalAmountInput: {
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D5DBE8',
    backgroundColor: '#F8FAFF',
    overflow: 'hidden',
  },
  timerWheelArea: {
    position: 'relative',
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS,
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  timerWheelHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_ITEM_HEIGHT - 4,
    height: WHEEL_ITEM_HEIGHT + 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(31,39,66,0.16)',
    backgroundColor: '#FFFFFF',
    shadowColor: '#1F2742',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  timerWheelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 6,
  },
  timerWheelDivider: {
    alignSelf: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2742',
  },
  timerWheelColumn: {
    width: '100%',
  },
  timerWheelColumnWrapper: {
    width: 90,
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS,
    overflow: 'hidden',
  },
  timerWheelColumnContent: {
    paddingVertical: WHEEL_ITEM_HEIGHT,
  },
  timerWheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerWheelItemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#A3AEC1',
  },
  timerWheelItemTextActive: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2742',
  },
  wheelHighlight: {
    position: 'absolute',
    top: WHEEL_ITEM_HEIGHT,
    left: 0,
    right: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#D5DBE8',
  },
  quantumModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  quantumModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D5DBE8',
  },
  quantumModalButtonAdd: {
    backgroundColor: '#1F2742',
    borderColor: '#1F2742',
  },
  quantumModalButtonSubtract: {
    backgroundColor: '#F4F6FB',
  },
  quantumModalButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2742',
  },
  quantumModalButtonTextLight: {
    color: '#FFFFFF',
  },
  quantumModalButtonDisabled: {
    opacity: 0.5,
  },
  detailSubtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#d9dcea',
  },
  detailSubtaskIndicator: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#c5cadb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: '#ffffff',
  },
  detailSubtaskIndicatorCompleted: {
    backgroundColor: '#3dd598',
    borderColor: '#3dd598',
  },
  detailSubtaskText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a2e',
  },
  detailSubtaskTextCompleted: {
    color: '#6f7a86',
    textDecorationLine: 'line-through',
  },
  detailEditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    alignSelf: 'center',
  },
  detailEditContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailEditButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3c2ba7',
  },
  calendarListContent: {
    paddingBottom: 60,
    gap: 12,
  },
  calendarMonthContainer: {
    marginBottom: 20,
    marginHorizontal: 0,
  },
  calendarMonthHeader: {
    height: 100,
    justifyContent: 'flex-end',
    padding: 20,
    marginBottom: 10,
    marginHorizontal: 0,
    borderRadius: 0,
    overflow: 'hidden',
  },
  calendarMonthTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textTransform: 'capitalize',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 8,
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  calendarDayCellWrapper: {
    width: CALENDAR_DAY_SIZE,
    height: CALENDAR_DAY_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  calendarSuccessCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#a2e76f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Adicione estes estilos para o dia atual:
  calendarTodayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3c2ba7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarTodayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  bottomBarContainer: {
    width: '100%',
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
    borderTopWidth: 0,
  },
  bottomBarDimmed: {
    opacity: 0.4,
  },
  tabGroup: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  tabLabel: {
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  activeColor: {
    color: '#1a1a2e',
  },
  inactiveColor: {
    color: '#6f7a86',
  },
  addButton: {
    position: 'absolute',
    top: -32,
    alignSelf: 'center',
    backgroundColor: '#3c2ba7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 12,
    zIndex: 12,
    overflow: 'visible',
  },
  addButtonActive: {
    backgroundColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
    gap: 8,
  },
  placeholderIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f0efff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  placeholderDescription: {
    textAlign: 'center',
    marginTop: 2,
  },
  addButtonBase: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
    zIndex: -1,
  },
  addButtonHalo: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    zIndex: -2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 10,
    overflow: 'hidden',
  },
  fabActionsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  fabActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  fabCard: {
    overflow: 'visible',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 14,
  },
  fabCardBackground: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  fabCardContent: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  fabCardTitle: {
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  fabCardSubtitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    paddingHorizontal: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  fabCardIcon: {
    alignSelf: 'center',
  },
  stickyHeader: {
    width: '100%',
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    overflow: 'hidden',
  },
  stickyHeaderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  // --- ESTILOS DO RELATÓRIO ---
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  reportSheet: {
    backgroundColor: '#F6F6FB',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    width: '100%',
  },
  reportHeaderImage: {
    height: 180,
    backgroundColor: '#1a1a1a',
    padding: 24,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  reportCloseButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
  },
  reportDateContainer: {
    marginBottom: 10,
  },
  reportDateBig: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  reportYear: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  reportScrollContent: {
    padding: 24,
    paddingBottom: 50,
  },
  reportSummaryText: {
    fontSize: 16,
    color: '#4b4b63',
    lineHeight: 24,
    marginBottom: 24,
  },
  reportSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },
  gaugeContainer: {
    alignItems: 'center',
    marginBottom: 20,
    justifyContent: 'center',
    minHeight: 150,
  },
  gaugePercentage: {
    fontSize: 42,
    fontWeight: '800',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  gaugeLabel: {
    fontSize: 12,
    color: '#6f7a86',
    marginTop: 0,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8F9FE',
    borderRadius: 16,
    padding: 16,
  },
  statLabel: {
    fontSize: 13,
    color: '#6f7a86',
    fontWeight: '600',
    marginBottom: 8,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  reportTaskList: {
    gap: 12,
  },
  reportTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 16,
    gap: 12,
  },
  reportTaskIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportTaskIconImage: {
    width: 38,
    height: 38,
    borderRadius: 14,
    resizeMode: 'cover',
  },
  reportTaskTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },

  // --- STYLES FOR PROFILE & CUSTOMIZE CALENDAR ---
  profileContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  profileStatsSection: {
    alignSelf: 'stretch',
    marginBottom: 28,
  },
  profileStatsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  profileStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  profileStatCard: {
    width: '48%',
    borderRadius: 20,
    backgroundColor: '#f1f1f5',
    padding: 12,
    marginBottom: 10,
  },
  profileStatLabel: {
    fontSize: 11,
    color: '#6f7a86',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  profileStatValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  profileStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  profileStatUnit: {
    fontSize: 12,
    color: '#6f7a86',
    fontWeight: '600',
  },
  customizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3c2ba7',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    shadowColor: '#3c2ba7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  customizeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  profileTasksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#3c2ba7',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 26,
    shadowColor: '#3c2ba7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  profileTasksButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  profileTasksContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  profileTasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  profileTasksTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  profileTasksSubtitle: {
    fontSize: 13,
    color: '#6f7a86',
    marginTop: 4,
  },
  profileTasksList: {
    paddingBottom: 96,
  },
  profileTasksEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  profileTasksEmptyText: {
    fontSize: 14,
    color: '#6f7a86',
    textAlign: 'center',
  },
  profileTasksFilters: {
    gap: 12,
    marginBottom: 16,
  },
  profileTasksSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f4f6fb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileTasksSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a2e',
  },
  profileTasksFilterRow: {
    gap: 8,
  },
  profileTasksFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#edefff',
  },
  profileTasksFilterPillActive: {
    backgroundColor: '#3c2ba7',
  },
  profileTasksFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3c2ba7',
  },
  profileTasksFilterTextActive: {
    color: '#ffffff',
  },
  profileTasksBulkBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  profileTasksBulkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  profileTasksBulkDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#ff6b6b',
  },
  profileTasksBulkDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  profileSwipeWrapper: {
    marginBottom: 12,
  },
  profileSwipeActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#f5f5fb',
  },
  profileSwipeDelete: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff6b6b',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 4,
  },
  profileSwipeDeleteDisabled: {
    opacity: 0.55,
  },
  profileSwipeDeleteText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  profileTaskCard: {
    borderWidth: 1,
    borderRadius: 18,
  },
  profileTaskCardSelected: {
    borderColor: '#3c2ba7',
    shadowColor: '#3c2ba7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  profileTaskCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  profileTaskIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  profileTaskEmoji: {
    fontSize: 26,
  },
  profileTaskEmojiImage: {
    width: 40,
    height: 40,
    borderRadius: 14,
    resizeMode: 'cover',
  },
  profileTaskDetails: {
    flex: 1,
    marginLeft: 12,
  },
  profileTaskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileTaskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a2e',
    flexShrink: 1,
  },
  profileTaskLockIcon: {
    marginLeft: 6,
  },
  profileTaskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  profileTaskTime: {
    fontSize: 12,
    color: '#6f7a86',
    fontWeight: '500',
  },
  profileTaskTag: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7dbeb',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  profileTaskTagText: {
    fontSize: 11,
    color: '#3c2ba7',
    fontWeight: '600',
  },
  profileDetailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 12, 30, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  profileDetailBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  profileDetailCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 8,
  },
  profileDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileDetailHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileDetailEmoji: {
    fontSize: 34,
  },
  profileDetailEmojiImage: {
    width: 46,
    height: 46,
    borderRadius: 16,
    resizeMode: 'cover',
  },
  profileDetailTitleBlock: {
    marginLeft: 12,
    flex: 1,
  },
  profileDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  profileDetailTime: {
    marginTop: 4,
    fontSize: 13,
    color: '#6f7a86',
  },
  profileDetailBody: {
    gap: 12,
  },
  profileDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileDetailLabel: {
    fontSize: 13,
    color: '#6f7a86',
    fontWeight: '600',
  },
  profileDetailValue: {
    fontSize: 13,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  profileDetailLockButton: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3c2ba7',
    gap: 8,
  },
  profileDetailLockButtonActive: {
    backgroundColor: '#3c2ba7',
  },
  profileDetailLockButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3c2ba7',
  },
  profileDetailLockButtonTextActive: {
    color: '#ffffff',
  },
  
  // Customize Modal Styles
  customizeModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  customizeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  customizeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  customizeScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  customizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  customizeCard: {
    flex: 1,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  customizeCardText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    zIndex: 1,
  },
  customizeAddButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#3c2ba7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    backgroundColor: '#fff',
  },
});
