import React from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatNumber, formatTimePeriodDuration } from '../../utils/timeUtils';
import { HOUR_VALUES, HOUR_VALUES_24, MERIDIEM_VALUES, MINUTE_VALUES, to24Hour } from './constants';
import { AnimatedReveal, SegmentedControlButton } from './parts';
import WheelColumn from './WheelColumn';
import styles from './styles';

function TimePanel({
  specified,
  onToggleSpecified,
  mode,
  onModeChange,
  pointTime,
  onPointTimeChange,
  periodTime,
  onPeriodTimeChange,
  labels,
  use24Hour = false,
}) {
  // No modo 24h a roda de horas vai de 0-23 e a coluna AM/PM some;
  // os dados continuam salvos como hour 1-12 + meridiem.
  const hourValues = use24Hour ? HOUR_VALUES_24 : HOUR_VALUES;
  const getHourIndex = (time) =>
    use24Hour ? to24Hour(time) : Math.max(0, HOUR_VALUES.indexOf(time.hour));
  const hourPatch = (value) =>
    use24Hour
      ? { hour: value % 12 || 12, meridiem: value >= 12 ? 'PM' : 'AM' }
      : { hour: value };

  const hourIndex = getHourIndex(pointTime);
  const minuteIndex = Math.max(0, MINUTE_VALUES.indexOf(pointTime.minute));
  const meridiemIndex = Math.max(0, MERIDIEM_VALUES.indexOf(pointTime.meridiem));

  const startHourIndex = getHourIndex(periodTime.start);
  const startMinuteIndex = Math.max(0, MINUTE_VALUES.indexOf(periodTime.start.minute));
  const startMeridiemIndex = Math.max(0, MERIDIEM_VALUES.indexOf(periodTime.start.meridiem));
  const endHourIndex = getHourIndex(periodTime.end);
  const endMinuteIndex = Math.max(0, MINUTE_VALUES.indexOf(periodTime.end.minute));
  const endMeridiemIndex = Math.max(0, MERIDIEM_VALUES.indexOf(periodTime.end.meridiem));
  const duration = formatTimePeriodDuration(periodTime);

  return (
    <View style={styles.timePanel}>
      <View style={styles.specifiedRow}>
        <View style={styles.specifiedLabelGroup}>
          <View style={styles.specifiedIconContainer}>
            <Ionicons name="time-outline" size={22} color="#3C2BA7" />
          </View>
          <View>
            <Text style={styles.specifiedTitle}>{labels.specifiedTime}</Text>
            <Text style={styles.specifiedSubtitle}>{labels.setSpecificTime}</Text>
          </View>
        </View>
        <Switch
          value={specified}
          onValueChange={onToggleSpecified}
          trackColor={{ false: '#D5D3DE', true: '#AFA5EA' }}
          thumbColor={specified ? '#3C2BA7' : Platform.OS === 'android' ? '#f4f3f4' : undefined}
        />
      </View>
      {specified && (
        <AnimatedReveal>
          <View style={styles.segmentedControl}>
            <SegmentedControlButton
              label={labels.pointTime}
              active={mode === 'point'}
              onPress={() => onModeChange('point')}
            />
            <SegmentedControlButton
              label={labels.timePeriod}
              active={mode === 'period'}
              onPress={() => onModeChange('period')}
            />
          </View>
          {mode === 'point' ? (
            <AnimatedReveal key="point" style={styles.wheelGroup}>
              <View style={styles.wheelLabelsRow}>
                <Text style={styles.wheelLabel}>{labels.hour}</Text>
                <Text style={styles.wheelLabel}>{labels.min}</Text>
                {!use24Hour && <Text style={styles.wheelLabel}>AM/PM</Text>}
              </View>
              <View style={styles.wheelArea}>
                <View pointerEvents="none" style={styles.wheelHighlight} />
                <View style={styles.wheelRow}>
                  <WheelColumn
                    values={hourValues}
                    selectedIndex={hourIndex}
                    onSelect={(value) => onPointTimeChange({ ...pointTime, ...hourPatch(value) })}
                    formatter={(value) => formatNumber(value)}
                  />
                  <Text pointerEvents="none" style={styles.wheelDivider}>
                    :
                  </Text>
                  <WheelColumn
                    values={MINUTE_VALUES}
                    selectedIndex={minuteIndex}
                    onSelect={(value) => onPointTimeChange({ ...pointTime, minute: value })}
                    formatter={(value) => formatNumber(value)}
                  />
                  {!use24Hour && (
                    <WheelColumn
                      values={MERIDIEM_VALUES}
                      selectedIndex={meridiemIndex}
                      onSelect={(value) => onPointTimeChange({ ...pointTime, meridiem: value })}
                    />
                  )}
                </View>
              </View>
            </AnimatedReveal>
          ) : (
            <AnimatedReveal key="period" style={styles.periodSection}>
              <Text style={styles.periodLabel}>{labels.from}</Text>
              <View style={styles.wheelGroup}>
                <View style={styles.wheelLabelsRow}>
                  <Text style={styles.wheelLabel}>{labels.hour}</Text>
                  <Text style={styles.wheelLabel}>{labels.min}</Text>
                  {!use24Hour && <Text style={styles.wheelLabel}>AM/PM</Text>}
                </View>
                <View style={styles.wheelArea}>
                  <View pointerEvents="none" style={styles.wheelHighlight} />
                  <View style={styles.wheelRow}>
                    <WheelColumn
                      values={hourValues}
                      selectedIndex={startHourIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          start: { ...prev.start, ...hourPatch(value) },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    <Text pointerEvents="none" style={styles.wheelDivider}>
                      :
                    </Text>
                    <WheelColumn
                      values={MINUTE_VALUES}
                      selectedIndex={startMinuteIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          start: { ...prev.start, minute: value },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    {!use24Hour && (
                      <WheelColumn
                        values={MERIDIEM_VALUES}
                        selectedIndex={startMeridiemIndex}
                        onSelect={(value) =>
                          onPeriodTimeChange((prev) => ({
                            start: { ...prev.start, meridiem: value },
                          }))
                        }
                      />
                    )}
                  </View>
                </View>
              </View>
              <Text style={[styles.periodLabel, styles.periodLabelSpacer]}>{labels.to}</Text>
              <View style={styles.wheelGroup}>
                <View style={styles.wheelLabelsRow}>
                  <Text style={styles.wheelLabel}>{labels.hour}</Text>
                  <Text style={styles.wheelLabel}>{labels.min}</Text>
                  {!use24Hour && <Text style={styles.wheelLabel}>AM/PM</Text>}
                </View>
                <View style={styles.wheelArea}>
                  <View pointerEvents="none" style={styles.wheelHighlight} />
                  <View style={styles.wheelRow}>
                    <WheelColumn
                      values={hourValues}
                      selectedIndex={endHourIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          end: { ...prev.end, ...hourPatch(value) },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    <Text pointerEvents="none" style={styles.wheelDivider}>
                      :
                    </Text>
                    <WheelColumn
                      values={MINUTE_VALUES}
                      selectedIndex={endMinuteIndex}
                      onSelect={(value) =>
                        onPeriodTimeChange((prev) => ({
                          end: { ...prev.end, minute: value },
                        }))
                      }
                      formatter={(value) => formatNumber(value)}
                    />
                    {!use24Hour && (
                      <WheelColumn
                        values={MERIDIEM_VALUES}
                        selectedIndex={endMeridiemIndex}
                        onSelect={(value) =>
                          onPeriodTimeChange((prev) => ({
                            end: { ...prev.end, meridiem: value },
                          }))
                        }
                      />
                    )}
                  </View>
                </View>
              </View>
              {duration && <Text style={styles.periodDuration} accessibilityLiveRegion="polite">
                {labels.periodDuration.replace('{duration}', duration)}
              </Text>}
            </AnimatedReveal>
          )}
        </AnimatedReveal>
      )}
    </View>
  );
}

export default TimePanel;
