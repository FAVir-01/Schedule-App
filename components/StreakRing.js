// Anel da sequencia.
//
// Toca em volta do icone da tarefa quando a sequencia avanca, mostra o numero
// novo por baixo e some sem deixar rastro. As fases, os tempos e a geometria
// estao em utils/streakAnimation.js; aqui e so o desenho.
//
// POR QUE NAO USA `Animated` NO SVG
//   No Fabric, o Animated trata os elementos do react-native-svg como Paper:
//   manda setNativeProps a cada quadro e nunca sincroniza a arvore do React
//   (createAnimatedPropsHook, "Check 4"). Qualquer re-render do card entao
//   recommita o SVG com os props do ultimo render — a posicao inicial — e o
//   quadro seguinte devolve a atual: o anel pisca entre o inicio e o agora,
//   um "fantasma". Para View o RN ressincroniza a cada 48ms; para SVG nao.
//
//   Aqui o relogio e estado do React e cada quadro re-renderiza o anel com
//   valores concretos. A arvore e minuscula (tres circulos, quatro textos);
//   um commit por quadro cabe folgado, e nunca ha duas verdades sobre onde o
//   anel esta. O relogio avanca por quadro com limite: um engasgo do JS pausa
//   a animacao em vez de faze-la saltar (createStreakClock).

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppState, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { darkenColor } from '../utils/colorUtils';
import { getStreakPalette } from '../utils/streakColor';
import {
  createStreakClock,
  getStreakAnimationTracks,
  interpolateTrack,
  STREAK_NUMBER_LINE as LINE,
  STREAK_RING_BOX,
} from '../utils/streakAnimation';

export { STREAK_RING_BOX, STREAK_RING_MIN, STREAK_BLAZE_MIN, STREAK_CROSS_MIN } from '../utils/streakAnimation';

const BLAZE_SVG = 66;
const NUM_SIDE = 12;
const NUM_OUTLINE = 2;
const NUM_BASELINE = 11.5;
export const STREAK_EASINGS = {
  easeInOut: Easing.bezier(0.42, 0, 0.58, 1),
  roll: Easing.bezier(0.25, 0.9, 0.3, 1),
  linear: Easing.linear,
};

export default function StreakRing({
  play,
  from,
  to,
  size = STREAK_RING_BOX,
  contour = false,
  children,
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const timeline = useMemo(() => getStreakAnimationTracks(to, size), [to, size]);
  const mode = play ? timeline.mode : null;
  const palette = useMemo(() => getStreakPalette(to), [to]);
  // Milissegundos desde o disparo. E estado de proposito: ver o cabecalho.
  const [time, setTime] = useState(0);
  const clockRef = useRef(null);

  useEffect(() => {
    setTime(0);
    if (!mode) return undefined;
    const clock = createStreakClock({ setValue: setTime }, timeline.duration);
    clockRef.current = clock;
    const stop = () => {
      clock.cancel();
      setTime(timeline.duration);
    };
    if (AppState.currentState == null || AppState.currentState === 'active') {
      clock.start();
    } else {
      stop();
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stop();
    });
    return () => {
      clock.cancel();
      clockRef.current = null;
      subscription.remove();
    };
  }, [mode, play, from, to, timeline.duration]);

  const box = [styles.box, { width: size, height: size }];
  if (!mode) {
    return (
      <View style={box}>
        <View style={styles.icon}>{children}</View>
      </View>
    );
  }

  const at = (track) => interpolateTrack(track, time, STREAK_EASINGS);
  const half = size / 2;
  const numWidth = size + NUM_SIDE * 2;
  const blazeStyle = {
    position: 'absolute',
    left: (size - BLAZE_SVG) / 2,
    top: (size - BLAZE_SVG) / 2,
  };
  const number = timeline.number;
  const numStyle = {
    opacity: at(number.opacity),
    transform: [{ translateY: at(number.translateY) }],
  };
  const roll = at(number.roll);
  const rowOpacity = [at(number.previousOpacity), at(number.nextOpacity)];
  // GroupView do SVG Android troca o canvas ao alternar opacity entre 1 e
  // valores fracionarios. A transparencia vai na tinta, que nao cria essa
  // camada bitmap.
  const numberLines = (outline) => [from, to].map((value, index) => (
    <G key={index} fillOpacity={rowOpacity[index]} strokeOpacity={rowOpacity[index]}>
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
    </G>
  ));
  const blaze = timeline.blaze.map((ring) => ({
    ...ring,
    opacity: at(ring.opacity),
    dashOffset: at(ring.dashOffset),
    rotation: at(ring.rotation),
  }));

  return (
    <View style={box}>
      {/* As tres camadas existem sempre: disparar/trocar a fase nao remonta
          a imagem nem interrompe o brilho que esta tocando sobre ela. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
        {mode === 'blaze' ? (
          <Svg width={BLAZE_SVG} height={BLAZE_SVG} viewBox="-33 -33 66 66" style={blazeStyle}>
            {blaze.map((ring) => (
              <G key={ring.key} rotation={ring.rotation}>
                <Circle
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
              </G>
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
                <Circle
                  key={stroke.width}
                  cx={0}
                  cy={0}
                  r={half - 3.2}
                  fill="none"
                  stroke={`url(#${id}ember)`}
                  strokeOpacity={at(timeline.ring.opacity) * stroke.opacity}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeDasharray={[timeline.ring.circumference, timeline.ring.circumference]}
                  strokeDashoffset={at(timeline.ring.dashOffset)}
                />
              ))}
            </G>
          </Svg>
        ) : null}
        {mode === 'blaze' && contour ? (
          <Svg width={BLAZE_SVG} height={BLAZE_SVG} viewBox="-33 -33 66 66" style={blazeStyle}>
            <Circle cx={0} cy={0} r={23} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={blaze[0].opacity} />
          </Svg>
        ) : null}
        <View style={[styles.numOuter, numStyle]}>
          {/* A janela do preenchimento tem 15px. O contorno tem mais 2px em
              cada borda; o SVG externo precisa comportar esse halo. */}
          <Svg width={numWidth} height={LINE + NUM_OUTLINE * 2} viewBox={`0 ${-NUM_OUTLINE} ${numWidth} ${LINE + NUM_OUTLINE * 2}`} style={styles.numberSvg}>
            <Defs>
              <ClipPath id={`${id}fillWindow`}><Rect x={0} y={0} width={numWidth} height={LINE} /></ClipPath>
              <ClipPath id={`${id}outlineWindow`}><Rect x={0} y={-NUM_OUTLINE} width={numWidth} height={LINE + NUM_OUTLINE * 2} /></ClipPath>
            </Defs>
            <G clipPath={`url(#${id}outlineWindow)`}>
              <G translateY={roll}>{numberLines(true)}</G>
            </G>
            <G clipPath={`url(#${id}fillWindow)`}>
              <G translateY={roll}>{numberLines(false)}</G>
            </G>
          </Svg>
        </View>
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
