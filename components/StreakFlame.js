// Chama da sequencia, no lugar do icone de fogo.
//
// Forma por nivel e cor pela paleta da sequencia: utils/streakFlame.js. Aqui
// e o desenho e o movimento.
//
// POR QUE TRES SVG EMPILHADOS
//   O Animated no SVG do Fabric deixa "fantasma" (ver StreakRing). Cada grupo
//   de camadas que se mexe sozinho mora no proprio SVG, dentro de uma
//   Animated.View; a View o native driver anima sem passar pelo JS, e o
//   desenho nunca muda.

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { darkenColor } from '../utils/colorUtils';
import { getStreakPalette } from '../utils/streakColor';
import {
  getStreakFlameColors,
  getStreakFlameLevel,
  getStreakFlameShape,
  STREAK_FLAME_BOX,
  STREAK_FLAME_MOTION as MOTION,
  STREAK_FLAME_ORIGIN,
  STREAK_FLAME_OUTLINE,
} from '../utils/streakFlame';

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

const scaleBetween = (value, [fromX, fromY], [toX, toY]) => [
  { scaleX: value.interpolate({ inputRange: [0, 1], outputRange: [fromX, toX] }) },
  { scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [fromY, toY] }) },
];

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

  const layer = [StyleSheet.absoluteFill, { transformOrigin: STREAK_FLAME_ORIGIN }];
  const svgProps = {
    width: size,
    height: size,
    viewBox: `0 0 ${STREAK_FLAME_BOX} ${STREAK_FLAME_BOX}`,
    style: StyleSheet.absoluteFill,
  };
  const gradient = (key) => {
    const stops = colors[key];
    return (
      <LinearGradient key={key} id={`${id}${key}`} x1="0" y1="0" x2="0" y2="1">
        {stops.map((color, index) => (
          <Stop key={index} offset={index / (stops.length - 1)} stopColor={color} />
        ))}
      </LinearGradient>
    );
  };
  const fill = (key) => `url(#${id}${key})`;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[layer, {
          transform: [
            ...scaleBetween(breathe, [1, 1], [MOTION.breathe.scaleX, MOTION.breathe.scaleY]),
            {
              rotate: sway.interpolate({
                inputRange: [0, 1],
                outputRange: MOTION.sway.rotate.map((deg) => `${deg}deg`),
              }),
            },
          ],
        }]}
      >
        <Svg {...svgProps}>
          <Defs>{gradient('outer')}</Defs>
          {shape.glow ? <Path d={shape.glow} fill={colors.glow} fillOpacity={0.28} /> : null}
          {/* Contorno por baixo do preenchimento, como o paint-order da
              referencia: so a metade de fora aparece. */}
          <Path
            d={shape.outer}
            fill="none"
            stroke={colors.outline}
            strokeWidth={STREAK_FLAME_OUTLINE}
            strokeLinejoin="round"
          />
          <Path d={shape.outer} fill={fill('outer')} />
        </Svg>

        {shape.mid || shape.inner ? (
          <Animated.View
            style={[layer, { transform: scaleBetween(lick, [1, 1], [MOTION.lick.scaleX, MOTION.lick.scaleY]) }]}
          >
            <Svg {...svgProps}>
              <Defs>
                {shape.mid ? gradient('mid') : null}
                {shape.inner ? gradient('inner') : null}
              </Defs>
              {shape.mid ? <Path d={shape.mid} fill={fill('mid')} /> : null}
              {shape.inner ? <Path d={shape.inner} fill={fill('inner')} /> : null}
            </Svg>
          </Animated.View>
        ) : null}

        <Animated.View
          style={[layer, { transform: scaleBetween(pulse, MOTION.pulse.from, MOTION.pulse.to) }]}
        >
          <Svg {...svgProps}>
            <Defs>{gradient('core')}</Defs>
            <Path d={shape.core} fill={fill('core')} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
