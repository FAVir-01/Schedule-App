import React from 'react';
import { Image, Text, View } from 'react-native';
import { FALLBACK_EMOJI } from '../constants/app';
import { lightenColor } from '../utils/colorUtils';
import { styles } from '../styles/appStyles';

// A moldura é descrita em frações da largura, não em pixels fixos.
//
// O card e a aba mostram a mesma moldura em tamanhos diferentes, e a transição
// entre os dois é uma escala uniforme: com padding fixo em 7px a foto pequena
// teria borda proporcionalmente mais grossa que a grande e a imagem esticaria
// no meio do caminho.
const PAD_RATIO = 0.073;
const BASE_RATIO = 0.094;
const EMOJI_RATIO = 0.44;

export const getPolaroidHeight = (size) => size * (1 - PAD_RATIO + BASE_RATIO);

export default function PolaroidFrame({
  size,
  task,
  hasImageError = false,
  onImageError,
  style,
}) {
  const pad = size * PAD_RATIO;
  const showImage = Boolean(task?.customImage) && !hasImageError;

  return (
    <View
      style={[
        styles.polaroidFrame,
        { width: size, paddingTop: pad, paddingHorizontal: pad },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: task.customImage }}
          style={styles.polaroidImage}
          onError={onImageError}
        />
      ) : (
        // Sem foto, o emoji ocupa o mesmo quadrado: a moldura não muda de
        // proporção entre uma tarefa e outra.
        <View
          style={[
            styles.polaroidEmojiWrap,
            { backgroundColor: lightenColor(task?.color, 0.72) },
          ]}
        >
          <Text style={{ fontSize: size * EMOJI_RATIO }}>
            {task?.emoji || FALLBACK_EMOJI}
          </Text>
        </View>
      )}
      <View style={{ height: size * BASE_RATIO }} />
    </View>
  );
}
