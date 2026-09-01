import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isSameDay, normalizeDateValue as normalizeDate } from '../../utils/dateUtils';
import { addMonths, doesDateRepeat, getMonthMetadata, isBeforeDay } from '../../utils/calendarMath';
import { WEEKDAY_KEYS } from '../../domain/taskDraft';
import { AnimatedReveal, SoftPressable } from './parts';
import styles from './styles';

function DatePanel({
  month,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  repeatConfig,
  minimumDate,
  labels = {},
  language = 'en',
}) {
  const resolvedLabels = useMemo(() => ({
    quickToday: 'Today',
    quickTomorrow: 'Tomorrow',
    quickNextMonday: 'Next Monday',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    repeatingDate: 'Repeating date',
    ...((labels && typeof labels === 'object') ? labels : {}),
  }), [labels]);
  const dateLocale = language === 'pt' ? 'pt-BR' : 'en-US';
  const today = useMemo(() => normalizeDate(new Date()), []);
  const minimumSelectableDate = useMemo(
    () => normalizeDate(minimumDate ?? today),
    [minimumDate, today]
  );
  const [visibleMonth, setVisibleMonth] = useState(() => normalizeDate(month));

  useEffect(() => {
    const normalized = normalizeDate(month);
    if (normalized && normalized.getTime() !== visibleMonth.getTime()) {
      setVisibleMonth(normalized);
    }
  }, [month, visibleMonth]);

  const monthInfo = useMemo(() => getMonthMetadata(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(
    () =>
      visibleMonth.toLocaleDateString(dateLocale, {
        month: 'long',
        year: 'numeric',
      }),
    [dateLocale, visibleMonth]
  );
  const previousMonth = useMemo(() => addMonths(visibleMonth, -1), [visibleMonth]);
  const nextMonth = useMemo(() => addMonths(visibleMonth, 1), [visibleMonth]);
  const previousMonthDisabled = useMemo(() => {
    const lastDayPrev = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0);
    return isBeforeDay(lastDayPrev, minimumSelectableDate);
  }, [minimumSelectableDate, previousMonth]);
  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(today.getDate() + 1);
    return normalizeDate(t);
  }, [today]);
  const nextMonday = useMemo(() => {
    const next = new Date(today);
    const offset = ((1 - next.getDay() + 7) % 7) || 7;
    next.setDate(next.getDate() + offset);
    return normalizeDate(next);
  }, [today]);
  const isRepeatingDay = useCallback(
    (targetDate) => {
      if (!repeatConfig?.enabled) {
        return false;
      }
      const normalizedStart = normalizeDate(selectedDate);
      const normalizedTarget = normalizeDate(targetDate);
      if (!normalizedStart || !normalizedTarget) {
        return false;
      }
      return doesDateRepeat(normalizedTarget, normalizedStart, repeatConfig);
    },
    [repeatConfig, selectedDate]
  );

  const daysMatrix = useMemo(() => {
    const totalCells = monthInfo.startWeekday + monthInfo.days;
    const filledCells = Math.ceil(totalCells / 7) * 7;
    const cells = [];
    for (let i = 0; i < monthInfo.startWeekday; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= monthInfo.days; day += 1) {
      cells.push(new Date(monthInfo.year, monthInfo.month, day));
    }
    while (cells.length < filledCells) {
      cells.push(null);
    }
    const rows = [];
    for (let index = 0; index < cells.length; index += 7) {
      rows.push(cells.slice(index, index + 7));
    }
    return rows;
  }, [monthInfo.days, monthInfo.month, monthInfo.startWeekday, monthInfo.year]);

  const handleChangeMonth = useCallback(
    (nextMonth) => {
      if (!nextMonth) {
        return;
      }
      const normalized = normalizeDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
      if (!normalized) {
        return;
      }
      setVisibleMonth(normalized);
      if (typeof onChangeMonth === 'function') {
        onChangeMonth(normalized);
      }
    },
    [onChangeMonth]
  );

  const handleSelectQuick = useCallback(
    (targetDate) => {
      const normalizedTarget = normalizeDate(targetDate);
      if (isBeforeDay(normalizedTarget, minimumSelectableDate)) {
        return;
      }
      if (
        normalizedTarget.getFullYear() !== visibleMonth.getFullYear() ||
        normalizedTarget.getMonth() !== visibleMonth.getMonth()
      ) {
        handleChangeMonth(normalizedTarget);
      }
      onSelectDate(normalizedTarget);
    },
    [handleChangeMonth, minimumSelectableDate, onSelectDate, visibleMonth]
  );

  return (
    <View style={styles.datePanel}>
      <View style={styles.quickSelectRow}>
        <QuickSelectButton
          label={resolvedLabels.quickToday}
          active={isSameDay(selectedDate, today)}
          disabled={isBeforeDay(today, minimumSelectableDate)}
          onPress={() => handleSelectQuick(today)}
        />
        <QuickSelectButton
          label={resolvedLabels.quickTomorrow}
          active={isSameDay(selectedDate, tomorrow)}
          disabled={isBeforeDay(tomorrow, minimumSelectableDate)}
          onPress={() => handleSelectQuick(tomorrow)}
        />
        <QuickSelectButton
          label={resolvedLabels.quickNextMonday}
          active={isSameDay(selectedDate, nextMonday)}
          disabled={isBeforeDay(nextMonday, minimumSelectableDate)}
          onPress={() => handleSelectQuick(nextMonday)}
        />
      </View>
      <View style={styles.calendarHeader}>
        <SoftPressable
          style={styles.calendarNavButton}
          onPress={() => handleChangeMonth(previousMonth)}
          disabled={previousMonthDisabled}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={resolvedLabels.previousMonth}
          accessibilityState={{ disabled: previousMonthDisabled }}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={previousMonthDisabled ? '#B8C4D6' : '#1F2742'}
          />
        </SoftPressable>
        <Text style={styles.calendarHeaderText} accessibilityRole="header">{monthLabel}</Text>
        <SoftPressable
          style={styles.calendarNavButton}
          onPress={() => handleChangeMonth(nextMonth)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={resolvedLabels.nextMonth}
        >
          <Ionicons name="chevron-forward" size={22} color="#1F2742" />
        </SoftPressable>
      </View>
      <View style={styles.weekdayHeader}>
        {WEEKDAY_KEYS.map((weekdayKey) => (
          <Text key={weekdayKey} style={styles.weekdayLabel}>
            {resolvedLabels.weekdayShortLabels?.[weekdayKey] ?? weekdayKey}
          </Text>
        ))}
      </View>
      <AnimatedReveal key={`${monthInfo.year}-${monthInfo.month}`}>
        {daysMatrix.map((week, rowIndex) => (
          <View key={`week-${rowIndex}`} style={styles.weekRow}>
            {week.map((date, columnIndex) => {
            if (!date) {
              return <View key={`empty-${rowIndex}-${columnIndex}`} style={styles.dayCellEmpty} />;
            }

            const disabled = isBeforeDay(date, minimumSelectableDate);
            const selected = isSameDay(date, selectedDate);
            const repeating = isRepeatingDay(date);
            const disabledStyle = disabled ? styles.dayCellDisabled : null;
            const selectedStyle = selected ? styles.dayCellSelected : null;
            const repeatingStyle = repeating ? styles.dayCellRepeating : null;
            const dateAccessibilityLabel = [
              date.toLocaleDateString(dateLocale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
              repeating ? resolvedLabels.repeatingDate : null,
            ]
              .filter(Boolean)
              .join('. ');

            return (
              <SoftPressable
                key={date.toISOString()}
                style={[styles.dayCell, disabledStyle, selectedStyle, repeatingStyle]}
                disabled={disabled}
                onPress={() => onSelectDate(date)}
                accessibilityRole="button"
                accessibilityLabel={dateAccessibilityLabel}
                accessibilityState={{ selected, disabled }}
              >
                <Text style={[styles.dayCellText, disabled && styles.dayCellTextDisabled, selected && styles.dayCellTextSelected, repeating && styles.dayCellTextRepeating]}>{date.getDate()}</Text>
              </SoftPressable>
            );
            })}
          </View>
        ))}
      </AnimatedReveal>
    </View>
  );
}

function QuickSelectButton({ label, active, disabled = false, onPress }) {
  return (
    <SoftPressable
      style={[
        styles.quickSelectButton,
        active && styles.quickSelectButtonActive,
        disabled && styles.quickSelectButtonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
    >
      <Text
        style={[
          styles.quickSelectLabel,
          active && styles.quickSelectLabelActive,
          disabled && styles.quickSelectLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </SoftPressable>
  );
}

export default DatePanel;
