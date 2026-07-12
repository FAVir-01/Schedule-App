// Humor do dia: o dado canônico é o nível 1-5 (estatísticas sempre batem).
// A aparência (emoji padrão ou imagem/GIF do usuário) é só visual.
export const MOOD_LEVELS = [1, 2, 3, 4, 5];

export const DEFAULT_MOOD_EMOJIS = {
  1: '😢',
  2: '😔',
  3: '😐',
  4: '🙂',
  5: '😄',
};

export const MOOD_TAG_KEYS = ['anxious', 'tired', 'calm', 'excited', 'stressed', 'focused'];

// Resolve o que desenhar para um registro de humor: registros novos usam o
// nível (com aparência personalizável); registros antigos guardavam o próprio
// emoji/imagem e continuam mostrando o que foi salvo.
export function getMoodMarker(mood, appearance) {
  if (!mood) {
    return null;
  }
  if (mood.image) {
    return { image: mood.image, emoji: null };
  }
  if (mood.emoji) {
    return { image: null, emoji: mood.emoji };
  }
  if (mood.level) {
    const custom = appearance?.[mood.level];
    return custom
      ? { image: custom, emoji: null }
      : { image: null, emoji: DEFAULT_MOOD_EMOJIS[mood.level] ?? null };
  }
  return null;
}
