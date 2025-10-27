import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Platform,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as NavigationBar from 'expo-navigation-bar';
import * as Haptics from 'expo-haptics';
import AddHabitSheet from './components/AddHabitSheet';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');

const TABS = [
  {
    key: 'today',
    label: 'Today',
    icon: 'time-outline',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    icon: 'calendar-clear-outline',
  },
];

const getDateKey = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const hexToRgb = (hex) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
};

const lightenColor = (hex, amount = 0.7) => {
  try {
    const { r, g, b } = hexToRgb(hex);
    const mixChannel = (channel) => Math.round(channel + (255 - channel) * amount);
    const mixed = [mixChannel(r), mixChannel(g), mixChannel(b)];
    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  } catch (error) {
    return '#f2f3f8';
  }
};

const formatNumber = (value) => value.toString().padStart(2, '0');

const formatTimeValue = ({ hour, minute, meridiem }) =>
  `${formatNumber(hour)}:${formatNumber(minute)} ${meridiem}`;

const toMinutes = ({ hour, minute, meridiem }) => {
  const normalizedHour = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
  return normalizedHour * 60 + minute;
};

const formatTaskTime = (time) => {
  if (!time || !time.specified) {
    return 'Anytime';
  }

  if (time.mode === 'period' && time.period) {
    const { start, end } = time.period;
    return `${formatTimeValue(start)} - ${formatTimeValue(end)}`;
  }

  if (time.point) {
    return formatTimeValue(time.point);
  }

  return 'Anytime';
};

