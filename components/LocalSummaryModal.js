import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDateLocale, translations } from '../constants/i18n';
import { buildLocalPeriodSummary } from '../utils/localSummaryUtils';

const replaceValues = (template, values) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    `${template ?? ''}`
  );

const Metric = ({ icon, label, value, delta = null, accessibilityLabel }) => (
  <View
    style={localStyles.metricCard}
    accessible={accessibilityLabel ? true : undefined}
    accessibilityLabel={accessibilityLabel}
  >
    <Ionicons name={icon} size={17} color="#665bc2" />
    <Text style={localStyles.metricValue}>{value}</Text>
    <Text style={localStyles.metricLabel}>{label}</Text>
    {delta ? (
      <Text
        style={[
          localStyles.metricDelta,
          delta.tone === 'up' && localStyles.metricDeltaUp,
          delta.tone === 'down' && localStyles.metricDeltaDown,
        ]}
      >
        {delta.text}
      </Text>
    ) : null}
  </View>
);

export default function LocalSummaryModal({
  visible,
  tasks,
  dayMoods,
  referenceDate = new Date(),
  language = 'en',
  onClose,
}) {
  const [period, setPeriod] = useState('weekly');
  const translation = translations[language] ?? translations.en;
  const labels = translation.localSummary;
  const locale = getDateLocale(language);
  const summary = useMemo(
    () => visible
      ? buildLocalPeriodSummary({ tasks, dayMoods, period, referenceDate })
      : null,
    [dayMoods, period, referenceDate, tasks, visible]
  );

  if (!visible) {
    return null;
  }

  const { current, previous } = summary;
  const roundedRate = current.rate == null ? null : Math.round(current.rate);
  const roundedDelta = summary.rateDelta == null ? null : Math.round(summary.rateDelta);
  const completionText = current.planned > 0
    ? replaceValues(labels.completedOfPlanned, {
        completed: current.completed,
        planned: current.planned,
      })
    : labels.noPlanned;
  const comparisonText = roundedDelta == null
    ? labels.comparisonUnavailable
    : roundedDelta === 0
      ? labels.sameRate
      : replaceValues(roundedDelta > 0 ? labels.aheadRate : labels.behindRate, {
          value: Math.abs(roundedDelta),
        });
  const moodValue = current.averageMood == null
    ? labels.noMoodAverage
    : `${Math.round(current.averageMood * 10) / 10}/5`;
  // Em pontos da escala de 1 a 5, do jeito que a propria nota e mostrada logo
  // acima. A comparacao so existe quando os dois periodos tem humor registrado.
  const roundedMoodDelta = summary.moodDelta == null
    ? null
    : Math.round(summary.moodDelta * 10) / 10;
  const moodDelta = roundedMoodDelta == null
    ? null
    : roundedMoodDelta === 0
      ? { tone: 'flat', text: labels.moodSteady, spoken: labels.moodSteady }
      : {
          tone: roundedMoodDelta > 0 ? 'up' : 'down',
          text: `${roundedMoodDelta > 0 ? '▲' : '▼'} ${Math.abs(roundedMoodDelta)}`,
          // As setas viram ruido no leitor de tela ("triangulo apontando para
          // cima"), entao a versao falada usa sinal.
          spoken: `${roundedMoodDelta > 0 ? '+' : '-'}${Math.abs(roundedMoodDelta)}`,
        };
  const moodAccessibilityLabel = moodDelta
    ? `${labels.averageMood}. ${moodValue}. ${moodDelta.spoken} ${labels.moodVsPrevious}`
    : `${labels.averageMood}. ${moodValue}`;
  const previousText = replaceValues(labels.previousProgress, {
    completed: previous.completed,
    planned: previous.planned,
  });
  const periodRange = `${format(current.startDate, 'd MMM', { locale })} – ${format(
    current.endDate,
    'd MMM',
    { locale }
  )}`;
  const bestDayTitle = current.bestDay
    ? format(current.bestDay.date, 'EEEE, d MMM', { locale })
    : labels.noBestDay;
  const bestDayDetail = current.bestDay
    ? `${Math.round(current.bestDay.rate)}% · ${current.bestDay.completed}/${current.bestDay.planned}`
    : null;
  const mostCompletedDetail = current.mostCompletedTask
    ? current.mostCompletedTask.completed === 1
      ? labels.completedOnce
      : replaceValues(labels.completedMany, {
          count: current.mostCompletedTask.completed,
        })
    : labels.noMostCompleted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={localStyles.safeArea}>
        <View style={localStyles.header}>
          <View style={localStyles.headerText}>
            <Text style={localStyles.eyebrow}>{labels.eyebrow}</Text>
            <Text style={localStyles.title}>{labels.title}</Text>
          </View>
          <Pressable
            style={localStyles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={labels.close}
          >
            <Ionicons name="close" size={22} color="#222538" />
          </Pressable>
        </View>
        <Text style={localStyles.description}>{labels.description}</Text>

        <View style={localStyles.periodSelector}>
          {['weekly', 'monthly'].map((option) => {
            const selected = period === option;
            return (
              <Pressable
                key={option}
                style={[
                  localStyles.periodButton,
                  selected && localStyles.periodButtonSelected,
                ]}
                onPress={() => setPeriod(option)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    localStyles.periodButtonText,
                    selected && localStyles.periodButtonTextSelected,
                  ]}
                >
                  {option === 'weekly' ? labels.weekly : labels.monthly}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={localStyles.scroll}
          contentContainerStyle={localStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={localStyles.heroCard}
            accessible
            accessibilityLabel={`${labels.completionRate}. ${roundedRate ?? 0}%. ${completionText}`}
          >
            <View style={localStyles.heroTopRow}>
              <Text style={localStyles.sectionEyebrow}>{labels.completionRate}</Text>
              <Text style={localStyles.rangeText}>{periodRange}</Text>
            </View>
            <Text style={localStyles.heroRate}>{roundedRate == null ? '—' : `${roundedRate}%`}</Text>
            <Text style={localStyles.heroDetail}>{completionText}</Text>
            <View style={localStyles.rateTrack}>
              <View
                style={[
                  localStyles.rateFill,
                  { width: `${Math.max(0, Math.min(100, roundedRate ?? 0))}%` },
                ]}
              />
            </View>
          </View>

          <View style={localStyles.comparisonCard}>
            <View style={localStyles.comparisonIcon}>
              <Ionicons
                name={roundedDelta != null && roundedDelta > 0 ? 'trending-up' : 'git-compare-outline'}
                size={20}
                color={roundedDelta != null && roundedDelta > 0 ? '#2f9e44' : '#665bc2'}
              />
            </View>
            <View style={localStyles.comparisonBody}>
              <Text style={localStyles.cardTitle}>{labels.comparisonTitle}</Text>
              <Text style={localStyles.cardDescription}>{comparisonText}</Text>
              {previous.planned > 0 ? (
                <Text style={localStyles.cardMeta}>{previousText}</Text>
              ) : null}
            </View>
          </View>

          <View style={localStyles.twoColumnRow}>
            <View style={localStyles.highlightCard}>
              <Ionicons name="sunny-outline" size={21} color="#f08c00" />
              <Text style={localStyles.highlightLabel}>{labels.bestDay}</Text>
              <Text style={localStyles.highlightValue}>{bestDayTitle}</Text>
              {bestDayDetail ? (
                <Text style={localStyles.highlightMeta}>{bestDayDetail}</Text>
              ) : null}
            </View>
            <View style={localStyles.highlightCard}>
              <Ionicons name="checkmark-done-outline" size={21} color="#2f9e44" />
              <Text style={localStyles.highlightLabel}>{labels.mostCompleted}</Text>
              <Text style={localStyles.highlightValue} numberOfLines={2}>
                {current.mostCompletedTask?.title || labels.noMostCompleted}
              </Text>
              {current.mostCompletedTask ? (
                <Text style={localStyles.highlightMeta}>{mostCompletedDetail}</Text>
              ) : null}
            </View>
          </View>

          <Text style={localStyles.sectionTitle}>{labels.reflections}</Text>
          <View style={localStyles.metricsGrid}>
            <Metric icon="book-outline" label={labels.reflections} value={current.reflections} />
            <Metric icon="happy-outline" label={labels.moodEntries} value={current.moods} />
            <Metric
              icon="analytics-outline"
              label={labels.averageMood}
              value={moodValue}
              delta={moodDelta}
              accessibilityLabel={moodAccessibilityLabel}
            />
            <Metric icon="document-text-outline" label={labels.notes} value={current.notes} />
            <Metric icon="image-outline" label={labels.photos} value={current.photos} />
          </View>

          <View style={localStyles.attentionCard}>
            <View style={localStyles.attentionHeader}>
              <Ionicons name="ellipse-outline" size={18} color="#7b6f9e" />
              <Text style={localStyles.cardTitle}>{labels.needsAttention}</Text>
            </View>
            {current.noCompletionTasks.length > 0 ? (
              <>
                <Text style={localStyles.cardDescription}>
                  {labels.needsAttentionDescription}
                </Text>
                <View style={localStyles.taskList}>
                  {current.noCompletionTasks.slice(0, 5).map((task) => (
                    <View key={task.taskId} style={localStyles.taskRow}>
                      <Text style={localStyles.taskTitle} numberOfLines={1}>
                        {task.title}
                      </Text>
                      <Text style={localStyles.taskMeta}>
                        {task.scheduled === 1
                          ? labels.scheduledOnce
                          : replaceValues(labels.scheduledMany, { count: task.scheduled })}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={localStyles.cardDescription}>{labels.allHaveProgress}</Text>
            )}
          </View>

          <View style={localStyles.disclosure}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#665bc2" />
            <Text style={localStyles.disclosureText}>{labels.descriptiveNote}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f6fb',
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#7569c4',
  },
  title: {
    marginTop: 4,
    fontSize: 25,
    fontWeight: '800',
    color: '#202236',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e0eb',
  },
  description: {
    marginTop: 8,
    paddingHorizontal: 20,
    fontSize: 13,
    lineHeight: 19,
    color: '#686d80',
  },
  periodSelector: {
    marginTop: 16,
    marginHorizontal: 20,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#e9e7f1',
    flexDirection: 'row',
    gap: 4,
  },
  periodButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonSelected: {
    backgroundColor: '#ffffff',
    shadowColor: '#1d1930',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#74788a',
  },
  periodButtonTextSelected: {
    color: '#3c2ba7',
  },
  scroll: {
    flex: 1,
    marginTop: 14,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    gap: 13,
  },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#30237f',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: '#dcd7ff',
  },
  rangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#c8c2ef',
  },
  heroRate: {
    marginTop: 12,
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
  },
  heroDetail: {
    marginTop: 3,
    fontSize: 12,
    color: '#d8d4ed',
  },
  rateTrack: {
    height: 8,
    marginTop: 15,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  rateFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#8de2a4',
  },
  comparisonCard: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e3e1ec',
    flexDirection: 'row',
    gap: 11,
  },
  comparisonIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#f0eeff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#292c40',
  },
  cardDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#6d7285',
  },
  cardMeta: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '700',
    color: '#8a8e9e',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  highlightCard: {
    flex: 1,
    minHeight: 140,
    borderRadius: 20,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e3e1ec',
  },
  highlightLabel: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: '800',
    color: '#797d90',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  highlightValue: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: '#292c40',
  },
  highlightMeta: {
    marginTop: 4,
    fontSize: 10,
    color: '#85899a',
  },
  sectionTitle: {
    marginTop: 5,
    fontSize: 17,
    fontWeight: '800',
    color: '#25283a',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    width: '31%',
    minHeight: 92,
    borderRadius: 17,
    padding: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e3ed',
  },
  metricValue: {
    marginTop: 7,
    fontSize: 18,
    fontWeight: '800',
    color: '#292c40',
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    color: '#7a7e90',
  },
  metricDelta: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#6b6f80',
  },
  metricDeltaUp: {
    color: '#166b49',
  },
  metricDeltaDown: {
    color: '#b82f3b',
  },
  attentionCard: {
    borderRadius: 20,
    padding: 15,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e3e1ec',
  },
  attentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  taskList: {
    marginTop: 11,
    gap: 7,
  },
  taskRow: {
    minHeight: 40,
    borderRadius: 13,
    paddingHorizontal: 11,
    backgroundColor: '#f6f5fa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  taskTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#3b3e50',
  },
  taskMeta: {
    fontSize: 9,
    fontWeight: '700',
    color: '#898c9c',
  },
  disclosure: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#efedff',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  disclosureText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#5f5981',
  },
});
