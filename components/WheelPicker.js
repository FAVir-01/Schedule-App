import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HAPTICS_SUPPORTED } from '../constants/app';
import { WHEEL_ITEM_HEIGHT } from '../constants/layout';
import { styles } from '../styles/appStyles';

export const TIMER_HOUR_OPTIONS = Array.from({ length: 100 }, (_, index) =>
  String(index).padStart(2, '0')
);
export const TIMER_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, '0')
);

export function normalizeTimerValue(value, options) {
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

export default function WheelPicker({ values, value, onChange, accessibilityLabel, itemHeight = WHEEL_ITEM_HEIGHT }) {
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
