// Anel da sequencia.
//
// Toca em volta do icone da tarefa quando a sequencia avanca, mostra o numero
// novo por baixo e some sem deixar rastro. O card volta exatamente ao que era —
// nenhum estado permanente e criado por este efeito.
//
// TRES FASES, pelo valor novo da sequencia (`to`):
//   1-2      so o numero contornado. Dois dias ainda nao sao uma sequencia
//            para celebrar com fogo, mas a contagem ja aparece.
//   3-6      o anel incandescente: um traco que se desenha, segura e se
//            desenrola pelo mesmo caminho (2,9s).
//   7-33     os aneis de brasa: tres linguas de fogo que lambem a foto (2,6s),
//            todas no mesmo sentido.
//   34+      os mesmos aneis, com o do meio girando ao contrario: as pontas se
//            cruzam no meio do percurso.
//   O numero contornado aparece em todas as fases, com o mesmo relogio de 2,6s.
//
// No nosso card o icone e o emoji (34px) ou a foto redonda (46px) da tarefa,
// nao um desenho do SVG: ele entra como `children`, sempre dentro de uma caixa
// fixa de `size`, e o efeito se desenha por fora dele. A caixa existe com ou
// sem efeito, entao o layout da linha nao muda quando ele toca.
//
// A cor vem de `getStreakPalette(to)`: esquenta do laranja ao roxo ao longo de
// 60 dias, a mesma em todas as fases e telas.
//
// ANEL INCANDESCENTE (3-6)
//   0ms      o anel comeca a se desenhar no topo, no sentido horario
//   870ms    o anel fecha
//   1508ms   comeca a se desenrolar pelo mesmo caminho
//   2900ms   some
//   A saida nao e um fade: ele apaga na ordem em que acendeu, o que mantem a
//   leitura de brasa esfriando em vez de camada sendo removida. Por baixo do
//   traco de 4px vai o mesmo anel mais largo e quase transparente: o brilho.
//
// ANEIS DE BRASA (7+)
//   Geometria (px reais, origem no centro da caixa). A foto tem raio 23; por
//   cima dela vai um contorno branco de 2px centrado no raio 23 (ocupa 22-24):
//   e a camada que cobre a metade interna de qualquer traco e faz os aneis
//   parecerem passar por tras da imagem. Foto e contorno sao desenhados DEPOIS
//   dos aneis, de proposito. Do centro para fora os aneis crescem em raio e em
//   espessura, e a cor vai do tom claro ao escuro da paleta, como numa chama:
//
//     anel  raio   traco   ocupa          folga
//     3     25.3   2.1     24.25-26.35    0.25 para o contorno
//     2     27.75  2.5     26.50-29.00    0.15 para o anel 3
//     1     30.7   3.0     29.20-32.20    0.20 para o anel 2
//
//   As folgas sao minimas de proposito: e isso que faz os tres lerem como uma
//   faixa unica de fogo, nao como um alvo de tiro. Acima de meio pixel de
//   folga o efeito se desfaz. O extremo, 32.2, cabe no SVG de 66, que e maior
//   que a caixa de 50 e fica centrado nela, absoluto: transborda 8px para cada
//   lado sem mexer na altura da linha (o card tem 14px de padding vertical e
//   16 horizontal).
//
//   O arco: cada anel e um circulo com dasharray igual a circunferencia e
//   offset negativo — em -99,6% o arco e um ponto (bolinha, pelo linecap), em
//   -26% cobre 74% da volta. Ele nasce como ponto, abre ate tres quartos e
//   fecha de volta ao ponto; nao e tracado do comeco ao fim. Ao mesmo tempo o
//   anel gira 550 graus (-90 -> 190 -> 460). A ponta que lidera corre muito
//   mais que a que fica para tras: e a lingua de fogo.
//
//   O tempo, por anel (2,4s; o do meio parte 100ms depois, o interno 200ms):
//     0%    invisivel, arco fechado, -90 graus
//     10%   totalmente visivel
//     42%   abertura maxima (74%), 190 graus          (1,008s)
//     86%   ainda visivel
//     100%  invisivel, arco fechado, 460 graus         (2,4s)
//   Ease-in-out em cada trecho (0-42 acelera, 42-100 desacelera): lancar e
//   recolher. O escalonamento e o que faz parecer um movimento so se
//   propagando. Total na tela: 2,6s.
//
//   A partir de 34 dias (segunda metade do caminho ate os 60) o anel do meio
//   gira ao contrario (-90 -> -370 -> -640): as pontas se cruzam no meio do
//   percurso.
//
// O NUMERO
//   12,5px peso 800, contornado de branco com 2px, centrado logo abaixo da
//   foto e com 12px de folga para cada lado da caixa (cabe quatro digitos).
//   O contorno e o mesmo texto desenhado por baixo em SVG, tracado de branco
//   com o dobro da espessura (metade fica dentro da letra) — o RN nao tem
//   contorno de texto e so aceita uma sombra. Dois niveis: o de fora carrega
//   opacidade e deslocamento com overflow visivel; a janela de dentro, de
//   15px, recorta o rolo. Com um nivel so o contorno e cortado em cima e
//   embaixo. Relogio proprio de 2,6s, no driver nativo:
//     676ms    comeca a subir de 4px abaixo, ainda com o valor anterior
//     988ms    no lugar, totalmente visivel
//     1200ms   vira para o valor novo, deslizando uma linha para cima
//     2184ms   comeca a sair, 3px para cima
//     2600ms   sumiu
//
// `strokeDashoffset` e prop de SVG: anima no driver de JS (no maximo tres
// aneis por vez, custo desprezivel). A rotacao NAO pode ser a prop `rotation`
// do Circle: o setNativeProps do react-native-svg 15 repassa as props cruas e
// nao converte rotation em matriz, entao o valor animado e ignorado e o arco
// abre e fecha preso no topo. Cada anel de brasa gira num Animated.View em
// volta do seu proprio SVG — transform de View, que anima de verdade.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { USE_NATIVE_DRIVER } from '../constants/app';
import { darkenColor } from '../utils/colorUtils';
import { getStreakPalette } from '../utils/streakColor';

