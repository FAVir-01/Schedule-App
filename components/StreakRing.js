// Anel incandescente da sequencia.
//
// Aparece por 2,9s em volta do icone da tarefa quando a sequencia avanca,
// mostra o numero novo por baixo e some sem deixar rastro. O card volta
// exatamente ao que era — nenhum estado permanente e criado por este efeito.
//
// LINHA DO TEMPO (a partir do disparo):
//   0ms      o anel comeca a se desenhar no topo, no sentido horario
//   870ms    o anel fecha
//   1220ms   o numero aparece embaixo, ainda com o valor anterior
//   1450ms   o numero vira para o valor novo, deslizando uma linha para cima
//   2440ms   o numero sai
//   2900ms   o anel termina de se desenrolar pelo mesmo caminho e some
//
// A saida do anel nao e um fade: ele apaga na ordem em que acendeu, o que
// mantem a leitura de brasa esfriando em vez de camada sendo removida.
//
// No nosso card o icone e o emoji (34px) ou a foto redonda (46px) da tarefa,
// nao um desenho do SVG: ele entra como `children`, sempre dentro de uma caixa
// fixa de `size`, e o anel se desenha por fora dele. A caixa existe com ou sem
// anel, entao o layout da linha nao muda quando o efeito toca.
//
// `strokeDashoffset` e prop de SVG: anima no driver de JS (um anel por vez,
// custo desprezivel). O rolo do numero e o anel usam o mesmo relogio `p`.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { USE_NATIVE_DRIVER } from '../constants/app';

const ACircle = Animated.createAnimatedComponent(Circle);

export const STREAK_RING_BOX = 50; // caixa do icone no card
const STROKE = 3.2;
const DUR = 2900;

// Marcos da linha do tempo, em fracao da duracao total.
const T = {
  drawEnd: 0.3,
  holdEnd: 0.52,
  numIn: 0.42,
  numOut: 0.84,
};

const LINE = 13; // altura de uma linha do rolo; o deslize e exatamente isso

export default function StreakRing({
  play,
  from, // valor anterior da sequencia
  to, // valor novo
  size = STREAK_RING_BOX,
  children, // o icone da tarefa, desenhado dentro do anel
}) {
  const p = useRef(new Animated.Value(0)).current; // 0 -> 1 ao longo dos 2,9s
  const roll = useRef(new Animated.Value(0)).current; // 0 = mostra `from`, 1 = `to`
  const gradientId = useRef(`ember${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (!play) return undefined;
    p.setValue(0);
    roll.setValue(0);
    const clock = Animated.timing(p, {
      toValue: 1,
      duration: DUR,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    const flip = Animated.sequence([
      Animated.delay(1450),
      Animated.timing(roll, {
        toValue: 1,
        duration: 420,
        easing: Easing.bezier(0.25, 0.9, 0.3, 1),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    clock.start();
    flip.start();
    return () => {
      clock.stop();
      flip.stop();
    };
  }, [play, p, roll]);

  if (!play) {
    return <View style={[styles.box, { width: size, height: size }]}>{children}</View>;
  }

  const half = size / 2;
  const radius = half - STROKE;
  const circumference = 2 * Math.PI * radius;

  // O traco se desenha ate fechar, segura, e depois se desenrola pelo mesmo
  // caminho — o offset continua descendo ate -CIRC em vez de voltar.
  const dashOffset = p.interpolate({
    inputRange: [0, T.drawEnd, T.holdEnd, 1],
    outputRange: [circumference, 0, 0, -circumference],
    extrapolate: 'clamp',
  });
  const ringOpacity = p.interpolate({
    inputRange: [0, 0.08, 0.94, 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const numStyle = {
    opacity: p.interpolate({
      inputRange: [0, T.drawEnd, T.numIn, T.numOut, 1],
      outputRange: [0, 0, 1, 1, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateY: p.interpolate({
          inputRange: [T.drawEnd, T.numIn, T.numOut, 1],
          outputRange: [4, 0, 0, -3],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  // O rolo: dois valores empilhados, sobe exatamente uma linha.
  const rollStyle = {
    transform: [{ translateY: Animated.multiply(roll, -LINE) }],
  };

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {children}
      <Svg
        width={size}
        height={size}
        viewBox={`${-half} ${-half} ${size} ${size}`}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <Stop offset="0" stopColor="#D9551A" />
            <Stop offset="0.55" stopColor="#FFA93F" />
            <Stop offset="1" stopColor="#FFD89A" />
          </LinearGradient>
        </Defs>
        <ACircle
          cx={0}
          cy={0}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={dashOffset}
          opacity={ringOpacity}
          rotation={-90}
        />
      </Svg>

      <Animated.View style={[styles.rollWindow, numStyle]} pointerEvents="none">
        <Animated.View style={rollStyle}>
          <Text style={styles.digit}>{from}</Text>
          <Text style={styles.digit}>{to}</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollWindow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -9,
    height: LINE,
    overflow: 'hidden', // sem isto os dois numeros aparecem juntos
  },
  digit: {
    height: LINE,
    lineHeight: LINE,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#D8712C',
  },
});
