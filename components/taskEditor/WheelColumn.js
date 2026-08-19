import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { HAPTICS_SUPPORTED, WHEEL_ITEM_HEIGHT } from './constants';
import styles from './styles';

function WheelColumn({
  values,
  selectedIndex,
  onSelect,
  formatter = (value) => value,
  itemHeight = WHEEL_ITEM_HEIGHT,
}) {
  const scrollRef = useRef(null);
  const isMomentumScrolling = useRef(false);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!scrollRef.current || isMomentumScrolling.current || isDragging.current) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * itemHeight, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex, itemHeight]);

  const finalizeSelection = useCallback(
    (offsetY) => {
      const maxOffset = Math.max(0, (values.length - 1) * itemHeight);
      const clampedOffset = Math.min(Math.max(offsetY, 0), maxOffset);
      const index = Math.round(clampedOffset / itemHeight);
      const clampedIndex = Math.min(Math.max(index, 0), values.length - 1);

      if (clampedIndex !== selectedIndex) {
        onSelect(values[clampedIndex]);
        if (HAPTICS_SUPPORTED && typeof Haptics.selectionAsync === 'function') {
          try {
            Haptics.selectionAsync();
          } catch (error) {
            // Ignore missing haptics support on web
          }
        }
      }
    },
    [itemHeight, values, onSelect, selectedIndex]
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
    (e) => {
      isDragging.current = false;
      if (!isMomentumScrolling.current) {
        finalizeSelection(e.nativeEvent.contentOffset.y ?? 0);
      }
    },
    [finalizeSelection]
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.wheelColumn}
      contentContainerStyle={[
        styles.wheelColumnContent,
        { paddingVertical: itemHeight * 2 },
      ]}
      showsVerticalScrollIndicator={false}
      // deixa o sistema cuidar do momentum e nós só "arredondamos" no fim:
      snapToInterval={itemHeight}
      decelerationRate={Platform.select({ ios: 'fast', android: 0.998 })}
      overScrollMode="never"
      bounces
      scrollEventThrottle={16}
      nestedScrollEnabled
      // evita que o gesto suba para o pan da folha:
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
      onMomentumScrollBegin={handleMomentumBegin}
      onMomentumScrollEnd={handleMomentumEnd}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
    >
      {values.map((value, index) => {
        const isActive = index === selectedIndex;
        return (
          <View key={`${value}-${index}`} style={[styles.wheelItem, { height: itemHeight }]}>
            <Text style={[styles.wheelItemText, isActive && styles.wheelItemTextActive]}>
              {formatter(value)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default WheelColumn;
