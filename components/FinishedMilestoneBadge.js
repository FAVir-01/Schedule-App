import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Polygon,
  Stop,
} from 'react-native-svg';
import { USE_NATIVE_DRIVER } from '../constants/app';

const SEAL_SIZE = 22;
const MESSAGE_GAP = 7;

// Entrada do selo: 1,2s divididos nas mesmas paradas do desenho original
// (chegada -> ultrapassagem -> contra-balanco -> assentamento). As paradas
// ficam em fracao do progresso para que a sequencia de timings e as
// interpolacoes nunca saiam de sincronia.
const SLIDE_DURATION_MS = 1200;
const SLIDE_OPACITY_STOP = 0.2;
const SLIDE_OVERSHOOT_STOP = 0.62;
const SLIDE_SETTLE_BACK_STOP = 0.82;
const SLIDE_TRAVEL = 30;
// Em tela estreita o selo cruzaria o botao de check durante a viagem, entao a
// distancia inicial encolhe.
const SLIDE_TRAVEL_NARROW = 20;
const NARROW_SCREEN_WIDTH = 380;

const MESSAGE_DELAY_MS = 300;
const MESSAGE_IN_MS = 400;
const MESSAGE_HOLD_MS = 3500;
const MESSAGE_OUT_MS = 600;
const MESSAGE_ENTER_SHIFT = -10;
const MESSAGE_EXIT_SHIFT = 8;
// A frase e filha absoluta de uma caixa de 22px. No CSS ela transbordaria em
// shrink-to-fit, mas o Yoga mede a caixa absoluta contra a largura do pai e a
// frase sairia reticenciada ("10..."). Entao a largura vem do proprio texto,
// acompanhando a fonte ampliada do sistema.
const MESSAGE_CHAR_WIDTH = 7.2;
const MESSAGE_MIN_WIDTH = 48;

const SEAL_STROKE = '#1F6FAE';
const MESSAGE_COLOR = '#1F6FAE';
const SEAL_POINTS =
  '0,-24 6.89,-16.63 16.97,-16.97 16.63,-6.89 24,0 16.63,6.89 16.97,16.97 6.89,16.63 ' +
  '0,24 -6.89,16.63 -16.97,16.97 -16.63,6.89 -24,0 -16.63,-6.89 -16.97,-16.97 -6.89,-16.63';
const SPARK_PATH =
  'M0,-11 C.9,-3.7 3.7,-.9 11,0 C3.7,.9 .9,3.7 0,11 C-.9,3.7 -3.7,.9 -11,0 C-3.7,-.9 -.9,-3.7 0,-11 Z';

let sealGradientSequence = 0;

function MetallicSeal({ animatedStyle }) {
  // Um id por instancia: o react-native-svg resolve `url(#id)` de forma global
  // e varios cards na mesma lista herdariam o primeiro gradiente montado.
  const gradientId = useMemo(() => {
    sealGradientSequence += 1;
    return `finished-seal-${sealGradientSequence}`;
  }, []);

  return (
    <Animated.View style={animatedStyle}>
      <Svg width={SEAL_SIZE} height={SEAL_SIZE} viewBox="-28 -28 56 56">
        <Defs>
          <SvgLinearGradient id={gradientId} x1="10%" y1="0%" x2="30%" y2="100%">
            <Stop offset="0" stopColor="#DFF3FF" />
            <Stop offset="0.3" stopColor="#5FB0E8" />
            <Stop offset="0.48" stopColor="#FFFFFF" />
            <Stop offset="0.54" stopColor="#1F6FAE" />
            <Stop offset="0.8" stopColor="#8FCDF2" />
            <Stop offset="1" stopColor="#14507F" />
          </SvgLinearGradient>
        </Defs>
        <Polygon
          points={SEAL_POINTS}
          fill={`url(#${gradientId})`}
          stroke={SEAL_STROKE}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <Path d={SPARK_PATH} fill="#FFFFFF" />
      </Svg>
    </Animated.View>
  );
}

