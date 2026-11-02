// Chama da sequencia, no lugar do icone de fogo.
//
// Forma por nivel e cor pela paleta da sequencia: utils/streakFlame.js. Aqui
// e o desenho e o movimento.
//
// POR QUE TRES SVG EMPILHADOS
//   O Animated no SVG do Fabric deixa "fantasma" (ver StreakRing). Cada camada
//   que se mexe sozinha mora no proprio SVG, dentro de uma Animated.View; a
//   View o native driver anima sem passar pelo JS, e o desenho nunca muda.

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { darkenColor } from '../utils/colorUtils';
import { getStreakPalette } from '../utils/streakColor';
import {
  getStreakFlameColors,
  getStreakFlameLevel,
  getStreakFlameShape,
  STREAK_FLAME_BOX,
  STREAK_FLAME_MOTION as MOTION,
} from '../utils/streakFlame';

const ORIGIN = '50% 92%';
const wave = Easing.inOut(Easing.sin);

// Vai e volta pelo periodo inteiro; o native driver repete sem o JS.
const useLoop = (period, active) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: period / 2, easing: wave, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: period / 2, easing: wave, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, period, value]);
  return value;
};

const useReduceMotion = () => {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => { if (mounted) setReduce(Boolean(value)); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);
  return reduce;
};

export default function StreakFlame({ streak, size = 14, animated = true, style }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  // Quem passa a chama ja tem sequencia; sem ela, o primeiro nivel.
  const level = Math.max(1, getStreakFlameLevel(streak));
  const shape = useMemo(() => getStreakFlameShape(level), [level]);
  const colors = useMemo(
    () => getStreakFlameColors(getStreakPalette(streak), level, darkenColor),
    [level, streak]
  );
  const reduceMotion = useReduceMotion();
  const active = animated && !reduceMotion;

  const breathe = useLoop(MOTION.breathe.period, active);
  const sway = useLoop(MOTION.sway.period, active);
  const lick = useLoop(MOTION.lick.period, active);
  const pulse = useLoop(MOTION.pulse.period, active);

  const box = { width: size, height: size };
  const layer = [StyleSheet.absoluteFill, { transformOrigin: ORIGIN }];
  const svgProps = { width: size, height: size, viewBox: `0 0 ${STREAK_FLAME_BOX} ${STREAK_FLAME_BOX}` };
  const gradient = (key, [top, mid, bottom]) => (
    <LinearGradient id={`${id}${key}`} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={top} />
      <Stop offset="0.5" stopColor={mid} />
      <Stop offset="1" stopColor={bottom} />
    </LinearGradient>
  );

  return (
    <View
      style={[box, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[layer, {
          transform: [
            { scaleX: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, MOTION.breathe.scaleX] }) },
            { scaleY: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, MOTION.breathe.scaleY] }) },
          ],
        }]}
      >
        <Animated.View
          style={[layer, {
            transform: [{
              skewX: sway.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [`${MOTION.sway.skew[0]}deg`, '0deg', `${MOTION.sway.skew[1]}deg`],
              }),
            }],
          }]}
        >
          <Svg {...svgProps} style={StyleSheet.absoluteFill}>
            <Defs>
              {gradient('outer', colors.outer)}
            </Defs>
            {shape.tongues.map((d, index) => (
              <Path key={index} d={d} fill={`url(#${id}outer)`} stroke={colors.outline} strokeWidth={0.7} strokeLinejoin="round" />
            ))}
            <Path d={shape.outer} fill={`url(#${id}outer)`} stroke={colors.outline} strokeWidth={0.7} strokeLinejoin="round" />
            {shape.embers.map((ember, index) => (
              <Circle key={index} cx={ember.cx} cy={ember.cy} r={ember.r} fill={colors.ember} />
            ))}
          </Svg>

          {shape.inner ? (
            <Animated.View
              style={[layer, {
                transform: [
                  { scaleX: lick.interpolate({ inputRange: [0, 1], outputRange: [1, MOTION.lick.scaleX] }) },
                  { scaleY: lick.interpolate({ inputRange: [0, 1], outputRange: [1, MOTION.lick.scaleY] }) },
                ],
              }]}
            >
              <Svg {...svgProps} style={StyleSheet.absoluteFill}>
                <Defs>{gradient('inner', colors.inner)}</Defs>
                <Path d={shape.inner} fill={`url(#${id}inner)`} />
              </Svg>
            </Animated.View>
          ) : null}

          <Animated.View
            style={[layer, {
              transform: [
                { scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [MOTION.pulse.from[0], MOTION.pulse.to[0]] }) },
                { scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [MOTION.pulse.from[1], MOTION.pulse.to[1]] }) },
              ],
            }]}
          >
            <Svg {...svgProps} style={StyleSheet.absoluteFill}>
              <Defs>{gradient('core', colors.core)}</Defs>
              <Path d={shape.core} fill={`url(#${id}core)`} />
            </Svg>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
