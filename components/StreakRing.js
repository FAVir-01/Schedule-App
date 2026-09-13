// Anel incandescente da sequencia.
//
// Aparece por 2,9s em volta do icone da tarefa quando a sequencia avanca,
// mostra o numero novo por baixo e some sem deixar rastro. O card volta
// exatamente ao que era — nenhum estado permanente e criado por este efeito.
//
// LINHA DO TEMPO (a partir do disparo):
//   0ms      o anel comeca a se desenhar no topo, no sentido horario
//   676ms    o numero comeca a subir de 4px abaixo, ainda com o valor anterior
//   870ms    o anel fecha
//   988ms    o numero esta no lugar, totalmente visivel
//   1200ms   o numero vira para o valor novo, deslizando uma linha para cima
//   2184ms   o numero comeca a sair, 3px para cima
//   2600ms   o numero sumiu
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
// O NUMERO
//   12,5px peso 800, contornado de branco com 2px, centrado logo abaixo da
//   foto e com 12px de folga para cada lado da caixa (cabe quatro digitos).
//   O contorno e o mesmo texto desenhado por baixo em SVG, tracado de branco
//   com o dobro da espessura (metade fica dentro da letra) — o RN nao tem
//   contorno de texto e so aceita uma sombra. Dois niveis: o de fora carrega
//   opacidade e deslocamento com overflow visivel; a janela de dentro, de
//   15px, recorta o rolo. Com um nivel so o contorno e cortado em cima e
//   embaixo. O numero tem relogio proprio de 2,6s, no driver nativo.
//
// `strokeDashoffset` e prop de SVG: anima no driver de JS (um anel por vez,
// custo desprezivel).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { USE_NATIVE_DRIVER } from '../constants/app';
import { darkenColor } from '../utils/colorUtils';
import { getStreakPalette } from '../utils/streakColor';

const ACircle = Animated.createAnimatedComponent(Circle);

export const STREAK_RING_BOX = 50; // caixa do icone no card
// O traco engrossou de 3,2 para 4 sem mudar de lugar: o raio segue medido
// pelo recuo antigo, entao o anel cresce meio pixel para cada lado.
const STROKE = 4;
const RING_INSET = 3.2;
// Brilho: o mesmo anel, mais largo e quase transparente, por baixo do traco.
// Sem filtro de blur (react-native-svg nao garante no Android), e o que da
// a leitura de brasa acesa em vez de linha chapada.
const GLOW_STROKE = 6.4; // borda externa encosta na caixa de 50, sem cortar
const GLOW_OPACITY = 0.22;
const DUR = 2900;

// Marcos da linha do tempo do anel, em fracao da duracao total.
const T = {
  drawEnd: 0.3,
  holdEnd: 0.52,
};

// Numero
const NUM_DUR = 2600;
const LINE = 15; // altura de uma linha do rolo; o deslize e exatamente isso
const NUM_SIDE = 12; // folga alem da caixa, de cada lado
const NUM_FONT = 12.5;
const NUM_BASELINE = 11.5; // linha de base dentro dos 15px
// A janela termina 10px abaixo da caixa: o centro do texto fica 4,5px abaixo
// da borda da foto (46px numa caixa de 50), o contorno branco encostando na
// foto como um selo. Cabe nos 14px de padding do card.
const NUM_BOTTOM = -10;
const ROLL_DELAY = 1200;
const ROLL_DUR = 420;

