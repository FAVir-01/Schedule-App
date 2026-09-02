import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

const MAX_SCALE = 4;
const TAP_MOVE_TOLERANCE = 8;
const PINCH_SMOOTHING = 0.4;

const getTouchDistance = (touches) => {
  if (!touches || touches.length < 2) {
    return null;
  }

  const [firstTouch, secondTouch] = touches;
  const deltaX = secondTouch.pageX - firstTouch.pageX;
  const deltaY = secondTouch.pageY - firstTouch.pageY;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

const getTouchCenter = (touches) => {
  if (!touches || touches.length < 2) {
    return null;
  }

  const [firstTouch, secondTouch] = touches;
  return {
    pageX: (firstTouch.pageX + secondTouch.pageX) / 2,
    pageY: (firstTouch.pageY + secondTouch.pageY) / 2,
    localX: (firstTouch.locationX + secondTouch.locationX) / 2,
    localY: (firstTouch.locationY + secondTouch.locationY) / 2,
  };
};

function PinchToZoomImage({
  source,
  style,
  resizeMode = 'contain',
  onPress,
  accessibilityLabel,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const layoutRef = useRef({ width: 0, height: 0 });
  const gestureRef = useRef({
    pinchStartDistance: null,
    pinchStartPageX: null,
    pinchStartPageY: null,
    focalOffsetX: 0,
    focalOffsetY: 0,
    displayedScale: 1,
    displayedPageX: null,
    displayedPageY: null,
    didPinch: false,
    didMove: false,
  });

  const resetTransform = useCallback(() => {
    scale.stopAnimation();
    translateX.stopAnimation();
    translateY.stopAnimation();
    const springConfig = {
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      overshootClamping: true,
      useNativeDriver: true,
    };
    Animated.parallel([
      Animated.spring(scale, { ...springConfig, toValue: 1 }),
      Animated.spring(translateX, { ...springConfig, toValue: 0 }),
      Animated.spring(translateY, { ...springConfig, toValue: 0 }),
    ]).start();
  }, [scale, translateX, translateY]);

  useEffect(() => {
    scale.stopAnimation();
    translateX.stopAnimation();
    translateY.stopAnimation();
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, [scale, source?.uri, translateX, translateY]);

  useEffect(
    () => () => {
      scale.stopAnimation();
      translateX.stopAnimation();
      translateY.stopAnimation();
    },
    [scale, translateX, translateY]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Assume o toque desde o primeiro dedo para continuar recebendo o
        // gesto quando o segundo dedo entra na tela.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          // Uma nova interação pode começar antes de a mola anterior terminar.
          // Interrompê-la evita que ela dispute os mesmos valores com a pinça.
          scale.stopAnimation();
          translateX.stopAnimation();
          translateY.stopAnimation();
          scale.setValue(1);
          translateX.setValue(0);
          translateY.setValue(0);

          const touches = event.nativeEvent.touches;
          const pinchStartDistance = getTouchDistance(touches);
          const pinchStartCenter = getTouchCenter(touches);
          const { width, height } = layoutRef.current;
          gestureRef.current = {
            pinchStartDistance,
            pinchStartPageX: pinchStartCenter?.pageX ?? null,
            pinchStartPageY: pinchStartCenter?.pageY ?? null,
            focalOffsetX: pinchStartCenter ? pinchStartCenter.localX - width / 2 : 0,
            focalOffsetY: pinchStartCenter ? pinchStartCenter.localY - height / 2 : 0,
            displayedScale: 1,
            displayedPageX: pinchStartCenter?.pageX ?? null,
            displayedPageY: pinchStartCenter?.pageY ?? null,
            didPinch: Boolean(pinchStartDistance),
            didMove: false,
          };
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;
          const distance = getTouchDistance(touches);
          const touchCenter = getTouchCenter(touches);

          if (distance && touchCenter) {
            const gesture = gestureRef.current;
            gesture.didPinch = true;
            if (!gesture.pinchStartDistance) {
              const { width, height } = layoutRef.current;
              gesture.pinchStartDistance = distance;
              gesture.pinchStartPageX = touchCenter.pageX;
              gesture.pinchStartPageY = touchCenter.pageY;
              gesture.focalOffsetX = touchCenter.localX - width / 2;
              gesture.focalOffsetY = touchCenter.localY - height / 2;
              gesture.displayedScale = 1;
              gesture.displayedPageX = touchCenter.pageX;
              gesture.displayedPageY = touchCenter.pageY;
            }
            const targetScale = Math.max(
              1,
              Math.min(MAX_SCALE, distance / gesture.pinchStartDistance)
            );
            const nextScale =
              gesture.displayedScale +
              (targetScale - gesture.displayedScale) * PINCH_SMOOTHING;
            const nextPageX =
              gesture.displayedPageX +
              (touchCenter.pageX - gesture.displayedPageX) * PINCH_SMOOTHING;
            const nextPageY =
              gesture.displayedPageY +
              (touchCenter.pageY - gesture.displayedPageY) * PINCH_SMOOTHING;
            gesture.displayedScale = nextScale;
            gesture.displayedPageX = nextPageX;
            gesture.displayedPageY = nextPageY;
            // Mantém sob os dedos a região onde a pinça começou. A diferença
            // entre os pontos médios também permite deslocar o foco durante o
            // próprio gesto, em vez de ampliar sempre pelo centro da imagem.
            const nextTranslateX =
              nextPageX - gesture.pinchStartPageX +
              (1 - nextScale) * gesture.focalOffsetX;
            const nextTranslateY =
              nextPageY - gesture.pinchStartPageY +
              (1 - nextScale) * gesture.focalOffsetY;
            scale.setValue(nextScale);
            translateX.setValue(nextTranslateX);
            translateY.setValue(nextTranslateY);
            return;
          }

          if (
            Math.abs(gestureState.dx) > TAP_MOVE_TOLERANCE ||
            Math.abs(gestureState.dy) > TAP_MOVE_TOLERANCE
          ) {
            gestureRef.current.didMove = true;
          }
        },
        onPanResponderRelease: () => {
          const shouldHandlePress =
            !gestureRef.current.didPinch && !gestureRef.current.didMove;
          resetTransform();
          if (shouldHandlePress) {
            onPress?.();
          }
        },
        onPanResponderTerminate: resetTransform,
        onPanResponderTerminationRequest: () => false,
      }),
    [onPress, resetTransform, scale, translateX, translateY]
  );

  return (
    <Animated.Image
      {...panResponder.panHandlers}
      source={source}
      style={[style, { transform: [{ translateX }, { translateY }, { scale }] }]}
      resizeMode={resizeMode}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        layoutRef.current = { width, height };
      }}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={accessibilityLabel}
      onAccessibilityTap={onPress}
    />
  );
}

export default PinchToZoomImage;
