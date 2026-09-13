// Reflexo de vidro sobre o icone da tarefa.
//
// Toca uma vez, no ato de cumprir a tarefa: um brilho frio pulsa sobre a foto
// e duas faixas brancas inclinadas varrem da esquerda para a direita, como luz
// passando por uma superficie polida. Some sem deixar rastro.
//
// LINHA DO TEMPO (900ms, fracao do relogio `p`):
//   0.08   as faixas comecam a andar (ja em cena, ainda invisiveis)
//   0.12   o brilho comeca a acender
//   0.15   as faixas chegam a opacidade cheia
//   0.25   brilho no pico, expandido
//   0.50   as faixas cruzaram o icone e comecam a apagar
//   0.58   faixas apagadas
//   0.65   brilho apagado
//
// O icone entra como `children` numa caixa redonda do tamanho da foto (46px)
// com `overflow: hidden`: as faixas so existem dentro do circulo. A caixa
// existe com ou sem efeito, entao o layout da linha nao muda quando ele toca.
//
// Na foto o brilho fica por cima (a imagem e opaca; por baixo nao apareceria)
// e mais fraco que num icone vetorial, senao lava a foto. Opacidade e transform
// rodam no driver nativo.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { USE_NATIVE_DRIVER } from '../constants/app';

export const ICON_SHINE_SIZE = 46; // diametro da foto redonda do card
const DUR = 900;
const SKEW = '-18deg';
// As faixas ultrapassam o circulo em cima e embaixo para que, inclinadas, nao
// mostrem as pontas dentro do recorte.
const BLEED = 8;

export default function IconShine({ play, size = ICON_SHINE_SIZE, children }) {
  const p = useRef(new Animated.Value(0)).current; // 0 -> 1 ao longo dos 900ms

  useEffect(() => {
    if (!play) return undefined;
    p.setValue(0);
    const clock = Animated.timing(p, {
      toValue: 1,
      duration: DUR,
      easing: Easing.linear,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    clock.start();
    return () => clock.stop();
  }, [play, p]);

  const clipStyle = [styles.clip, { width: size, height: size, borderRadius: size / 2 }];

  if (!play) {
    return <View style={clipStyle}>{children}</View>;
  }

  // Comeca inteira fora pela esquerda (largura + inclinacao) e termina fora
  // pela direita.
  const mainWidth = Math.round(size * 0.26);
  const startX = -(mainWidth + BLEED * 2 + 4);
  const endX = size + mainWidth + BLEED * 2 + 4;
  const sweep = {
    opacity: p.interpolate({
      inputRange: [0, 0.08, 0.15, 0.5, 0.58, 1],
      outputRange: [0, 0, 0.78, 0.78, 0, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateX: p.interpolate({
          inputRange: [0, 0.08, 0.5, 1],
          outputRange: [startX, startX, endX, endX],
          extrapolate: 'clamp',
        }),
      },
      { skewX: SKEW },
    ],
  };
  const halo = {
    opacity: p.interpolate({
      inputRange: [0, 0.12, 0.25, 0.65, 1],
      outputRange: [0, 0, 0.38, 0, 0],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: p.interpolate({
          inputRange: [0, 0.25, 0.65],
          outputRange: [0.8, 1.35, 1.35],
          extrapolate: 'clamp',
        }),
      },
    ],
  };
  const stripeBox = { top: -BLEED, bottom: -BLEED };

  return (
    <View style={clipStyle}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, { width: size, height: size, borderRadius: size / 2 }, halo]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.stripe, stripeBox, { left: 0, width: mainWidth }, sweep]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stripe,
          stripeBox,
          { left: -Math.round(mainWidth * 0.9), width: Math.max(3, Math.round(mainWidth * 0.4)) },
          sweep,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: '#E6F8FF',
  },
  stripe: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
});
