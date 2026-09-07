import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles/appStyles';

// Baralho de fotos do dia: a primeira foto aparece inteira, como quando só
// existia uma, e as seguintes ficam empilhadas atrás dela. O selo "+N" diz
// quantas faltam ver; tocar abre o visualizador, onde elas passam de lado.
const MAX_BACK_LAYERS = 2;

// Pilha alinhada na diagonal: cada carta de trás sobe e vai para a direita
// sempre no mesmo passo, aparecendo só pelo canto superior direito.
const BACK_LAYER_STEP = 9;

const BACK_LAYER_STYLES = [
  {
    opacity: 0.9,
    transform: [{ translateX: BACK_LAYER_STEP }, { translateY: -BACK_LAYER_STEP }],
  },
  {
    opacity: 0.78,
    transform: [
      { translateX: BACK_LAYER_STEP * 2 },
      { translateY: -BACK_LAYER_STEP * 2 },
    ],
  },
];

function MoodPhotoDeck({ photos, onOpen, photoStyle, accessibilityLabel }) {
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) {
    return null;
  }

  const remaining = list.length - 1;
  const backLayers = list.slice(1, 1 + MAX_BACK_LAYERS);
  // A última do baralho é desenhada primeiro para ficar por baixo das outras.
  const layers = backLayers
    .map((uri, index) => ({ uri, depth: index + 1 }))
    .reverse();

  return (
    <View style={styles.moodPhotoDeck}>
      {layers.map(({ uri, depth }) => (
        <View
          key={uri}
          pointerEvents="none"
          style={[styles.moodPhotoDeckLayer, BACK_LAYER_STYLES[depth - 1]]}
        >
          <Image
            source={{ uri }}
            style={styles.moodPhotoDeckLayerImage}
            resizeMode="cover"
            accessible={false}
          />
        </View>
      ))}
      <Pressable
        onPress={() => onOpen?.(0)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Image source={{ uri: list[0] }} style={photoStyle} accessible={false} />
        {remaining > 0 ? (
          <View style={styles.moodPhotoDeckBadge}>
            <Ionicons name="images-outline" size={13} color="#ffffff" />
            <Text style={styles.moodPhotoDeckBadgeText}>{`+${remaining}`}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export default React.memo(MoodPhotoDeck);
