import React, { useEffect, useId, useMemo, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { getStreakPalette } from '../utils/streakColor';
import { getPolaroidFlamePaths, POLAROID_FLAME_HEIGHT } from '../utils/polaroidFlame';

// As duas molduras compartilham o relógio: o fogo acompanha a foto na ampliação.
const START_TIME = Date.now();
const FRAME_INTERVAL = 1000 / 24;
const STILL_PATHS = getPolaroidFlamePaths();

export default function PolaroidFlame({ size, streak, active = true, reduceMotion = false }) {
  const id = useId().replace(/:/g, '');
  const palette = useMemo(() => getStreakPalette(streak), [streak]);
  const paths = useRef(STILL_PATHS);
  const shapes = useRef([]);

  useEffect(() => {
    let frameId = null;
    let lastFrame = 0;
    let disposed = false;
    const draw = (next) => {
      paths.current = next;
      [next.crest, next.crest, next.edge, next.core, next.crest].forEach((d, index) => {
        shapes.current[index]?.setNativeProps({ d });
      });
    };
    const stop = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };
    const animate = () => {
      if (disposed) return;
      const now = Date.now();
      if (now - lastFrame >= FRAME_INTERVAL) {
        draw(getPolaroidFlamePaths((now - START_TIME) / 1000));
        lastFrame = now;
      }
      frameId = requestAnimationFrame(animate);
    };
    const sync = (state) => {
      stop();
      if (active && !reduceMotion && (state === 'active' || state == null)) {
        animate();
      }
    };

    if (reduceMotion) draw(STILL_PATHS);
    sync(AppState.currentState);
    const subscription = AppState.addEventListener('change', sync);
    return () => {
      disposed = true;
      stop();
      subscription.remove();
    };
  }, [active, reduceMotion]);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.flame, { width: size, height: size * POLAROID_FLAME_HEIGHT / 100 }]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 100 ${POLAROID_FLAME_HEIGHT}`}>
        <Defs>
          <LinearGradient id={`${id}edge`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={palette.ringStart} stopOpacity="0.85" />
            <Stop offset="0.6" stopColor={palette.accent} />
            <Stop offset="1" stopColor={palette.ringMid} />
          </LinearGradient>
          <LinearGradient id={`${id}core`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={palette.ringMid} />
            <Stop offset="0.68" stopColor={palette.ringEnd} />
            <Stop offset="1" stopColor={palette.ringEnd} stopOpacity="0.25" />
          </LinearGradient>
        </Defs>
        {/* Contornos translúcidos formam o halo de luz ao redor da chama. */}
        <Path
          ref={(node) => { shapes.current[0] = node; }}
          d={paths.current.crest}
          fill="none"
          stroke={palette.accent}
          strokeWidth={7}
          strokeOpacity={0.09}
          strokeLinejoin="round"
        />
        <Path
          ref={(node) => { shapes.current[1] = node; }}
          d={paths.current.crest}
          fill="none"
          stroke={palette.ringMid}
          strokeWidth={3.6}
          strokeOpacity={0.2}
          strokeLinejoin="round"
        />
        <Path
          ref={(node) => { shapes.current[2] = node; }}
          d={paths.current.edge}
          fill={`url(#${id}edge)`}
        />
        <Path
          ref={(node) => { shapes.current[3] = node; }}
          d={paths.current.core}
          fill={`url(#${id}core)`}
        />
        <Path
          ref={(node) => { shapes.current[4] = node; }}
          d={paths.current.crest}
          fill="none"
          stroke={palette.ringEnd}
          strokeWidth={0.45}
          strokeOpacity={0.65}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  flame: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
});
