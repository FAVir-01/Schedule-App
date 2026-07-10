import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { USE_NATIVE_DRIVER } from '../constants/app';
import { styles } from '../styles/appStyles';

const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#3dd598', '#4d96ff', '#845ec2', '#ff8fab'];
const CONFETTI_COUNT = 30;
export const CONFETTI_DURATION_MS = 2200;

// Chuva de confete: peças caem do topo com balanço lateral, giro no eixo Z e
// "flip" 3D no eixo X, desaparecendo perto da base. Transforms nativos.
const ConfettiOverlay = React.memo(({ visible, onComplete }) => {
  const { width, height } = useWindowDimensions();
  const hasStartedRef = useRef(false);
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
        id: index,
        fall: new Animated.Value(-40 - Math.random() * 200),
        swayAnim: new Animated.Value(0),
        x: Math.random() * width,
        swayAmplitude: 10 + Math.random() * 18,
        swayDuration: 700 + Math.random() * 800,
        width: 5 + Math.random() * 5,
        height: 10 + Math.random() * 8,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        zTurns: (Math.random() * 2 + 1) * (Math.random() > 0.5 ? 360 : -360),
        xTurns: (Math.random() * 3 + 2) * 180,
        delay: Math.random() * 450,
        duration: 1900 + Math.random() * 900,
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

    const fallAnimations = pieces.map((piece) =>
      Animated.timing(piece.fall, {
        toValue: height + 60,
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

    const animation = Animated.parallel(fallAnimations);
    animation.start();
    swayLoops.forEach((loop) => loop.start());

    const timeoutId = setTimeout(() => {
      onComplete?.();
    }, CONFETTI_DURATION_MS + 1300);

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
              left: piece.x,
              width: piece.width,
              height: piece.height,
              backgroundColor: piece.color,
              opacity: piece.fall.interpolate({
                inputRange: [-240, height * 0.8, height + 60],
                outputRange: [1, 1, 0],
              }),
              transform: [
                { translateX: piece.swayAnim },
                { translateY: piece.fall },
                {
                  rotate: piece.fall.interpolate({
                    inputRange: [-240, height + 60],
                    outputRange: ['0deg', `${piece.zTurns}deg`],
                  }),
                },
                {
                  rotateX: piece.fall.interpolate({
                    inputRange: [-240, height + 60],
                    outputRange: ['0deg', `${piece.xTurns}deg`],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
});

export default ConfettiOverlay;