const ACircle = Animated.createAnimatedComponent(Circle);

export const STREAK_RING_BOX = 50; // caixa do icone no card
export const STREAK_RING_MIN = 3; // sequencia minima para o efeito tocar
export const STREAK_BLAZE_MIN = 7; // sequencia a partir da qual sao tres aneis
export const STREAK_CROSS_MIN = 34; // a partir daqui o anel do meio gira ao contrario

// --- Anel incandescente (3-6) ---
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

// --- Aneis de brasa (7+) ---
const BLAZE_SVG = 66;
const PHOTO_RADIUS = 23;
const CONTOUR_WIDTH = 2;
// Do externo para o interno. `key` escolhe a cor na paleta da sequencia.
const BLAZE_RINGS = [
  { radius: 30.7, width: 3.0, delay: 0, key: 'ringStart' },
  { radius: 27.75, width: 2.5, delay: 100, key: 'ringMid' },
  { radius: 25.3, width: 2.1, delay: 200, key: 'ringEnd' },
];
const BLAZE_DUR = 2400;
const BLAZE_PEAK = 0.42; // abertura maxima
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1); // o `ease-in-out` do CSS

// --- Numero ---
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

const getMode = (to) => {
  const value = Number(to) || 0;
  if (value >= STREAK_BLAZE_MIN) return 'blaze';
  if (value >= STREAK_RING_MIN) return 'ring';
  if (value >= 1) return 'number';
  return null;
};

