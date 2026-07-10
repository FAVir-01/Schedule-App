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
import Svg, { Circle } from 'react-native-svg';
import { format } from 'date-fns';
import { getMonthImageSource } from '../constants/months';
import { translations } from '../constants/i18n';
import { getDateKey } from '../utils/dateUtils';
import { lightenColor } from '../utils/colorUtils';
import {
  getQuantumProgressLabel,
  shouldCountTaskTowardsCompletion,
} from '../utils/taskUtils';
import { FALLBACK_EMOJI } from '../constants/app';
import { styles } from '../styles/appStyles';

function DayReportModal({ visible, date, tasks, onClose, customImages, language = 'en' }) {
  const { height } = useWindowDimensions();

  // 1. Configuração da Animação
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [displayRate, setDisplayRate] = useState(0);

  // 2. Lógica para pegar o GIF do mês correto
  // Se 'date' for nulo, não quebra o app
  const imageSource = date ? getMonthImageSource(date.getMonth(), customImages) : null;

  const scoredTasks = tasks.filter(shouldCountTaskTowardsCompletion);
  const totalTasks = scoredTasks.length;
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

  // Configurações do Círculo
  const radius = 60; // Raio do círculo
  const strokeWidth = 14; // Espessura da barra
  const circleSize = radius * 2 + strokeWidth;
  const circumference = 2 * Math.PI * radius;
  // Calcula o offset do traço baseado na porcentagem (inverso porque strokeDashoffset esconde o traço)
  const strokeDashoffset = circumference - (displayRate / 100) * circumference;

  if (!visible || !date) return null;

  const getSummaryText = () => {
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

            <Text style={styles.reportSectionTitle}>{t.report.dailyStats}</Text>

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
                    <Text style={styles.gaugeLabel}>{t.report.successRate}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t.report.committed}</Text>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statNumber}>{totalTasks}</Text>
                    <Text style={{ fontSize: 20 }}>✍️</Text>
                  </View>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t.report.completed}</Text>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statNumber}>{completedTasks}</Text>
                    <Ionicons name="checkbox" size={24} color="#3dd598" />
                  </View>
                </View>
              </View>
            </View>

            {totalTasks > 0 && (
              <>
                <Text style={styles.reportSectionTitle}>{t.report.habits}</Text>
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
