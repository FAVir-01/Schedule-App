// Frasco de nitrogenio (erlenmeyer) do sistema de congelamento.
// Mostra o estoque de gelo restante: 3/3, 2/3, 1/3 ou 0/3.
//
// Onde fica: dentro da linha do card, imediatamente antes do botao de
// confirmacao, com 12px de folga fixa entre o slot e o botao. Nunca no canto
// inferior direito — ali ele encosta no botao.
//
// A animacao segue o desenho original em Reanimated, transcrita para o
// `Animated` do RN (o selo de marco usa o mesmo motor): a curva e aplicada em
// cada trecho, nao no percurso inteiro — uma interpolacao unica apagaria o
// balanco duplo.

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { STREAK_FREEZE_MAX, USE_NATIVE_DRIVER } from '../constants/app';

// ---------------------------------------------------------------------------
// Geometria do frasco
// ---------------------------------------------------------------------------
// Erlenmeyer: gargalo reto ocupando o terco superior, aro saliente no topo,
// corpo abrindo em cone ate a base com o pe levemente arredondado.

const VIEW_BOX = '-24 -32 48 60';

const BODY =
  'M-5,-26 L-5,-11 L-16.5,16 A5,5 0 0 0 -12,22 ' +
  'L12,22 A5,5 0 0 0 16.5,16 L5,-11 L5,-26';

const BODY_CLOSED = BODY + ' Z';

const RIM = 'M-9.5,-26 L9.5,-26';

const STROKE = '#1F6FAE';
const STROKE_EMPTY = '#D93B3B';
export const FREEZE_COUNT_COLOR = '#2A7FC4';
export const FREEZE_COUNT_EMPTY_COLOR = STROKE_EMPTY;

// Altura do topo do liquido, por nivel. y cresce para baixo; a base e 22.
const LIQUID_TOP = { 3: -9, 2: 2, 1: 11 };

// ---------------------------------------------------------------------------
// Entrada — "vem da esquerda, girado"
// ---------------------------------------------------------------------------
// Mesma familia de movimento do selo de marco: ultrapassa o destino, volta
// num segundo balanco menor e assenta. A diferenca e a direcao: o frasco
// nasce a esquerda, entao em nenhum instante ele viaja sobre o botao.
// A ultrapassagem maxima para a direita e de 3px, contra 12px de folga.

const EASE = Easing.bezier(0.3, 1.25, 0.5, 1);

const KEYS = {
  start: { x: -24, rot: -30, scale: 0.85 },
  overshoot: { x: 3, rot: 7, scale: 1.05 },
  settle: { x: -1, rot: -3, scale: 0.98 },
  rest: { x: 0, rot: 0, scale: 1 },
};
const STOPS = [0, 1, 2, 3];
const KEY_LIST = [KEYS.start, KEYS.overshoot, KEYS.settle, KEYS.rest];

const T = { toOvershoot: 744, toSettle: 240, toRest: 216, fadeIn: 264 };

const COUNT_DELAY = 1150; // o numero entra quando o frasco ja assentou
const COUNT_HOLD = 2600; // quanto tempo ele fica antes de sair
const COUNT_OUT = 420;

// ---------------------------------------------------------------------------

