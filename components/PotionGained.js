// Momento de ganho de pocao de congelamento.
//
// GATILHO — o efeito nao tem nada a ver com a sequencia em si. Ele dispara
// quando o estoque de pocoes realmente aumenta:
//
//     if (next > prev) tocar();
//
// Como o teto e 3, uma conclusao que cairia num multiplo de 7 com o estoque
// ja cheio nao produz efeito nenhum. Nada a ganhar, nada a mostrar.
// O card tambem nao exibe contagem de sequencia em momento algum.
//
// SEQUENCIA (todos os tempos a partir do toque no botao):
//   0ms     o botao da uma batidinha (encolhe e volta)
//   0ms     as faiscas jorram do botao para fora, em oito direcoes
//   450ms   o frasco entra deslizando pela esquerda (FreezeFlask, sem alteracao)
//   1500ms  a contagem nova aparece a esquerda do frasco
//   4300ms  a contagem sai
//   4700ms  o frasco some e o card volta ao normal
//
// Transcrito do desenho em Reanimated para o `Animated` do RN. Cada faisca e
// um Animated.View proprio (rotacao -> translacao -> escala, no driver
// nativo) em vez de um <G> animado: o react-native-svg nao anima `style` de
// filhos do mesmo Svg.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { USE_NATIVE_DRIVER } from '../constants/app';

// A mesma faisca de quatro pontas que existe dentro do selo de marco.
// Nenhuma forma nova entra no app por causa deste efeito.
const SPARK =
  'M0,-11 C.9,-3.7 3.7,-.9 11,0 C3.7,.9 .9,3.7 0,11 ' +
  'C-.9,3.7 -3.7,.9 -11,0 C-3.7,-.9 -.9,-3.7 0,-11 Z';
const SPARK_SIZE = 22;

// Angulos irregulares de proposito: equidistantes viram estrela de fogos.
const SPARKS = [
  { angle: 196, scale: 0.62, delay: 0, color: '#2A8FD8' },
  { angle: 236, scale: 0.42, delay: 110, color: '#5FB0E8' },
  { angle: 288, scale: 0.54, delay: 240, color: '#2A8FD8' },
  { angle: 334, scale: 0.36, delay: 50, color: '#8FCDF2' },
  { angle: 24, scale: 0.5, delay: 170, color: '#5FB0E8' },
  { angle: 72, scale: 0.4, delay: 300, color: '#2A8FD8' },
  { angle: 128, scale: 0.58, delay: 110, color: '#5FB0E8' },
  { angle: 160, scale: 0.34, delay: 240, color: '#8FCDF2' },
];

const DUR = 1400;
const SPARK_EASE = Easing.bezier(0.28, 1.3, 0.5, 1);
const SCENE = 140; // caixa da cena, centrada no botao
const CENTER = SCENE / 2;

// Percurso radial: nasce colada no botao e se afasta pelo proprio raio.
const OUT = { stops: [0, 0.26, 0.48, 0.66, 1], dist: [8, 24, 30, 33, 40] };
const SCL = { stops: [0, 0.26, 0.48, 0.66, 1], value: [0, 1.2, 0.9, 1, 0.4] };
const OPA = { stops: [0, 0.26, 0.66, 1], value: [0, 1, 1, 0] };

function Spark({ angle, scale, delay, color, play }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, {
        toValue: 1,
        duration: DUR + 300,
        easing: SPARK_EASE,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, play, progress]);

  return (
    <Animated.View
      style={[
        styles.spark,
        {
          opacity: progress.interpolate({
            inputRange: OPA.stops,
            outputRange: OPA.value,
            extrapolate: 'clamp',
          }),
          transform: [
            { rotate: `${angle}deg` },
            {
              translateX: progress.interpolate({
                inputRange: OUT.stops,
                outputRange: OUT.dist,
                extrapolate: 'clamp',
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: SCL.stops,
                outputRange: SCL.value.map((value) => value * scale),
                extrapolate: 'clamp',
              }),
            },
          ],
        },
      ]}
    >
      <Svg width={SPARK_SIZE} height={SPARK_SIZE} viewBox="-11 -11 22 22">
        <Path d={SPARK} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/**
 * <PotionGained play={ganhou} />
 *
 * play: passe um valor verdadeiro (e novo a cada ganho) no exato momento em
 * que o estoque sobe. O componente dispara uma vez e volta a dormir. Nao toque
 * nele em nenhuma outra situacao — nem ao abrir a tela, nem ao rolar a lista,
 * nem ao tocar no frasco.
 */
export default function PotionGained({ play }) {
  if (!play) return null;

  return (
    <View style={styles.scene} pointerEvents="none">
      {SPARKS.map((spark) => (
        <Spark key={spark.angle} {...spark} play={play} />
      ))}
    </View>
  );
}

// A batidinha do botao no instante do ganho. Aplique no botao de confirmacao.
export function useCheckPunch(play) {
  const k = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!play) return undefined;
    const animation = Animated.sequence([
      Animated.timing(k, { toValue: 0.86, duration: 175, easing: Easing.out(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(k, { toValue: 1.12, duration: 175, easing: Easing.out(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(k, { toValue: 1, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [play, k]);
  return { transform: [{ scale: k }] };
}

// Agenda do frasco durante o ganho, para o card usar com o FreezeFlask.
export const POTION_TIMELINE = {
  flaskIn: 450, // entra deslizando pela esquerda
  countIn: 1500, // a contagem nova aparece
  countOut: 4300,
  flaskOut: 4700, // some e o card volta ao normal
};

// Centro da cena sobre o centro do botao: no card, o grupo do botao tem 42px
// de largura minima encostado no padding de 16, entao o centro fica a
// 16 + 21 = 37px da borda direita; 70 - 37 = 33.
const BUTTON_CENTER_FROM_RIGHT = 16 + 21;

const styles = StyleSheet.create({
  scene: {
    position: 'absolute',
    right: BUTTON_CENTER_FROM_RIGHT - CENTER,
    top: '50%',
    marginTop: -CENTER,
    width: SCENE,
    height: SCENE,
    zIndex: 3,
  },
  spark: {
    position: 'absolute',
    left: CENTER - SPARK_SIZE / 2,
    top: CENTER - SPARK_SIZE / 2,
    width: SPARK_SIZE,
    height: SPARK_SIZE,
  },
});
