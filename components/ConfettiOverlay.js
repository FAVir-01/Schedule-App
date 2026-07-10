import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { USE_NATIVE_DRIVER } from '../constants/app';
import { styles } from '../styles/appStyles';

const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#845ec2'];
const CONFETTI_COUNT = 32;
export const CONFETTI_DURATION_MS = 2400;

const ConfettiOverlay = React.memo(({ visible, onComplete }) => {
  const { width, height } = useWindowDimensions();
  const hasStartedRef = useRef(false);
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
        id: `${Date.now()}-${index}`,
        baseX: new Animated.Value(Math.random() * width),
        size: 6 + Math.random() * 6,
        delay: Math.random() * 400,
        rotate: Math.random() * 120,
        heightRatio: Math.random() > 0.5 ? 1.5 : 0.8,
        rotationTurns: 360 * (Math.random() * 4 + 1),
        swayAmplitude: 12 + Math.random() * 18,
        swayDuration: 800 + Math.random() * 900,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        anim: new Animated.Value(-20 - Math.random() * 120),
        swayAnim: new Animated.Value(0),
        scaleAnim: new Animated.Value(Math.random() * 0.5 + 0.5),
        duration: CONFETTI_DURATION_MS + Math.random() * 1000,
      })),
    [width]
  );

  useEffect(() => {
    if (!visible) {
      hasStartedRef.current = false;
      return undefined;
    }
    if (hasStartedRef.current) {
      return undefined;
    }
    hasStartedRef.current = true;

    const animations = pieces.map((piece) =>
      Animated.timing(piece.anim, {
        toValue: height + 100,
        duration: piece.duration,
        delay: piece.delay,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );
    const swayLoops = pieces.map((piece) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(piece.swayAnim, {
            toValue: piece.swayAmplitude,
            duration: piece.swayDuration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(piece.swayAnim, {
            toValue: -piece.swayAmplitude,
            duration: piece.swayDuration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ])
      )
    );

    const animation = Animated.stagger(40, animations);
    animation.start();
    swayLoops.forEach((loop) => loop.start());

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, CONFETTI_DURATION_MS + 1500);

    return () => {
      animation.stop();
      swayLoops.forEach((loop) => loop.stop());
      clearTimeout(timeoutId);
    };
  }, [height, onComplete, pieces, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.confettiContainer}>
      {pieces.map((piece) => (
        <Animated.View
          key={piece.id}
          style={[
            styles.confettiPiece,
            {
              width: piece.size,
              height: piece.size * piece.heightRatio,
              backgroundColor: piece.color,
              opacity: 0.8,
              transform: [
                { translateX: Animated.add(piece.baseX, piece.swayAnim) },
                { translateY: piece.anim },
                {
                  rotate: piece.anim.interpolate({
                    inputRange: [0, height],
                    outputRange: ['0deg', `${piece.rotationTurns}deg`],
                  }),
                },
                { scale: piece.scaleAnim },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
});

export default ConfettiOverlay;