export function FlaskShape({ level, size = 20 }) {
  // Ids unicos por instancia: dois frascos na mesma tela nao podem disputar o
  // mesmo clipPath.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clipId = `flaskClip${id}`;
  const liquidId = `flaskLiquid${id}`;
  const empty = level <= 0;
  const stroke = empty ? STROKE_EMPTY : STROKE;
  const top = LIQUID_TOP[Math.min(level, STREAK_FREEZE_MAX)];

  return (
    <Svg width={size} height={size * 1.15} viewBox={VIEW_BOX}>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={BODY_CLOSED} />
        </ClipPath>
        <LinearGradient id={liquidId} x1="0%" y1="100%" x2="35%" y2="0%">
          <Stop offset="0" stopColor="#3F9FD8" />
          <Stop offset="0.55" stopColor="#79CCF3" />
          <Stop offset="1" stopColor="#C6EFFF" />
        </LinearGradient>
      </Defs>

      {!empty && (
        <Rect
          x={-17}
          y={top}
          width={34}
          height={22 - top}
          fill={`url(#${liquidId})`}
          clipPath={`url(#${clipId})`}
        />
      )}

      <Path
        d={BODY}
        fill="none"
        stroke={stroke}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path d={RIM} stroke={stroke} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * <FreezeFlask remaining={2} autoPlay />
 *
 * remaining: gelos restantes (0 a 3).
 * autoPlay:  dispara a entrada ao montar. Use true so na transicao para o
 *            estado "descongelando"; ao entrar na tela com o card ja em
 *            degelo, monte sem autoPlay e deixe o frasco parado.
 */
export default function FreezeFlask({
  remaining = 0,
  size = 20,
  autoPlay = false,
  reduceMotion = false,
  accessibilityLabel,
}) {
  const p = useRef(new Animated.Value(3)).current; // 0 = fora, 3 = assentado
  const opacity = useRef(new Animated.Value(1)).current;
  const countOpacity = useRef(new Animated.Value(0)).current;
  const runningRef = useRef([]);

  const stop = useCallback(() => {
    runningRef.current.forEach((animation) => animation.stop());
    runningRef.current = [];
  }, []);

  const play = useCallback(() => {
    stop();
    countOpacity.setValue(0);
    const count = Animated.sequence([
      Animated.delay(COUNT_DELAY),
      Animated.timing(countOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.delay(COUNT_HOLD),
      Animated.timing(countOpacity, {
        toValue: 0,
        duration: COUNT_OUT,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    if (reduceMotion) {
      p.setValue(3);
      opacity.setValue(1);
      runningRef.current = [count];
      count.start();
      return;
    }
    p.setValue(0);
    opacity.setValue(0);
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: T.fadeIn,
      easing: Easing.linear,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    const slide = Animated.sequence([
      Animated.timing(p, {
        toValue: 1,
        duration: T.toOvershoot,
        easing: EASE,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(p, {
        toValue: 2,
        duration: T.toSettle,
        easing: EASE,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(p, {
        toValue: 3,
        duration: T.toRest,
        easing: EASE,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    runningRef.current = [fade, slide, count];
    fade.start();
    slide.start();
    count.start();
  }, [countOpacity, opacity, p, reduceMotion, stop]);

  useEffect(() => {
    if (autoPlay) {
      play();
    }
    // So na montagem: quem monta o frasco decide se e uma transicao.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => stop, [stop]);

  const flaskStyle = {
    opacity,
    transform: [
      {
        translateX: p.interpolate({
          inputRange: STOPS,
          outputRange: KEY_LIST.map((key) => key.x),
        }),
      },
      {
        rotate: p.interpolate({
          inputRange: STOPS,
          outputRange: KEY_LIST.map((key) => `${key.rot}deg`),
        }),
      },
      {
        scale: p.interpolate({
          inputRange: STOPS,
          outputRange: KEY_LIST.map((key) => key.scale),
        }),
      },
    ],
  };

  return (
    <View style={styles.slot}>
      <Animated.Text
        style={[styles.count, remaining <= 0 && styles.countEmpty, { opacity: countOpacity }]}
      >
        {`${remaining}/${STREAK_FREEZE_MAX}`}
      </Animated.Text>

      <Pressable
        onPress={(event) => {
          event.stopPropagation?.();
          play();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Animated.View style={flaskStyle}>
          <FlaskShape level={remaining} size={size} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 12, // folga fixa ate o botao de confirmacao
    minWidth: 44, // reserva o espaco do numero, para o botao nao escorregar
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  count: { fontSize: 12, fontWeight: '600', color: FREEZE_COUNT_COLOR },
  countEmpty: { color: FREEZE_COUNT_EMPTY_COLOR },
});
