import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { getQuantumProgressPercent } from '../../utils/taskUtils';
import { buildRepeatingWavePath, getWaterDisplayPercent } from '../../utils/waveUtils';
import styles from './styles';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const PREVIEW_WAVE_HEIGHT = 34;

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
    ? Math.max(PREVIEW_WAVE_HEIGHT, cardSize.height * waterDisplayPercent)
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
        amplitude: 6,
      }),
      frontPath: buildRepeatingWavePath({
        totalWidth,
        wavelength,
        height: PREVIEW_WAVE_HEIGHT,
        amplitude: 6,
      }),
      backPath: buildRepeatingWavePath({
        totalWidth,
        wavelength,
        height: PREVIEW_WAVE_HEIGHT,
        amplitude: 4,
        phase: Math.PI / 2,
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
        duration: 3600,
        easing: Easing.inOut(Easing.sin),
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
                <Stop offset="0%" stopColor="rgb(153, 199, 252)" />
                <Stop offset="100%" stopColor="rgb(100, 158, 248)" />
              </SvgLinearGradient>
            </Defs>
            <AnimatedPath
              d={previewWaveGeometry.fillPath}
              fill="url(#type-preview-water-gradient)"
              style={{ transform: [{ translateX: previewWaveShift }] }}
            />
            <AnimatedPath
              d={previewWaveGeometry.backPath}
              fill="#e9f5ff"
              opacity={0.55}
              style={{ transform: [{ translateX: previewWaveShift }] }}
            />
            <AnimatedPath
              d={previewWaveGeometry.frontPath}
              fill="#f4fbff"
              opacity={0.8}
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
