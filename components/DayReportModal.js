import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function DayReportModal({ visible, date, tasks, onClose, styles, monthImages }) {
  const { height } = useWindowDimensions();

  const progressAnim = useRef(new Animated.Value(0)).current;
  const [displayRate, setDisplayRate] = useState(0);

  const imageSource = date ? monthImages[date.getMonth() % monthImages.length] : null;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const targetSuccessRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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

  if (!visible || !date) return null;

  const getSummaryText = () => {
    if (totalTasks === 0) return 'No habits scheduled for this day.';
    if (targetSuccessRate === 100) return 'Incredible! You crushed all your habits!';
    if (targetSuccessRate === 0)
      return `You had ${totalTasks} habit(s) and completed none. Let's see what they were 👀`;
    return `You completed ${completedTasks} out of ${totalTasks} habit(s). Keep going!`;
  };

  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

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
            <View style={styles.headerOverlay} />

            <View style={styles.reportDateContainer}>
              <Text style={styles.reportDateBig}>{format(date, 'd MMM', { locale: ptBR })}</Text>
              <Text style={styles.reportYear}>{format(date, 'yyyy', { locale: ptBR })}</Text>
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
                <View style={styles.gaugeBackground}>
                  <Animated.View style={[styles.gaugeFill, { width: widthInterpolated }]} />
                </View>
                <Text style={styles.gaugePercentage}>{displayRate}%</Text>
                <Text style={styles.gaugeLabel}>Success rate</Text>
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
                    <Text style={{ fontSize: 20 }}>✅</Text>
                  </View>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Completion</Text>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statNumber}>{targetSuccessRate}%</Text>
                    <Text style={{ fontSize: 20 }}>🎯</Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={styles.reportSectionTitle}>Habit breakdown</Text>

            <View style={styles.reportTasksList}>
              {tasks.map((task) => {
                const isCompleted = task.completed;
                const baseColor = task.color || '#3c2ba7';
                const backgroundColor = isCompleted ? `${baseColor}22` : '#fff';
                const borderColor = isCompleted ? `${baseColor}55` : '#eee';

                return (
                  <View key={task.id} style={[styles.reportTaskCard, { backgroundColor, borderColor }]}>
                    <View style={styles.reportTaskHeader}>
                      <Text style={styles.reportTaskEmoji}>{task.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportTaskTitle}>{task.title}</Text>
                        {Array.isArray(task.subtasks) && task.subtasks.length > 0 && (
                          <Text style={styles.reportTaskSubtaskLabel}>
                            {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length} subtasks
                          </Text>
                        )}
                      </View>
                      <View
                        style={[
                          styles.reportStatusChip,
                          {
                            backgroundColor: isCompleted ? `${baseColor}22` : '#f2f3f7',
                            borderColor: isCompleted ? `${baseColor}66` : '#e4e6ed',
                          },
                        ]}
                      >
                        <Text style={[styles.reportStatusChipText, { color: baseColor }]}>
                          {isCompleted ? 'Done' : 'Pending'}
                        </Text>
                      </View>
                    </View>

                    {Array.isArray(task.subtasks) && task.subtasks.length > 0 && (
                      <View style={styles.reportSubtasksList}>
                        {task.subtasks.map((subtask) => {
                          const completed = Boolean(subtask.completed);
                          return (
                            <View key={subtask.id} style={styles.reportSubtaskRow}>
                              <View
                                style={[
                                  styles.reportSubtaskIndicator,
                                  completed && { backgroundColor: baseColor },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.reportSubtaskText,
                                  completed && styles.reportSubtaskTextCompleted,
                                ]}
                              >
                                {subtask.title}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default DayReportModal;