function ScheduleApp() {
  const [activeTab, setActiveTab] = useState('today');
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabMenuMounted, setIsFabMenuMounted] = useState(false);
  const [isCreateHabitOpen, setIsCreateHabitOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [tasks, setTasks] = useState([]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;
  const fabSize = isCompact ? 52 : 60;
  const horizontalPadding = useMemo(() => Math.max(16, Math.min(32, width * 0.06)), [width]);
  const bottomBarPadding = useMemo(() => Math.max(20, horizontalPadding), [horizontalPadding]);
  const iconSize = isCompact ? 22 : 24;
  const cardSize = isCompact ? 136 : 152;
  const cardIconSize = Math.round(cardSize * 0.75);
  const cardSpacing = isCompact ? 16 : 24;
  const cardBorderRadius = isCompact ? 30 : 34;
  const cardVerticalOffset = isCompact ? 124 : 140;
  const fabHaloSize = fabSize + (isCompact ? 26 : 30);
  const fabBaseSize = fabSize + (isCompact ? 14 : 18);
  const fabIconSize = isCompact ? 28 : 30;
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
  const weekDays = useMemo(() => {
    const base = new Date(today);
    return Array.from({ length: 7 }, (_, index) => {
      const offset = index - 3;
      const date = new Date(base);
      date.setDate(base.getDate() + offset);
      const key = getDateKey(date);
      const dayTasks = tasks.filter((task) => task.dateKey === key);
      const allCompleted = dayTasks.length > 0 && dayTasks.every((task) => task.completed);
      return {
        date,
        key,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        dayNumber: date.getDate(),
        allCompleted,
      };
    });
  }, [tasks, today]);
  const tasksForSelectedDate = useMemo(() => {
    const filtered = tasks.filter((task) => task.dateKey === selectedDateKey);
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
  }, [selectedDateKey, tasks]);
  const allTasksCompletedForSelectedDay =
    tasksForSelectedDate.length > 0 && tasksForSelectedDate.every((task) => task.completed);
  const completedTaskCount = useMemo(
    () => tasksForSelectedDate.filter((task) => task.completed).length,
    [tasksForSelectedDate]
  );
  const lastToggleRef = useRef(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const actionsScale = useRef(new Animated.Value(0.85)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const applyNavigationBarTheme = () => {
      void NavigationBar.setBackgroundColorAsync('#000000');
      void NavigationBar.setButtonStyleAsync('light');
    };

    applyNavigationBarTheme();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        applyNavigationBarTheme();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const dynamicStyles = useMemo(
    () => ({
      content: {
        paddingHorizontal: horizontalPadding,
        paddingTop: isCompact ? 32 : 48,
      },
      description: {
        fontSize: isCompact ? 15 : 16,
        lineHeight: isCompact ? 20 : 22,
      },
      bottomBarContainer: {
        paddingHorizontal: Math.max(12, horizontalPadding / 2),
        // Quanto menor, mais a barra desce/encosta no fundo:
        paddingBottom: insets.bottom,
      },
      bottomBar: {
        paddingHorizontal: bottomBarPadding,
        paddingVertical: isCompact ? 6 : 8,
      },
      tabLabel: {
        fontSize: isCompact ? 11 : 12,
        marginTop: isCompact ? 4 : 6,
      },
      addButton: {
        width: fabSize,
        height: fabSize,
        borderRadius: fabSize / 2,
        top: isCompact ? -20 : -24,
      },
    }),
    [bottomBarPadding, fabSize, horizontalPadding, insets.bottom, isCompact]
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeFabMenu();
    setIsCreateHabitOpen(true);
  }, [closeFabMenu]);

  const handleAddReflection = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('Add reflection action triggered');
    closeFabMenu();
  }, [closeFabMenu]);

  const handleCloseCreateHabit = useCallback(() => {
    setIsCreateHabitOpen(false);
  }, []);

  const handleSelectDate = useCallback((date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    setSelectedDate(normalized);
  }, []);

  const handleToggleTaskCompletion = useCallback((taskId) => {
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    );
  }, []);

  const handleCreateHabit = useCallback((habit) => {
    const normalizedDate = new Date(habit?.startDate ?? new Date());
    normalizedDate.setHours(0, 0, 0, 0);
    const dateKey = getDateKey(normalizedDate);
    const color = habit?.color ?? '#d1d7ff';
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: habit?.title ?? 'Untitled task',
      color,
      emoji: habit?.emoji ?? '✅',
      time: habit?.time,
      date: normalizedDate,
      dateKey,
      completed: false,
    };
    setTasks((previous) => [...previous, newTask]);
    setSelectedDate(normalizedDate);
  }, []);

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
          useNativeDriver: true,
        }),
        Animated.spring(actionsScale, {
          toValue: 1,
          damping: 18,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 12,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(actionsScale, {
          toValue: 0.85,
          duration: 150,
          useNativeDriver: true,
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
        onPress={() => setActiveTab(key)}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.container}>
        <View
          style={[styles.content, dynamicStyles.content]}
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

              <View style={styles.tasksSection}>
                {tasksForSelectedDate.length === 0 ? (
                  <Text style={styles.emptyState}>
                    No tasks for this day yet. Use the add button to create one.
                  </Text>
                ) : (
                  tasksForSelectedDate.map((task) => {
                    const backgroundColor = lightenColor(task.color, 0.75);
                    return (
                      <View
                        key={task.id}
                        style={[styles.taskCard, { backgroundColor, borderColor: task.color }]}
                      >
                        <View style={styles.taskInfo}>
                          <Text style={styles.taskEmoji}>{task.emoji}</Text>
                          <View style={styles.taskDetails}>
                            <Text
                              style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
                              numberOfLines={1}
                            >
                              {task.title}
                            </Text>
                            <Text style={styles.taskTime}>{formatTaskTime(task.time)}</Text>
                          </View>
                        </View>
                        <Pressable
                          onPress={() => handleToggleTaskCompletion(task.id)}
                          style={[styles.taskToggle, task.completed && styles.taskToggleCompleted]}
                          accessibilityRole="checkbox"
                          accessibilityLabel={
                            task.completed ? 'Mark task as incomplete' : 'Mark task as complete'
                          }
                          accessibilityState={{ checked: task.completed }}
                        >
                          {task.completed && <Ionicons name="checkmark" size={18} color="#ffffff" />}
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          ) : (
            <>
              <Text style={styles.heading}>Daily Routine</Text>
              <Text style={[styles.description, dynamicStyles.description]}>
                Open the calendar to plan ahead, review upcoming routines, and adjust your schedule.
              </Text>
            </>
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
            {TABS.map(renderTabButton)}
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
            {Platform.OS === 'ios' && (
              <BlurView intensity={60} tint="dark" style={styles.overlayBlur} />
            )}
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
      <AddHabitSheet
        visible={isCreateHabitOpen}
        onClose={handleCloseCreateHabit}
        onCreate={handleCreateHabit}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ScheduleApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6fb',
    position: 'relative',
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
  emptyState: {
    fontSize: 15,
    color: '#6f7a86',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 12,
  },
  taskEmoji: {
    fontSize: 28,
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
  bottomBarContainer: {
    width: '100%',
    alignItems: 'stretch',
    backgroundColor: 'transparent',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingVertical: 12,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  bottomBarDimmed: {
    opacity: 0.4,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabel: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  activeColor: {
    color: '#3c2ba7',
  },
  inactiveColor: {
    color: '#9ba0b0',
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
    backgroundColor: 'rgba(26, 26, 46, 0.28)',
    zIndex: 10,
    overflow: 'hidden',
  },
  overlayBlur: {
    ...StyleSheet.absoluteFillObject,
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
  },
  fabCardSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  fabCardIcon: {
    alignSelf: 'center',
  },
});
