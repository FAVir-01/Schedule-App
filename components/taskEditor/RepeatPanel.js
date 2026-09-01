import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { normalizeDateValue as normalizeDate } from '../../utils/dateUtils';
import { WEEKDAY_KEYS } from '../../domain/taskDraft';
import { INTERVAL_VALUES } from './constants';
import { AnimatedReveal, SegmentedControlButton, SoftPressable } from './parts';
import DatePanel from './DatePanel';
import WheelColumn from './WheelColumn';
import styles from './styles';

function RepeatPanel({
  isEnabled,
  frequency,
  interval,
  weekdays,
  monthDays,
  hasEndDate,
  endDate,
  onToggleEnabled,
  onFrequencyChange,
  onIntervalChange,
  onToggleWeekday,
  onToggleMonthDay,
  onToggleHasEndDate,
  onChangeEndDate,
  startDate,
  labels,
  language = 'en',
}) {
  const [showIntervalPicker, setShowIntervalPicker] = useState(false);
  const [endDateMonth, setEndDateMonth] = useState(() => normalizeDate(endDate || startDate || new Date()));
  const selectedWeekdays = weekdays ?? [];
  const selectedMonthDays = monthDays ?? [];

  useEffect(() => {
    if (endDate) {
      const normalized = normalizeDate(endDate);
      setEndDateMonth(new Date(normalized.getFullYear(), normalized.getMonth(), 1));
    }
  }, [endDate]);

  const intervalUnit = useMemo(() => ({ singular: frequency === 'daily' ? labels.daySingle : frequency === 'weekly' ? labels.weekSingle : labels.monthSingle, plural: frequency === 'daily' ? labels.dayPlural : frequency === 'weekly' ? labels.weekPlural : labels.monthPlural }), [frequency, labels.dayPlural, labels.daySingle, labels.monthPlural, labels.monthSingle, labels.weekPlural, labels.weekSingle]);
  const intervalSummary = useMemo(
    () => `${labels.repeatEvery} ${interval} ${interval === 1 ? intervalUnit.singular : intervalUnit.plural}`,
    [interval, intervalUnit, labels.repeatEvery]
  );

  // Semear o primeiro dia da semana/mes quando a lista esta vazia e
  // responsabilidade do reducer (withInvariants), nao da tela.
  const handleSelectFrequency = useCallback(
    (value) => {
      onFrequencyChange?.(value);
    },
    [onFrequencyChange]
  );

  const handleToggleEndDate = useCallback(
    (value) => {
      onToggleHasEndDate?.(value);
      if (value && !endDate) {
        const fallbackDate = normalizeDate(startDate || new Date());
        onChangeEndDate?.(fallbackDate);
        setEndDateMonth(new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1));
      }
    },
    [endDate, onChangeEndDate, onToggleHasEndDate, startDate]
  );

  const selectedEndDate = useMemo(
    () => normalizeDate(endDate || startDate || new Date()),
    [endDate, startDate]
  );

  return (
    <View style={styles.repeatPanel}>
      <View style={styles.specifiedRow}>
        <View style={styles.specifiedLabelGroup}>
          <View style={styles.specifiedIconContainer}>
            <Ionicons name="repeat-outline" size={22} color="#1F2742" />
          </View>
          <View>
            <Text style={styles.specifiedTitle}>{labels.repeat}</Text>
            <Text style={styles.specifiedSubtitle}>{labels.setTaskRepeat}</Text>
          </View>
        </View>
        <Switch
          value={isEnabled}
          onValueChange={onToggleEnabled}
          trackColor={{ false: '#D5D3DE', true: '#AFA5EA' }}
          thumbColor={isEnabled ? '#3C2BA7' : Platform.OS === 'android' ? '#f4f3f4' : undefined}
        />
      </View>

      {isEnabled && (
        <AnimatedReveal style={styles.repeatContent}>
          <View style={styles.segmentedControl}>
            <SegmentedControlButton
              label={labels.daily}
              active={frequency === 'daily'}
              onPress={() => handleSelectFrequency('daily')}
            />
            <SegmentedControlButton
              label={labels.weekly}
              active={frequency === 'weekly'}
              onPress={() => handleSelectFrequency('weekly')}
            />
            <SegmentedControlButton
              label={labels.monthly}
              active={frequency === 'monthly'}
              onPress={() => handleSelectFrequency('monthly')}
            />
          </View>

          {frequency === 'weekly' && (
            <AnimatedReveal key="weekly" style={styles.weekdayGrid}>
              {WEEKDAY_KEYS.map((weekdayKey) => {
                const active = selectedWeekdays.includes(weekdayKey);
                const shortLabel = labels.weekdayShortLabels?.[weekdayKey] ?? weekdayKey;
                const fullLabel = labels.weekdayFullLabels?.[weekdayKey] ?? shortLabel;
                return (
                  <SoftPressable
                    key={weekdayKey}
                    style={[styles.weekdayPill, active && styles.weekdayPillActive]}
                    onPress={() => onToggleWeekday(weekdayKey)}
                    accessibilityRole="button"
                    accessibilityLabel={fullLabel}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.weekdayPillLabel, active && styles.weekdayPillLabelActive]}>
                      {shortLabel}
                    </Text>
                  </SoftPressable>
                );
              })}
            </AnimatedReveal>
          )}

          {frequency === 'monthly' && (
            <AnimatedReveal key="monthly" style={styles.monthDayGrid}>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                const active = selectedMonthDays.includes(day);
                return (
                  <SoftPressable
                    key={day}
                    style={[styles.monthDayCell, active && styles.monthDayCellActive]}
                    onPress={() => onToggleMonthDay(day)}
                    accessibilityRole="button"
                    accessibilityLabel={labels.dayOfMonth.replace('{day}', String(day))}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.monthDayLabel, active && styles.monthDayLabelActive]}>{day}</Text>
                  </SoftPressable>
                );
              })}
            </AnimatedReveal>
          )}

          <View style={styles.intervalSection}>
            <SoftPressable
              style={styles.intervalRow}
              onPress={() => setShowIntervalPicker((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showIntervalPicker }}
            >
              <Text style={styles.intervalLabel}>{labels.interval}</Text>
              <View style={styles.intervalValueContainer}>
                <Text style={styles.intervalValue}>{intervalSummary}</Text>
                <Ionicons
                  name={showIntervalPicker ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#6B7288"
                  style={styles.intervalChevron}
                />
              </View>
            </SoftPressable>
            {showIntervalPicker && (
              <AnimatedReveal style={styles.wheelGroup}>
                <View style={styles.wheelLabelsRow}>
                  <Text style={styles.wheelLabel}>{labels.repeatEvery}</Text>
                  <Text style={styles.wheelLabel}>{labels.repeatUnit}</Text>
                </View>
                <View style={styles.wheelArea}>
                  <View pointerEvents="none" style={styles.wheelHighlight} />
                  <View style={styles.wheelRow}>
                    <WheelColumn
                      values={INTERVAL_VALUES}
                      selectedIndex={Math.max(0, Math.min(INTERVAL_VALUES.length - 1, interval - 1))}
                      onSelect={(value) => onIntervalChange(value)}
                    />
                    <WheelColumn
                      values={[intervalUnit.plural]}
                      selectedIndex={0}
                      onSelect={() => {}}
                    />
                  </View>
                </View>
              </AnimatedReveal>
            )}
          </View>

          <View style={styles.intervalSection}>
            <View style={styles.endDateRow}>
              <Text style={styles.intervalLabel}>{labels.endDate}</Text>
              <Switch
                value={hasEndDate}
                onValueChange={handleToggleEndDate}
                trackColor={{ false: '#D5D3DE', true: '#AFA5EA' }}
                thumbColor={hasEndDate ? '#3C2BA7' : Platform.OS === 'android' ? '#f4f3f4' : undefined}
              />
            </View>
            {hasEndDate && (
              <AnimatedReveal style={styles.endDatePickerContainer}>
                <DatePanel
                  month={endDateMonth}
                  selectedDate={selectedEndDate}
                  onSelectDate={onChangeEndDate}
                  onChangeMonth={setEndDateMonth}
                  repeatConfig={{ enabled: false }}
                  minimumDate={startDate}
                  labels={labels}
                  language={language}
                />
              </AnimatedReveal>
            )}
          </View>
        </AnimatedReveal>
      )}
    </View>
  );
}

export default RepeatPanel;