export default function StreakRing({
  play,
  from, // valor anterior da sequencia
  to, // valor novo
  size = STREAK_RING_BOX,
  children, // o icone da tarefa, desenhado dentro do efeito
}) {
  const p = useRef(new Animated.Value(0)).current; // anel incandescente, 0 -> 1 nos 2,9s
  const blaze = useRef(BLAZE_RINGS.map(() => new Animated.Value(0))).current; // 0 -> 1 nos 2,4s
  const num = useRef(new Animated.Value(0)).current; // 0 -> 1 ao longo dos 2,6s
  const roll = useRef(new Animated.Value(0)).current; // 0 = mostra `from`, 1 = `to`
  const gradientId = useRef(`ember${Math.random().toString(36).slice(2, 8)}`).current;
  const mode = play ? getMode(to) : null;

  useEffect(() => {
    if (!mode) return undefined;
    p.setValue(0);
    blaze.forEach((value) => value.setValue(0));
    num.setValue(0);
    roll.setValue(0);
    const animations = [];
    if (mode === 'ring') {
      animations.push(
        Animated.timing(p, {
          toValue: 1,
          duration: DUR,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      );
    } else {
      blaze.forEach((value, index) => {
        animations.push(
          Animated.sequence([
            Animated.delay(BLAZE_RINGS[index].delay),
            // Dois trechos com ease-in-out cada: lancar e recolher.
            Animated.timing(value, {
              toValue: BLAZE_PEAK,
              duration: BLAZE_DUR * BLAZE_PEAK,
              easing: EASE_IN_OUT,
              useNativeDriver: false,
            }),
            Animated.timing(value, {
              toValue: 1,
              duration: BLAZE_DUR * (1 - BLAZE_PEAK),
              easing: EASE_IN_OUT,
              useNativeDriver: false,
            }),
          ])
        );
      });
    }
    animations.push(
      Animated.timing(num, {
        toValue: 1,
        duration: NUM_DUR,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      // Ease-out sem ultrapassagem: se passasse do ponto, apareceria uma faixa
      // vazia acima do valor novo.
      Animated.sequence([
        Animated.delay(ROLL_DELAY),
        Animated.timing(roll, {
          toValue: 1,
          duration: ROLL_DUR,
          easing: Easing.bezier(0.25, 0.9, 0.3, 1),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [blaze, mode, num, p, play, roll]);

  const box = [styles.box, { width: size, height: size }];

  if (!mode) {
    return <View style={box}>{children}</View>;
  }

  const half = size / 2;
  // A cor acompanha o valor novo: e ele que o efeito esta celebrando.
  const palette = getStreakPalette(to);

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

  const number = (
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
  );

  if (mode === 'number') {
    return (
      <View style={box}>
        {children}
        {number}
      </View>
    );
  }

  if (mode === 'ring') {
    const radius = half - RING_INSET;
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

    return (
      <View style={box}>
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
        {number}
      </View>
    );
  }

  // Aneis de brasa.
  const blazeHalf = BLAZE_SVG / 2;
  const blazeStyle = {
    position: 'absolute',
    left: (size - BLAZE_SVG) / 2,
    top: (size - BLAZE_SVG) / 2,
  };
  const blazeViewBox = `${-blazeHalf} ${-blazeHalf} ${BLAZE_SVG} ${BLAZE_SVG}`;
  const reverseMiddle = (Number(to) || 0) >= STREAK_CROSS_MIN;
  const rings = BLAZE_RINGS.map((ring, index) => {
    const value = blaze[index];
    const circumference = 2 * Math.PI * ring.radius;
    const reversed = reverseMiddle && index === 1;
    return {
      ...ring,
      circumference,
      color: palette[ring.key],
      opacity: value.interpolate({
        inputRange: [0, 0.1, 0.86, 1],
        outputRange: [0, 1, 1, 0],
        extrapolate: 'clamp',
      }),
      dashOffset: value.interpolate({
        inputRange: [0, BLAZE_PEAK, 1],
        outputRange: [-0.996 * circumference, -0.26 * circumference, -0.996 * circumference],
        extrapolate: 'clamp',
      }),
      rotation: value.interpolate({
        inputRange: [0, BLAZE_PEAK, 1],
        outputRange: reversed ? ['-90deg', '-370deg', '-640deg'] : ['-90deg', '190deg', '460deg'],
        extrapolate: 'clamp',
      }),
    };
  });
  const blazeBox = { width: BLAZE_SVG, height: BLAZE_SVG };

  return (
    <View style={box}>
      {rings.map((ring) => (
        <Animated.View
          key={ring.key}
          style={[blazeStyle, blazeBox, { transform: [{ rotate: ring.rotation }] }]}
          pointerEvents="none"
        >
          <Svg width={BLAZE_SVG} height={BLAZE_SVG} viewBox={blazeViewBox}>
            <ACircle
              cx={0}
              cy={0}
              r={ring.radius}
              fill="none"
              stroke={ring.color}
              strokeWidth={ring.width}
              strokeLinecap="round"
              strokeDasharray={`${ring.circumference}`}
              strokeDashoffset={ring.dashOffset}
              opacity={ring.opacity}
            />
          </Svg>
        </Animated.View>
      ))}

      {children}

      {/* Contorno branco por cima da foto: a camada que esconde a metade
          interna dos tracos. Acende e apaga com o anel externo. */}
      <Svg
        width={BLAZE_SVG}
        height={BLAZE_SVG}
        viewBox={blazeViewBox}
        style={blazeStyle}
        pointerEvents="none"
      >
        <ACircle
          cx={0}
          cy={0}
          r={PHOTO_RADIUS}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={CONTOUR_WIDTH}
          opacity={rings[0].opacity}
        />
      </Svg>

      {number}
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
