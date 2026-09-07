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

export const REFLECTION_MAX_PHOTOS = 6;

// Lista limpa de fotos: sem vazias, sem repetidas e no maximo o limite.
export function normalizeReflectionPhotos(value) {
  const entries = Array.isArray(value) ? value : [value];
  const seen = new Set();
  return entries.reduce((photos, entry) => {
    const uri = typeof entry === 'string' ? entry.trim() : '';
    if (!uri || seen.has(uri) || photos.length >= REFLECTION_MAX_PHOTOS) {
      return photos;
    }
    seen.add(uri);
    photos.push(uri);
    return photos;
  }, []);
}

// Registros antigos guardavam uma unica `photo`; os novos guardam `photos`.
// Quem exibe le sempre por aqui e recebe a lista nos dois formatos.
export function getReflectionPhotos(reflection) {
  if (!reflection) {
    return [];
  }
  return normalizeReflectionPhotos(
    Array.isArray(reflection.photos) ? reflection.photos : [reflection.photo]
  );
}

// Ao salvar, `photo` continua recebendo a primeira foto: backups antigos e
// versoes anteriores do app seguem enxergando a foto do dia.
export function toReflectionPhotoFields(value) {
  const photos = normalizeReflectionPhotos(value);
  return { photos, photo: photos[0] ?? null };
}

export function hasReflectionContent(reflection) {
  return Boolean(
    reflection?.level ||
      reflection?.emoji ||
      reflection?.image ||
      getReflectionPhotos(reflection).length > 0 ||
      `${reflection?.note ?? ''}`.trim() ||
      (Array.isArray(reflection?.tags) && reflection.tags.length > 0)
  );
}

// Only the free-form note and the daily photos are private. Mood level and
// tags remain visible so statistics and the calendar keep working normally.
export function hasPrivateReflectionContent(reflection) {
  return Boolean(
    `${reflection?.note ?? ''}`.trim() || getReflectionPhotos(reflection).length > 0
  );
}

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
