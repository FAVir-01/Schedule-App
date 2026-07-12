import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  getDateKey,
  normalizeDateValue,
  shouldTaskAppearOnDate,
} from '../utils/dateUtils';
import {
  getTaskCompletionStatus,
  shouldCountTaskTowardsCompletion,
} from '../utils/taskUtils';
import { FALLBACK_EMOJI } from '../constants/app';
import { translations } from '../constants/i18n';
import { styles } from '../styles/appStyles';

const PERIODS = [
  { key: '7D', days: 7 },
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: '1A', days: 365 },
  { key: 'ALL', days: null },
];

const CHART_HEIGHT = 200;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 26;
const Y_AXIS_WIDTH = 34;
const OVERALL_COLOR = '#3c2ba7';
const OVERALL_ID = '__overall__';

// Path suave (Catmull-Rom -> Bézier cúbica).
const buildSmoothPath = (points) => {
  if (points.length < 2) {
    return '';
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

// Taxa de conclusão suavizada: média móvel das últimas 7 ocorrências
// agendadas (dias sem tarefa agendada mantêm o valor anterior).
const smoothPercentSeries = (entries) => {
  const output = [];
  const window = [];
  let last = 0;
  entries.forEach((entry) => {
    if (entry.total > 0) {
      window.push(entry);
      if (window.length > 7) {
        window.shift();
      }
      const completed = window.reduce((sum, item) => sum + item.completed, 0);
      const total = window.reduce((sum, item) => sum + item.total, 0);
      last = total > 0 ? (completed / total) * 100 : last;
    }
    output.push(last);
  });
  return output;
};

// Gráfico de desempenho: série única (geral ou o hábito filtrado via
// selectedTask), modos % / valores / acumulado, scrub com etiqueta de data.
// Formato adapta ao período: barras pra recortes curtos, linha pros longos.
function PerformanceChart({ tasks, language = 'en', selectedTask = null }) {
  const t = translations[language] ?? translations.en;
  const locale = language === 'pt' ? 'pt-BR' : 'en-US';
  const [periodKey, setPeriodKey] = useState('1M');
  const [mode, setMode] = useState('percent');
  const [isModeMenuOpen, setModeMenuOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);
  const chartWidthRef = useRef(0);
  const seriesLengthRef = useRef(0);

  const periodDays = useMemo(() => {
    const period = PERIODS.find((option) => option.key === periodKey) ?? PERIODS[1];
    if (period.days != null) {
      return period.days;
    }
    // ALL: desde a tarefa mais antiga (mínimo 14 dias, máximo 2 anos).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let earliest = today;
    tasks.forEach((task) => {
      const normalized = normalizeDateValue(task.date ?? task.dateKey);
      if (normalized && normalized < earliest) {
        earliest = normalized;
      }
    });
    const diff = Math.ceil((today.getTime() - earliest.getTime()) / 86400000) + 1;
    return Math.max(14, Math.min(730, diff));
  }, [periodKey, tasks]);

  // Dias/semanas discretos leem melhor em barras; tendência longa, em linha.
  const chartType = periodDays <= 31 ? 'bars' : 'line';

  const seriesDescriptors = useMemo(
    () => [
      selectedTask
        ? {
            id: selectedTask.id,
            label: `${selectedTask.emoji || FALLBACK_EMOJI} ${selectedTask.title}`,
            color: OVERALL_COLOR,
            task: selectedTask,
          }
        : { id: OVERALL_ID, label: t.profile.overallSeries, color: OVERALL_COLOR, task: null },
    ],
    [selectedTask, t.profile.overallSeries]
  );

  // Dados diários por série (com 6 dias extras no início pra aquecer a média móvel).
  const chartData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const warmup = 6;
    const totalDays = periodDays + warmup;

    const dates = [];
    for (let i = totalDays - 1; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dates.push(date);
    }

    const rawBySeries = seriesDescriptors.map((descriptor) =>
      dates.map((date) => {
        const dateKey = getDateKey(date);
        if (descriptor.task) {
          const scheduled = shouldTaskAppearOnDate(descriptor.task, date);
          const completed =
            scheduled && getTaskCompletionStatus(descriptor.task, dateKey) ? 1 : 0;
          return { completed, total: scheduled ? 1 : 0 };
        }
        const scored = tasks.filter(
          (task) =>
            shouldTaskAppearOnDate(task, date) && shouldCountTaskTowardsCompletion(task)
        );
        const completed = scored.filter((task) =>
          getTaskCompletionStatus(task, dateKey)
        ).length;
        return { completed, total: scored.length };
      })
    );

    let values;
    if (mode === 'percent') {
      values = rawBySeries.map((entries) => smoothPercentSeries(entries).slice(warmup));
    } else if (mode === 'values') {
      values = rawBySeries.map((entries) =>
        entries.slice(warmup).map((entry) => entry.completed)
      );
    } else {
      values = rawBySeries.map((entries) => {
        let running = 0;
        return entries.slice(warmup).map((entry) => {
          running += entry.completed;
          return running;
        });
      });
    }

    let visibleDates = dates.slice(warmup);

    // Períodos longos: agrega por semana pra manter leve.
    if (visibleDates.length > 120) {
      const aggregatedDates = [];
      const aggregatedValues = values.map(() => []);
      for (let start = 0; start < visibleDates.length; start += 7) {
        const end = Math.min(start + 7, visibleDates.length);
        aggregatedDates.push(visibleDates[end - 1]);
        values.forEach((serie, seriesIndex) => {
          const chunk = serie.slice(start, end);
          let value;
          if (mode === 'values') {
            value = chunk.reduce((sum, item) => sum + item, 0);
          } else if (mode === 'accum') {
            value = chunk[chunk.length - 1];
          } else {
            value = chunk.reduce((sum, item) => sum + item, 0) / chunk.length;
          }
          aggregatedValues[seriesIndex].push(value);
        });
      }
      visibleDates = aggregatedDates;
      values = aggregatedValues;
    }

    const hasData = rawBySeries[0].some((entry) => entry.total > 0);
    return { dates: visibleDates, values, hasData };
  }, [mode, periodDays, seriesDescriptors, tasks]);

  const { dates, values, hasData } = chartData;
  seriesLengthRef.current = dates.length;

  const maxValue = useMemo(() => {
    if (mode === 'percent') {
      return 100;
    }
    return Math.max(1, ...values.flat());
  }, [mode, values]);

  const plotWidth = Math.max(0, chartWidth - Y_AXIS_WIDTH);
  const innerHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const xForIndex = (index) =>
    Y_AXIS_WIDTH + (dates.length > 1 ? (index / (dates.length - 1)) * plotWidth : 0);
  const yForValue = (value) =>
    PADDING_TOP + innerHeight - (value / maxValue) * innerHeight;

  const seriesPoints = useMemo(() => {
    if (!chartWidth || dates.length < 2) {
      return [];
    }
    return values.map((serie) =>
      serie.map((value, index) => ({ x: xForIndex(index), y: yForValue(value) }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartWidth, dates.length, maxValue, values]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => handleScrub(event.nativeEvent.locationX),
      onPanResponderMove: (event) => handleScrub(event.nativeEvent.locationX),
      onPanResponderRelease: () => setActiveIndex(null),
      onPanResponderTerminate: () => setActiveIndex(null),
    })
  ).current;

  const handleScrub = (locationX) => {
    const count = seriesLengthRef.current;
    const width = chartWidthRef.current - Y_AXIS_WIDTH;
    if (width <= 0 || count < 2) {
      return;
    }
    const ratio = (locationX - Y_AXIS_WIDTH) / width;
    const index = Math.round(ratio * (count - 1));
    setActiveIndex(Math.max(0, Math.min(count - 1, index)));
  };

  const focusedIndex = activeIndex ?? dates.length - 1;
  const focusedDate = dates[focusedIndex] ?? null;

  const formatValue = (value) => {
    if (value == null) {
      return '--';
    }
    if (mode === 'percent') {
      return `${Math.round(value)}%`;
    }
    return `${Math.round(value * 10) / 10}`;
  };

  const buildDelta = (serie) => {
    if (!serie || serie.length < 2) {
      return null;
    }
    const raw = serie[focusedIndex] - serie[0];
    const rounded = Math.round(raw * 10) / 10;
    const label =
      mode === 'percent' ? `${Math.round(Math.abs(raw))}%` : `${Math.abs(rounded)}`;
    return { up: raw >= 0, label: `${raw >= 0 ? '▲' : '▼'} ${label}` };
  };

  const overallDelta = buildDelta(values[0]);
  const focusedDateLabel = focusedDate
    ? focusedDate.toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '';

  const yTicks = useMemo(() => {
    const fractions = [0, 1 / 3, 2 / 3, 1];
    return fractions.map((fraction) => ({
      value: maxValue * fraction,
      y: yForValue(maxValue * fraction),
      label:
        mode === 'percent'
          ? `${Math.round(maxValue * fraction)}%`
          : `${Math.round(maxValue * fraction)}`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxValue, mode, chartWidth]);

  const xLabels = useMemo(() => {
    if (dates.length < 2) {
      return [];
    }
    const isLong = periodDays > 120;
    const pick = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
    return pick.map((index) => ({
      index,
      label: dates[index].toLocaleDateString(
        locale,
        isLong ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }
      ),
    }));
  }, [dates, locale, periodDays]);

  // Barras: agrupa a série em até 8 janelas com colunas lado a lado por série.
  const barBuckets = useMemo(() => {
    if (chartType !== 'bars' || dates.length < 2) {
      return [];
    }
    const bucketCount = Math.min(8, dates.length);
    const size = Math.ceil(dates.length / bucketCount);
    const buckets = [];
    for (let start = 0; start < dates.length; start += size) {
      const end = Math.min(start + size, dates.length);
      buckets.push({
        startDate: dates[start],
        endDate: dates[end - 1],
        values: values.map((serie) => {
          const chunk = serie.slice(start, end);
          if (mode === 'values') {
            return chunk.reduce((sum, item) => sum + item, 0);
          }
          if (mode === 'accum') {
            return chunk[chunk.length - 1];
          }
          return chunk.reduce((sum, item) => sum + item, 0) / chunk.length;
        }),
      });
    }
    return buckets;
  }, [chartType, dates, mode, values]);

  const barMaxValue = useMemo(() => {
    if (chartType !== 'bars' || !barBuckets.length) {
      return 1;
    }
    if (mode === 'percent') {
      return 100;
    }
    return Math.max(1, ...barBuckets.flatMap((bucket) => bucket.values));
  }, [barBuckets, chartType, mode]);

  const modeOptions = [
    { key: 'percent', label: t.profile.percentMode },
    { key: 'values', label: t.profile.valuesMode },
    { key: 'accum', label: t.profile.accumMode },
  ];

  const showChart = chartWidth > 0 && dates.length >= 2 && hasData;
  const activePoint = seriesPoints[0]?.[focusedIndex] ?? null;
  const scrubX = activePoint ? activePoint.x : null;

  return (
    <View style={styles.perfCard}>
      {/* Cabeçalho: valor em destaque + variação + contexto */}
      <View style={styles.perfHeaderRow}>
        <View style={styles.perfHeaderInfo}>
          <Text style={styles.perfTitle} numberOfLines={1}>
            {selectedTask ? seriesDescriptors[0].label : t.profile.performance}
          </Text>
          <View style={styles.perfValueRow}>
            <Text style={styles.perfValue}>{formatValue(values[0]?.[focusedIndex])}</Text>
            {overallDelta ? (
              <View
                style={[
                  styles.perfDeltaChip,
                  overallDelta.up ? styles.perfDeltaChipUp : styles.perfDeltaChipDown,
                ]}
              >
                <Text
                  style={[
                    styles.perfDeltaText,
                    overallDelta.up ? styles.perfDeltaTextUp : styles.perfDeltaTextDown,
                  ]}
                >
                  {overallDelta.label}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.perfDateLabel}>{focusedDateLabel}</Text>
        </View>
        <View style={styles.perfControlsRow}>
          <TouchableOpacity
            style={styles.perfMenuButton}
            onPress={() => setModeMenuOpen((previous) => !previous)}
            activeOpacity={0.75}
            hitSlop={6}
          >
            <Ionicons name="ellipsis-horizontal" size={16} color="#6f7a86" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Menu flutuante de modo (%, valores, acumulado), estilo o "..." dos apps de cripto */}
      {isModeMenuOpen ? (
        <>
          <Pressable
            style={styles.perfMenuBackdrop}
            onPress={() => setModeMenuOpen(false)}
          />
          <View style={styles.perfMenuDropdown}>
            {modeOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.perfMenuItem}
                onPress={() => {
                  setMode(option.key);
                  setModeMenuOpen(false);
                }}
                activeOpacity={0.7}
              >
                {mode === option.key ? (
                  <Ionicons name="checkmark" size={16} color="#3c2ba7" />
                ) : (
                  <View style={{ width: 16 }} />
                )}
                <Text
                  style={[
                    styles.perfMenuItemText,
                    mode === option.key && styles.perfMenuItemTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {/* Área de plotagem */}
      <View
        style={styles.perfChartArea}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          chartWidthRef.current = width;
          setChartWidth(width);
        }}
        {...(chartType === 'line' ? panResponder.panHandlers : {})}
      >
        {showChart ? (
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            <Defs>
              <SvgLinearGradient id="perfAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={OVERALL_COLOR} stopOpacity="0.22" />
                <Stop offset="1" stopColor={OVERALL_COLOR} stopOpacity="0.01" />
              </SvgLinearGradient>
            </Defs>

            {yTicks.map((tick) => (
              <React.Fragment key={tick.y}>
                <Line
                  x1={Y_AXIS_WIDTH}
                  x2={chartWidth}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="rgba(26, 26, 46, 0.07)"
                  strokeWidth={1}
                  strokeDasharray="3 6"
                />
                <SvgText
                  x={Y_AXIS_WIDTH - 6}
                  y={tick.y + 3}
                  fontSize={9}
                  fontWeight="600"
                  fill="#9a96b8"
                  textAnchor="end"
                >
                  {tick.label}
                </SvgText>
              </React.Fragment>
            ))}

            {chartType === 'line' ? (
              <>
                {/* Área em gradiente só pra série Geral */}
                {seriesPoints[0] ? (
                  <Path
                    d={`${buildSmoothPath(seriesPoints[0])} L ${
                      seriesPoints[0][seriesPoints[0].length - 1].x
                    } ${CHART_HEIGHT - PADDING_BOTTOM} L ${seriesPoints[0][0].x} ${
                      CHART_HEIGHT - PADDING_BOTTOM
                    } Z`}
                    fill="url(#perfAreaGradient)"
                  />
                ) : null}
                {seriesPoints.map((points, seriesIndex) => (
                  <Path
                    key={seriesDescriptors[seriesIndex].id}
                    d={buildSmoothPath(points)}
                    stroke={seriesDescriptors[seriesIndex].color}
                    strokeWidth={seriesIndex === 0 ? 2.5 : 2}
                    fill="none"
                  />
                ))}
                {activeIndex != null && scrubX != null ? (
                  <>
                    <Line
                      x1={scrubX}
                      x2={scrubX}
                      y1={PADDING_TOP}
                      y2={CHART_HEIGHT - PADDING_BOTTOM}
                      stroke="rgba(26, 26, 46, 0.3)"
                      strokeWidth={1}
                      strokeDasharray="3 4"
                    />
                    {seriesPoints.map((points, seriesIndex) => (
                      <Circle
                        key={`dot-${seriesDescriptors[seriesIndex].id}`}
                        cx={points[focusedIndex]?.x ?? 0}
                        cy={points[focusedIndex]?.y ?? 0}
                        r={4.5}
                        fill={seriesDescriptors[seriesIndex].color}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    ))}
                  </>
                ) : null}
              </>
            ) : (
              barBuckets.map((bucket, bucketIndex) => {
                const bucketWidth = plotWidth / barBuckets.length;
                const groupPadding = bucketWidth * 0.18;
                const barWidth = Math.max(
                  3,
                  (bucketWidth - groupPadding * 2) / bucket.values.length - 2
                );
                return bucket.values.map((value, seriesIndex) => {
                  const height = (value / barMaxValue) * innerHeight;
                  const x =
                    Y_AXIS_WIDTH +
                    bucketIndex * bucketWidth +
                    groupPadding +
                    seriesIndex * (barWidth + 2);
                  return (
                    <Rect
                      key={`${bucketIndex}-${seriesDescriptors[seriesIndex].id}`}
                      x={x}
                      y={PADDING_TOP + innerHeight - height}
                      width={barWidth}
                      height={Math.max(1, height)}
                      rx={2.5}
                      fill={seriesDescriptors[seriesIndex].color}
                      opacity={seriesIndex === 0 ? 1 : 0.9}
                    />
                  );
                });
              })
            )}
          </Svg>
        ) : (
          <View style={styles.perfEmptyState}>
            <Text style={styles.perfEmptyText}>{t.profile.noChartData}</Text>
          </View>
        )}

        {showChart ? (
          <View style={styles.perfXLabelsRow} pointerEvents="none">
            {xLabels.map((item) => (
              <Text key={item.index} style={styles.perfXLabel}>
                {item.label}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Etiqueta de data presa ao eixo durante o scrub */}
        {showChart && chartType === 'line' && activeIndex != null && scrubX != null ? (
          <View
            style={[
              styles.perfScrubDateChip,
              {
                left: Math.max(
                  Y_AXIS_WIDTH,
                  Math.min(chartWidth - 76, scrubX - 38)
                ),
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.perfScrubDateText}>{focusedDateLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* Abas de período */}
      <View style={styles.perfPeriodRow}>
        {PERIODS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.perfPeriodButton,
              periodKey === option.key && styles.perfPeriodButtonActive,
            ]}
            onPress={() => setPeriodKey(option.key)}
            activeOpacity={0.75}
          >
            <Text
              style={[
                styles.perfPeriodText,
                periodKey === option.key && styles.perfPeriodTextActive,
              ]}
            >
              {option.key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

    </View>
  );
}

export default React.memo(PerformanceChart);
