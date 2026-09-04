import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { format } from 'date-fns';
import { getDateLocale, getWeekdayInitials } from '../constants/i18n';
import { buildRecentTaskActivity } from '../domain/taskActivity';
import { styles } from '../styles/appStyles';

const GAP = 3;
const MONTH_GAP = 8;
const MAX_CELL_SIZE = 17;
const INACTIVE_COLOR = '#edf1f5';
const MISSED_COLOR = '#d8dee8';

export default function TaskHeatmap({ task, language = 'en', labels = {}, today }) {
  const locale = getDateLocale(language);
  const [gridWidth, setGridWidth] = useState(0);
  const activity = useMemo(
    () => buildRecentTaskActivity(task, { today: today ?? new Date() }),
    [task, today]
  );

  // A lista global vem em ordem de domingo. Aqui a semana é deliberadamente
  // segunda -> domingo: em inglês, M T W T F S S, sem uma linha muda antes do M.
  const weekdayInitials = useMemo(() => {
    const sundayFirst = getWeekdayInitials(language);
    return [...sundayFirst.slice(1), sundayFirst[0]];
  }, [language]);

  const monthColumns = useMemo(
    () =>
      activity.columns.map((column) => {
        const firstOfMonth = column.days.find(
          (day) => !day.isOutsidePeriod && day.date.getDate() === 1
        );
        return {
          key: column.key,
          startsMonth: Boolean(firstOfMonth),
          label: firstOfMonth
            ? format(firstOfMonth.date, 'LLL', { locale }).replace('.', '')
            : '',
        };
      }),
    [activity.columns, locale]
  );
  const monthBoundaryCount = monthColumns.reduce(
    (total, column, index) => total + (index > 0 && column.startsMonth ? 1 : 0),
    0
  );

  const cellSize = gridWidth
    ? Math.max(
        8,
        Math.min(
          MAX_CELL_SIZE,
          Math.floor(
            (gridWidth -
              (activity.columns.length - 1) * GAP -
              monthBoundaryCount * MONTH_GAP) /
              activity.columns.length
          )
        )
      )
    : 13;
  const doneColor = task?.color ?? '#382F98';

  const formatCellAccessibility = (cell) => {
    const dateLabel = format(cell.date, 'PPP', { locale });
    if (cell.isOutsidePeriod || !cell.onSchedule) {
      return dateLabel;
    }
    return `${dateLabel}, ${cell.isCompleted ? labels.completed : labels.notCompleted}`;
  };

  return (
    <View style={styles.heatmap}>
      <View style={styles.heatmapHeader}>
        <Text style={styles.heatmapLabel}>{labels.title}</Text>
        <Text style={styles.heatmapPeriod}>{labels.period}</Text>
      </View>

      <View style={styles.heatmapBody}>
        <View style={styles.heatmapWeekdays}>
          <View style={styles.heatmapMonthSpacer} />
          {weekdayInitials.map((initial, index) => (
            <View
              key={`${initial}-${index}`}
              style={[styles.heatmapWeekdayCell, { height: cellSize }]}
            >
              <Text style={styles.heatmapWeekdayText}>{initial}</Text>
            </View>
          ))}
        </View>

        <View
          style={styles.heatmapGridArea}
          onLayout={(event) => {
            const nextWidth = Math.round(event.nativeEvent.layout.width);
            setGridWidth((current) => (current === nextWidth ? current : nextWidth));
          }}
        >
          <View style={styles.heatmapMonths}>
            {monthColumns.map((column, index) => (
              <View
                key={column.key}
                style={[
                  { width: cellSize },
                  index > 0 && column.startsMonth && styles.heatmapMonthBoundary,
                ]}
              >
                <Text style={styles.heatmapMonthText} numberOfLines={1}>
                  {column.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.heatmapGrid}>
            {activity.columns.map((column, index) => (
              <View
                key={column.key}
                style={[
                  styles.heatmapColumn,
                  index > 0 && monthColumns[index].startsMonth && styles.heatmapMonthBoundary,
                ]}
              >
                {column.days.map((cell) => {
                  let backgroundColor = INACTIVE_COLOR;
                  if (cell.isEvaluated && !cell.isCompleted) {
                    backgroundColor = MISSED_COLOR;
                  } else if (cell.isCompleted) {
                    backgroundColor = doneColor;
                  }
                  return (
                    <View
                      key={cell.key}
                      accessible={cell.onSchedule}
                      accessibilityLabel={formatCellAccessibility(cell)}
                      style={[
                        styles.heatmapCell,
                        {
                          width: cellSize,
                          height: cellSize,
                          backgroundColor,
                          opacity: cell.isOutsidePeriod ? 0 : cell.onSchedule ? 1 : 0.58,
                        },
                        cell.isToday && styles.heatmapCellToday,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.heatmapStats}>
        <View style={styles.heatmapStat}>
          <Text style={styles.heatmapStatValue}>{activity.completed}</Text>
          <Text style={styles.heatmapStatLabel}>{labels.completed}</Text>
        </View>
        <View style={styles.heatmapStatDivider} />
        <View style={styles.heatmapStat}>
          <Text style={styles.heatmapStatValue}>{activity.scheduled}</Text>
          <Text style={styles.heatmapStatLabel}>{labels.scheduled}</Text>
        </View>
        <View style={styles.heatmapStatDivider} />
        <View style={styles.heatmapStat}>
          <Text style={styles.heatmapStatValue}>
            {activity.successRate == null ? '—' : `${activity.successRate}%`}
          </Text>
          <Text style={styles.heatmapStatLabel}>{labels.successRate}</Text>
        </View>
      </View>
    </View>
  );
}