export default function StreakRing({
  play,
  from, // valor anterior da sequencia
  to, // valor novo
  size = STREAK_RING_BOX,
  children, // o icone da tarefa, desenhado dentro do anel
}) {
  const p = useRef(new Animated.Value(0)).current; // 0 -> 1 ao longo dos 2,9s
  const num = useRef(new Animated.Value(0)).current; // 0 -> 1 ao longo dos 2,6s
  const roll = useRef(new Animated.Value(0)).current; // 0 = mostra `from`, 1 = `to`
  const gradientId = useRef(`ember${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (!play) return undefined;
    p.setValue(0);
    num.setValue(0);
    roll.setValue(0);
    const clock = Animated.timing(p, {
      toValue: 1,
      duration: DUR,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    const numClock = Animated.timing(num, {
      toValue: 1,
      duration: NUM_DUR,
      easing: Easing.linear,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    // Ease-out sem ultrapassagem: se passasse do ponto, apareceria uma faixa
    // vazia acima do valor novo.
    const flip = Animated.sequence([
      Animated.delay(ROLL_DELAY),
      Animated.timing(roll, {
        toValue: 1,
        duration: ROLL_DUR,
        easing: Easing.bezier(0.25, 0.9, 0.3, 1),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    clock.start();
    numClock.start();
    flip.start();
    return () => {
      clock.stop();
      numClock.stop();
      flip.stop();
    };
  }, [num, p, play, roll]);

  if (!play) {
    return <View style={[styles.box, { width: size, height: size }]}>{children}</View>;
  }

  const half = size / 2;
  const radius = half - RING_INSET;
  const circumference = 2 * Math.PI * radius;
  // A cor acompanha o valor novo: e ele que o anel esta celebrando.
  const palette = getStreakPalette(to);

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
  // Entrada de 4px abaixo entre 26% e 38%; saida de 3px para cima entre 84%
  // e 100% dos 2,6s.
  const numStyle = {
    opacity: num.interpolate({
      inputRange: [0, 0.26, 0.38, 0.84, 1],
      outputRange: [0, 0, 1, 1, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateY: num.interpolate({
          inputRange: [0, 0.26, 0.38, 0.84, 1],
          outputRange: [4, 4, 0, 0, -3],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  // O rolo: dois valores empilhados, sobe exatamente uma linha.
  const rollStyle = {
    transform: [{ translateY: Animated.multiply(roll, -LINE) }],
  };
  const numWidth = size + NUM_SIDE * 2;

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
          {/* Da diagonal inferior-esquerda a superior-direita: sombra no pe,
              corpo quente no meio, reflexo de luz perto do topo e volta ao
              corpo — um anel iluminado de um lado, nao um degrade plano. */}
          <LinearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={-half}
            y1={half}
            x2={half}
            y2={-half}
          >
            <Stop offset="0" stopColor={darkenColor(palette.ringStart, 0.28)} />
            <Stop offset="0.28" stopColor={palette.ringStart} />
            <Stop offset="0.56" stopColor={palette.ringMid} />
            <Stop offset="0.8" stopColor={palette.ringEnd} />
            <Stop offset="1" stopColor={palette.ringMid} />
          </LinearGradient>
        </Defs>
        <ACircle
          cx={0}
          cy={0}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={GLOW_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={dashOffset}
          opacity={Animated.multiply(ringOpacity, GLOW_OPACITY)}
          rotation={-90}
        />
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

      <Animated.View style={[styles.numOuter, numStyle]} pointerEvents="none">
        <View style={styles.numWindow}>
          <Animated.View style={rollStyle}>
            <Svg width={numWidth} height={LINE * 2}>
              {[from, to].map((value, index) => (
                <G key={index}>
                  <SvgText
                    x={numWidth / 2}
                    y={LINE * index + NUM_BASELINE}
                    textAnchor="middle"
                    fontSize={NUM_FONT}
                    fontWeight="800"
                    fill="#FFFFFF"
                    stroke="#FFFFFF"
                    strokeWidth={4}
                    strokeLinejoin="round"
                  >
                    {String(value)}
                  </SvgText>
                  <SvgText
                    x={numWidth / 2}
                    y={LINE * index + NUM_BASELINE}
                    textAnchor="middle"
                    fontSize={NUM_FONT}
                    fontWeight="800"
                    fill={palette.digit}
                  >
                    {String(value)}
                  </SvgText>
                </G>
              ))}
            </Svg>
          </Animated.View>
        </View>
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
  numOuter: {
    position: 'absolute',
    left: -NUM_SIDE,
    right: -NUM_SIDE,
    bottom: NUM_BOTTOM,
    height: LINE,
    overflow: 'visible', // o contorno de 2px transborda da janela
  },
  numWindow: {
    height: LINE,
    overflow: 'hidden', // recorta o rolo; sem isto os dois numeros aparecem juntos
  },
});
