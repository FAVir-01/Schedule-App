import React, { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { darkenColor } from '../utils/colorUtils';
import { getStreakPalette } from '../utils/streakColor';
import {
  getStreakAnimationTracks,
  STREAK_NUMBER_LINE as LINE,
  STREAK_RING_BOX,
} from '../utils/streakAnimation';

export { STREAK_RING_BOX, STREAK_RING_MIN, STREAK_BLAZE_MIN, STREAK_CROSS_MIN } from '../utils/streakAnimation';

const ACircle = Animated.createAnimatedComponent(Circle);
const AG = Animated.createAnimatedComponent(G);
const BLAZE_SVG = 66;
const NUM_SIDE = 12;
const NUM_OUTLINE = 2;
const NUM_BASELINE = 11.5;
const EASINGS = {
  easeInOut: Easing.bezier(0.42, 0, 0.58, 1),
  roll: Easing.bezier(0.25, 0.9, 0.3, 1),
  linear: Easing.linear,
};

// Um relógio linear mantém anéis, opacidade e número sincronizados. O easing
// pertence a cada propriedade, não ao tempo usado para localizar os marcos.
const bindTrack = (clock, track) => clock.interpolate({
  ...track,
  easing: EASINGS[track.easing],
});

export default function StreakRing({
  play,
  from,
  to,
  size = STREAK_RING_BOX,
  contour = false,
  children,
}) {
  const clock = useRef(new Animated.Value(0)).current;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const timeline = useMemo(() => getStreakAnimationTracks(to, size), [to, size]);
  const mode = play ? timeline.mode : null;
  const palette = useMemo(() => getStreakPalette(to), [to]);
  const motion = useMemo(() => ({
    number: Object.fromEntries(Object.entries(timeline.number).map(([key, track]) => [key, bindTrack(clock, track)])),
    ring: {
      dashOffset: bindTrack(clock, timeline.ring.dashOffset),
      opacity: bindTrack(clock, timeline.ring.opacity),
    },
    blaze: timeline.blaze.map((ring) => ({
      ...ring,
      opacity: bindTrack(clock, ring.opacity),
      dashOffset: bindTrack(clock, ring.dashOffset),
      rotation: bindTrack(clock, ring.rotation),
    })),
  }), [clock, timeline]);

  useEffect(() => {
    clock.setValue(0);
    if (!mode) return undefined;
    const animation = Animated.timing(clock, {
      toValue: timeline.duration,
      duration: timeline.duration,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset não é uma propriedade de View.
      isInteraction: false,
    });
    const stop = () => {
      animation.stop();
      clock.setValue(timeline.duration);
    };
    if (AppState.currentState == null || AppState.currentState === 'active') {
      animation.start();
    } else {
      stop();
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stop();
    });
    return () => {
      animation.stop();
      subscription.remove();
    };
  }, [clock, mode, play, from, to, timeline.duration]);

  const half = size / 2;
  const numWidth = size + NUM_SIDE * 2;
  const blazeStyle = {
    position: 'absolute',
    left: (size - BLAZE_SVG) / 2,
    top: (size - BLAZE_SVG) / 2,
  };
  const numStyle = {
    opacity: motion.number.opacity,
    transform: [{ translateY: motion.number.translateY }],
  };
  // GroupView do SVG Android troca o canvas ao alternar opacity entre 1 e
  // valores fracionários. Animamos a tinta, que não cria essa camada bitmap.
  const numberLines = (outline) => [from, to].map((value, index) => (
    <AG
      key={index}
      fillOpacity={index === 0 ? motion.number.previousOpacity : motion.number.nextOpacity}
      strokeOpacity={index === 0 ? motion.number.previousOpacity : motion.number.nextOpacity}
    >
      <SvgText
        x={numWidth / 2}
        y={NUM_BASELINE + LINE * index}
        textAnchor="middle"
        fontSize={12.5}
        fontWeight="800"
        fill={outline ? '#FFFFFF' : palette.digit}
        stroke={outline ? '#FFFFFF' : 'none'}
        strokeWidth={outline ? NUM_OUTLINE * 2 : 0}
        strokeLinejoin="round"
      >
        {String(value ?? 0)}
      </SvgText>
    </AG>
  ));

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {/* As três camadas existem sempre: disparar/trocar a fase não remonta
          a imagem nem interrompe o brilho que está tocando sobre ela. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
        {mode === 'blaze' ? (
          <Svg width={BLAZE_SVG} height={BLAZE_SVG} viewBox="-33 -33 66 66" style={blazeStyle}>
            {motion.blaze.map((ring) => (
              // G converte rotation em matriz nativa; Circle não faz essa
              // conversão em setNativeProps. Todos ficam no mesmo SVG.
              <AG key={ring.key} rotation={ring.rotation}>
                <ACircle
                  cx={0}
                  cy={0}
                  r={ring.radius}
                  fill="none"
                  stroke={palette[ring.key]}
                  strokeOpacity={ring.opacity}
                  strokeWidth={ring.width}
                  strokeLinecap="round"
                  strokeDasharray={[ring.circumference, ring.circumference]}
                  strokeDashoffset={ring.dashOffset}
                />
              </AG>
            ))}
          </Svg>
        ) : null}
      </View>

      <View style={styles.icon}>{children}</View>

      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {mode === 'ring' ? (
          <Svg width={size} height={size} viewBox={`${-half} ${-half} ${size} ${size}`}>
            <Defs>
              <LinearGradient id={`${id}ember`} gradientUnits="userSpaceOnUse" x1={-half} y1={half} x2={half} y2={-half}>
                <Stop offset="0" stopColor={darkenColor(palette.ringStart, 0.28)} />
                <Stop offset="0.28" stopColor={palette.ringStart} />
                <Stop offset="0.56" stopColor={palette.ringMid} />
                <Stop offset="0.8" stopColor={palette.ringEnd} />
                <Stop offset="1" stopColor={palette.ringMid} />
              </LinearGradient>
            </Defs>
            <G rotation={-90}>
              {[{ width: 6.4, opacity: 0.22 }, { width: 4, opacity: 1 }].map((stroke) => (
                <ACircle
                  key={stroke.width}
                  cx={0}
                  cy={0}
                  r={half - 3.2}
                  fill="none"
                  stroke={`url(#${id}ember)`}
                  strokeWidth={stroke.width}
                  strokeOpacity={Animated.multiply(motion.ring.opacity, stroke.opacity)}
                  strokeLinecap="round"
                  strokeDasharray={[timeline.ring.circumference, timeline.ring.circumference]}
                  strokeDashoffset={motion.ring.dashOffset}
                />
              ))}
            </G>
          </Svg>
        ) : null}
        {mode === 'blaze' && contour ? (
          <Svg width={BLAZE_SVG} height={BLAZE_SVG} viewBox="-33 -33 66 66" style={blazeStyle}>
            <ACircle cx={0} cy={0} r={23} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={motion.blaze[0].opacity} />
          </Svg>
        ) : null}
        {mode ? (
          <Animated.View style={[styles.numOuter, numStyle]}>
            {/* A janela do preenchimento tem 15px. O contorno tem mais 2px
                em cada borda; o SVG externo precisa comportar esse halo. */}
            <Svg width={numWidth} height={LINE + NUM_OUTLINE * 2} viewBox={`0 ${-NUM_OUTLINE} ${numWidth} ${LINE + NUM_OUTLINE * 2}`} style={styles.numberSvg}>
              <Defs>
                <ClipPath id={`${id}fillWindow`}><Rect x={0} y={0} width={numWidth} height={LINE} /></ClipPath>
                <ClipPath id={`${id}outlineWindow`}><Rect x={0} y={-NUM_OUTLINE} width={numWidth} height={LINE + NUM_OUTLINE * 2} /></ClipPath>
              </Defs>
              {/* O texto fica estático. Só o grupo desliza: animar Text.y
                  também cria uma translação e limpa a fonte no SVG 15.15. */}
              <G clipPath={`url(#${id}outlineWindow)`}>
                <AG translateY={motion.number.roll}>{numberLines(true)}</AG>
              </G>
              <G clipPath={`url(#${id}fillWindow)`}>
                <AG translateY={motion.number.roll}>{numberLines(false)}</AG>
              </G>
            </Svg>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  icon: { alignItems: 'center', justifyContent: 'center' },
  numOuter: {
    position: 'absolute',
    left: -NUM_SIDE,
    right: -NUM_SIDE,
    bottom: -10,
    height: LINE,
    overflow: 'visible',
  },
  numberSvg: { position: 'absolute', left: 0, top: -NUM_OUTLINE },
});
