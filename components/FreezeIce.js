// Camada de gelo do card congelado e do card em degelo.
//
// O gelo e uma placa desenhada, nao um filtro: retangulo com o mesmo raio do
// card, contorno branco de 3px e dois riscos de brilho largos na diagonal.
// O corte duro entre branco e azul no gradiente e o que faz a superficie ser
// lida como gelo, e nao como uma opacidade qualquer.
//
// Degelo: os brilhos apagam primeiro (1,5s) e a placa inteira desmaia ate 26%
// (2,6s), virando uma pelicula. O card nunca fica totalmente limpo enquanto
// estiver em degelo — o residuo e o que sinaliza que o dia ainda esta gasto.
//
// EMPILHAMENTO — a regra que faz o botao ficar sempre acessivel:
//
//   <View style={styles.card}>                    // position: relative, overflow: hidden
//     <View style={styles.row}>                   // SEM zIndex proprio
//       <DropIcon />
//       <View style={styles.text}>…</View>
//       <FreezeFlask … />
//       <CheckButton style={{ zIndex: 2 }} />     // unico filho com zIndex
//     </View>
//     <FreezeIce state="thawing" />               // zIndex 1, pointerEvents none
//   </View>
//
// Se a linha receber zIndex, ela cria um contexto de empilhamento e prende o
// botao dentro dele — ai o gelo passa por cima do botao de novo.
//
// Os brilhos ficam num Animated.View separado dentro da placa porque o
// react-native-svg nao anima a opacidade de filhos individuais de um mesmo
// Svg. A opacidade final dos brilhos e multiplicada pela da placa — os dois
// somem juntos, que e o efeito certo.

import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { USE_NATIVE_DRIVER } from '../constants/app';

const VB = '0 0 300 62';

const MELT = {
  slab: { from: 1, to: 0.26, duration: 2600 },
  shine: { from: 0.85, to: 0, duration: 1500 },
};

const EASE = Easing.inOut(Easing.ease);

function Slab() {
  const id = `iceFace${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width="100%" height="100%" viewBox={VB} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="10%" y1="0%" x2="40%" y2="100%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="0.45" stopColor="#D6EEFC" stopOpacity="0.8" />
          <Stop offset="0.48" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#AFDCF6" stopOpacity="0.75" />
        </LinearGradient>
      </Defs>
      <Rect
        x={1.5}
        y={1.5}
        width={297}
        height={59}
        rx={10}
        fill={`url(#${id})`}
        stroke="#FFFFFF"
        strokeWidth={3}
      />
    </Svg>
  );
}

function Shine() {
  return (
    <Svg width="100%" height="100%" viewBox={VB} preserveAspectRatio="none">
      <Path d="M40,2 L18,60" stroke="#FFFFFF" strokeWidth={5} />
      <Path d="M76,2 L54,60" stroke="#FFFFFF" strokeWidth={5} />
      <Path d="M232,2 L214,60" stroke="#FFFFFF" strokeWidth={3} opacity={0.82} />
    </Svg>
  );
}

/**
 * <FreezeIce state="frozen" />    dia gasto por um gelo, esperando
 * <FreezeIce state="thawing" />   dia de hoje, derretendo
 * <FreezeIce state={null} />      nada
 *
 * animate: dispare o degelo so na transicao para "thawing". Ao entrar na tela
 * com o card ja derretendo desde antes, passe false e a pelicula aparece
 * direto no estado final, sem replay. Mesma regra do selo e do frasco.
 */
export default function FreezeIce({ state, animate = true }) {
  const slab = useRef(new Animated.Value(MELT.slab.from)).current;
  const shine = useRef(new Animated.Value(MELT.shine.from)).current;

  useEffect(() => {
    slab.stopAnimation();
    shine.stopAnimation();
    if (state === 'frozen') {
      slab.setValue(MELT.slab.from);
      shine.setValue(MELT.shine.from);
      return;
    }
    if (state === 'thawing') {
      if (animate) {
        slab.setValue(MELT.slab.from);
        shine.setValue(MELT.shine.from);
        Animated.timing(slab, {
          toValue: MELT.slab.to,
          duration: MELT.slab.duration,
          easing: EASE,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
        Animated.timing(shine, {
          toValue: MELT.shine.to,
          duration: MELT.shine.duration,
          easing: EASE,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      } else {
        slab.setValue(MELT.slab.to);
        shine.setValue(MELT.shine.to);
      }
    }
  }, [state, animate, slab, shine]);

  if (state !== 'frozen' && state !== 'thawing') return null;

  return (
    <Animated.View style={[styles.layer, { opacity: slab }]} pointerEvents="none">
      <Slab />
      <Animated.View style={[styles.layer, { opacity: shine }]} pointerEvents="none">
        <Shine />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
});