export default function FinishedMilestoneBadge({
  value,
  message,
  animationToken = 0,
  reduceMotion = false,
  accessibilityLabel,
  style,
}) {
  const { width: windowWidth, fontScale } = useWindowDimensions();
  // Repouso e 1: o selo fica assentado e visivel sem depender de animacao, que
  // e o estado de quem apenas abriu a tela ou o dia no calendario.
  const slide = useRef(new Animated.Value(1)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const slideAnimationRef = useRef(null);
  const revealAnimationRef = useRef(null);
  const previousAnimationTokenRef = useRef(animationToken);
  const slideTravel = windowWidth < NARROW_SCREEN_WIDTH ? SLIDE_TRAVEL_NARROW : SLIDE_TRAVEL;
  const messageWidth = useMemo(
    () =>
      Math.ceil(
        Math.max(MESSAGE_MIN_WIDTH, String(message ?? '').length * MESSAGE_CHAR_WIDTH * (fontScale || 1))
      ),
    [fontScale, message]
  );

  const stopAnimations = useCallback(() => {
    slideAnimationRef.current?.stop();
    revealAnimationRef.current?.stop();
    slideAnimationRef.current = null;
    revealAnimationRef.current = null;
  }, []);

  // A frase e o unico elemento que anima no toque: o selo ja esta assentado.
  const playMessage = useCallback(
    (delayMs) => {
      revealAnimationRef.current?.stop();
      reveal.setValue(0);
      revealAnimationRef.current = Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(reveal, {
          toValue: 1,
          duration: MESSAGE_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.delay(MESSAGE_HOLD_MS),
        Animated.timing(reveal, {
          toValue: 2,
          duration: MESSAGE_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]);
      revealAnimationRef.current.start();
    },
    [reveal]
  );

  const playEntrance = useCallback(() => {
    stopAnimations();

    if (reduceMotion) {
      slide.setValue(1);
      playMessage(MESSAGE_DELAY_MS);
      return;
    }

    slide.setValue(0);
    slideAnimationRef.current = Animated.sequence([
      Animated.timing(slide, {
        toValue: SLIDE_OVERSHOOT_STOP,
        duration: SLIDE_DURATION_MS * SLIDE_OVERSHOOT_STOP,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(slide, {
        toValue: SLIDE_SETTLE_BACK_STOP,
        duration: SLIDE_DURATION_MS * (SLIDE_SETTLE_BACK_STOP - SLIDE_OVERSHOOT_STOP),
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(slide, {
        toValue: 1,
        duration: SLIDE_DURATION_MS * (1 - SLIDE_SETTLE_BACK_STOP),
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    slideAnimationRef.current.start();
    playMessage(SLIDE_DURATION_MS + MESSAGE_DELAY_MS);
  }, [playMessage, reduceMotion, slide, stopAnimations]);

  // Dois gatilhos, so: a virada de nao-concluida para concluida no botao de
  // check (o card troca o token) e o toque direto no selo. Abrir a tela nunca
  // dispara nada.
  useEffect(() => {
    if (previousAnimationTokenRef.current !== animationToken) {
      previousAnimationTokenRef.current = animationToken;
      if (value) {
        playEntrance();
      }
    }
  }, [animationToken, playEntrance, value]);

  useEffect(() => () => stopAnimations(), [stopAnimations]);

  if (!value) {
    return null;
  }

  const sealAnimatedStyle = {
    opacity: slide.interpolate({
      inputRange: [0, SLIDE_OPACITY_STOP, 1],
      outputRange: [0, 1, 1],
    }),
    transform: [
      {
        translateX: slide.interpolate({
          inputRange: [0, SLIDE_OVERSHOOT_STOP, SLIDE_SETTLE_BACK_STOP, 1],
          outputRange: [slideTravel, -4, 1, 0],
        }),
      },
      {
        rotate: slide.interpolate({
          inputRange: [0, SLIDE_OVERSHOOT_STOP, SLIDE_SETTLE_BACK_STOP, 1],
          outputRange: ['40deg', '-8deg', '3deg', '0deg'],
        }),
      },
      {
        scale: slide.interpolate({
          inputRange: [0, SLIDE_OVERSHOOT_STOP, SLIDE_SETTLE_BACK_STOP, 1],
          outputRange: [0.85, 1.05, 0.98, 1],
        }),
      },
    ],
  };
  // A frase flutua sobre o card: fora do fluxo, entrar ou sair dela nao empurra
  // a frequencia, nao move o botao de check e nao muda a altura da linha.
  const messageAnimatedStyle = {
    opacity: reveal.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [0, 1, 0],
    }),
    transform: reduceMotion
      ? []
      : [
          {
            translateX: reveal.interpolate({
              inputRange: [0, 1, 2],
              outputRange: [MESSAGE_ENTER_SHIFT, 0, MESSAGE_EXIT_SHIFT],
            }),
          },
        ],
  };

  return (
    <View style={[{ width: SEAL_SIZE, height: SEAL_SIZE }, style]}>
      <Pressable
        onPress={(event) => {
          event.stopPropagation?.();
          playMessage(0);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={6}
      >
        <MetallicSeal animatedStyle={sealAnimatedStyle} />
      </Pressable>
      {message ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: SEAL_SIZE + MESSAGE_GAP,
              top: 0,
              bottom: 0,
              width: messageWidth,
              justifyContent: 'center',
            },
            messageAnimatedStyle,
          ]}
        >
          <Text
            style={{
              color: MESSAGE_COLOR,
              fontSize: 12,
              lineHeight: 16,
              fontWeight: '600',
            }}
            numberOfLines={1}
          >
            {message}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export { MESSAGE_HOLD_MS, SEAL_SIZE, SLIDE_DURATION_MS };
