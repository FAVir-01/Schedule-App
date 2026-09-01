import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { getQuantumProgressPercent } from '../../utils/taskUtils';
import {
  buildRepeatingWavePath,
  getWaterDisplayPercent,
  WATER_GRADIENT_BOTTOM_COLOR,
  WATER_GRADIENT_TOP_COLOR,
  WATER_WAVE_AMPLITUDE,
  WATER_WAVE_DURATION_MS,
  WATER_WAVE_MIN_FILL_HEIGHT,
} from '../../utils/waveUtils';
import styles from './styles';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Prévia do cartão dentro do painel de tipo. A animação de água só roda com o
// painel aberto: é decorativa e não deve consumir frames com a folha fechada.
function TypePreviewCard({
  type,
  quantum,
  color,
  backgroundColor,
  emoji,
  customImage,
  title,
  timeLabel,
  summary,
  isActive,
  reduceMotion = false,
}) {
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const previewWaveShiftAnim = useRef(new Animated.Value(0)).current;

  const isWater = type === 'quantum' && quantum?.animation === 'water';
  const waterPercent = useMemo(
    () => getQuantumProgressPercent({ type, quantum }),
    [quantum, type]
  );
  const waterDisplayPercent = useMemo(
    () => getWaterDisplayPercent(waterPercent),
    [waterPercent]
  );
  const waterFillHeight = cardSize.height
    ? Math.max(WATER_WAVE_MIN_FILL_HEIGHT, cardSize.height * waterDisplayPercent)
    : 0;

  const previewWaveGeometry = useMemo(() => {
    if (!cardSize.width || !waterFillHeight) {
      return null;
    }
    const wavelength = Math.max(120, cardSize.width * 0.65);
    const totalWidth = cardSize.width + wavelength;
    return {
      wavelength,
      totalWidth,
      fillPath: buildRepeatingWavePath({
        totalWidth,
        wavelength,
        height: waterFillHeight,
        amplitude: WATER_WAVE_AMPLITUDE,
      }),
    };
  }, [cardSize.width, waterFillHeight]);

  const previewWaveShift = useMemo(() => {
    if (!previewWaveGeometry) {
      return 0;
    }
    return previewWaveShiftAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -previewWaveGeometry.wavelength],
    });
  }, [previewWaveGeometry, previewWaveShiftAnim]);

  useEffect(() => {
    if (!isActive || !isWater || reduceMotion || !previewWaveGeometry) {
      previewWaveShiftAnim.stopAnimation();
      previewWaveShiftAnim.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.timing(previewWaveShiftAnim, {
        toValue: 1,
        duration: WATER_WAVE_DURATION_MS,
        easing: Easing.linear,
        // Fabric/Android deixa o SVG transparente quando um ancestral usa
        // transform nativo. O driver JS move só a view pronta, sem reconstruir
        // o path nem disparar render React a cada frame.
        useNativeDriver: false,
      })
    );
    animation.start();
    return () => {
      animation.stop();
      previewWaveShiftAnim.setValue(0);
    };
  }, [isActive, isWater, previewWaveGeometry, previewWaveShiftAnim, reduceMotion]);

  return (
    <View
      style={[styles.typePreviewCard, { backgroundColor, borderColor: color }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setCardSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height }
        );
      }}
    >
      {isWater && previewWaveGeometry ? (
        <View
          pointerEvents="none"
          style={[styles.typePreviewWaterFallbackFill, { height: waterFillHeight }]}
        >
          <Svg
            width={cardSize.width}
            height={waterFillHeight}
            style={styles.typePreviewWaterWave}
          >
            <Defs>
              <SvgLinearGradient
                id="type-preview-water-gradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <Stop offset="0%" stopColor={WATER_GRADIENT_TOP_COLOR} />
                <Stop offset="100%" stopColor={WATER_GRADIENT_BOTTOM_COLOR} />
              </SvgLinearGradient>
            </Defs>
            <AnimatedPath
              d={previewWaveGeometry.fillPath}
              fill="url(#type-preview-water-gradient)"
              style={{ transform: [{ translateX: previewWaveShift }] }}
            />
          </Svg>
        </View>
      ) : null}
      <View style={styles.typePreviewInfo}>
        {customImage ? (
          <Image source={{ uri: customImage }} style={styles.typePreviewEmojiImage} />
        ) : (
          <Text style={styles.typePreviewEmoji}>{emoji}</Text>
        )}
        <View style={styles.typePreviewDetails}>
          <Text style={styles.typePreviewTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.typePreviewTime}>{timeLabel}</Text>
          {summary ? (
            <View style={styles.typePreviewSummary}>
              <Text style={styles.typePreviewSummaryText}>{summary}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {type !== 'reminder' ? <View style={styles.typePreviewToggle} /> : null}
    </View>
  );
}

export default TypePreviewCard;
