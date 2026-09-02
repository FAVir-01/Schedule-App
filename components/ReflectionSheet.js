import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { translations } from '../constants/i18n';
import { persistPickedImage } from '../services/imagePersistenceService';
import { styles } from '../styles/appStyles';
import { IMAGE_LIMITS, getImageErrorMessage } from '../utils/imageUtils';
import {
  DEFAULT_MOOD_EMOJIS,
  MOOD_LEVELS,
  MOOD_TAG_KEYS,
  hasReflectionContent,
} from '../utils/moodUtils';

// Folha de reflexão do dia: humor em escala de 1-5 (registro rápido), tags de
// sentimento, nota e foto opcionais. A aparência de cada nível é personalizável
// (segurar o humor), mas o dado salvo é sempre o nível — estatísticas estáveis.
function ReflectionSheet({
  visible,
  dateKey,
  mood,
  onSave,
  onClose,
  language = 'en',
  moodAppearance = {},
  onSetAppearance,
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = translations[language] ?? translations.en;
  const imageText = t.imageHandling;
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  // O Android com edge-to-edge ignora o adjustResize dentro de Modal, então
  // medimos o teclado na mão e encolhemos/subimos a folha por conta própria.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardHeightRef = useRef(0);
  // Altura da janela com teclado fechado: serve pra saber quanto o Android
  // já compensou sozinho (adjustResize) e quanto falta compensar na mão.
  const baseWindowHeightRef = useRef(height);
  const scrollRef = useRef(null);
  // Posição Y do campo de nota dentro do scroll (medida no onLayout): rolar
  // até ela é determinístico, ao contrário do scrollToEnd, que depende do
  // tamanho do conteúdo já estar acomodado após o teclado abrir.
  const noteInputYRef = useRef(0);

  const scrollToNote = (animated = true) => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, noteInputYRef.current - 12),
      animated,
    });
  };

  useEffect(() => {
    if (visible) {
      setSelectedLevel(mood?.level ?? null);
      setSelectedTags(Array.isArray(mood?.tags) ? mood.tags : []);
      setNote(mood?.note ?? '');
      setPhoto(mood?.photo ?? null);
    }
  }, [visible, mood]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = event.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = nextHeight;
      setKeyboardHeight(nextHeight);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Depois que a folha encolhe pra dar lugar ao teclado, rola até o campo de
  // nota. Dois disparos: um cedo e um tardio, porque o layout pode ainda estar
  // se acomodando quando o evento do teclado chega (edge-to-edge no Android).
  useEffect(() => {
    if (keyboardHeight > 0) {
      const earlyId = setTimeout(() => scrollToNote(false), 100);
      const lateId = setTimeout(() => scrollToNote(true), 450);
      return () => {
        clearTimeout(earlyId);
        clearTimeout(lateId);
      };
    }
  }, [keyboardHeight]);

  if (!visible || !dateKey) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const locale = language === 'pt' ? 'pt-BR' : 'en-US';
  const dateLabel = date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Registros antigos guardavam emoji/imagem em vez do nível; seguem editáveis.
  const canSave = hasReflectionContent({
    level: selectedLevel,
    tags: selectedTags,
    note,
    photo,
    emoji: selectedLevel ? null : mood?.emoji,
    image: selectedLevel ? null : mood?.image,
  });
  const hasExisting = Boolean(mood);
  // A janela pode encolher ANTES do evento do teclado chegar; por isso a base
  // é a maior altura já vista, não a altura no momento do evento.
  if (height > baseWindowHeightRef.current) {
    baseWindowHeightRef.current = height;
  }
  // Se a janela já encolheu com o teclado (adjustResize), não desconta de novo;
  // se não encolheu (edge-to-edge), desconta a parte coberta pelo teclado.
  const resizeCompensated = Math.max(0, baseWindowHeightRef.current - height);
  const keyboardOverlap = Math.max(0, keyboardHeight - resizeCompensated);
  const sheetMaxHeight =
    keyboardHeight > 0 ? height - keyboardOverlap - 16 : height * 0.85;

  const handleSave = () => {
    if (!canSave) {
      return;
    }
    onSave(dateKey, {
      level: selectedLevel,
      tags: selectedTags,
      note: note.trim(),
      photo,
      // Sem nível novo escolhido, preserva a aparência legada do registro.
      emoji: selectedLevel ? null : mood?.emoji ?? null,
      image: selectedLevel ? null : mood?.image ?? null,
    });
  };

  const handleRemove = () => {
    const removeReflection = () => onSave(dateKey, null);
    Alert.alert(t.reflection.removeConfirmTitle, t.reflection.removeConfirmMessage, [
      { text: t.reflection.cancel, style: 'cancel' },
      { text: t.reflection.remove, style: 'destructive', onPress: removeReflection },
    ]);
  };

  const handleToggleTag = (tag) => {
    setSelectedTags((previous) =>
      previous.includes(tag)
        ? previous.filter((item) => item !== tag)
        : [...previous, tag]
    );
  };

  const pickImage = async ({ quality = 1, limits, prefix, cropSquare = false }) => {
    if (isLoadingImage) {
      return null;
    }
    try {
      setIsLoadingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: cropSquare,
        ...(cropSquare ? { aspect: [1, 1], shape: 'rectangle' } : {}),
        quality,
      });
      if (result.canceled || !result.assets?.length) {
        return null;
      }
      return await persistPickedImage(result.assets[0], { prefix, limits });
    } catch (error) {
      console.warn('Failed to select or persist reflection image', error);
      Alert.alert(
        imageText.errorTitle,
        getImageErrorMessage(imageText, error, limits)
      );
      return null;
    } finally {
      setIsLoadingImage(false);
    }
  };

  const handlePickPhoto = async () => {
    const uri = await pickImage({
      quality: 0.75,
      limits: IMAGE_LIMITS.reflectionPhoto,
      prefix: 'custom_mood_photo',
    });
    if (uri) {
      setPhoto(uri);
    }
  };

  // Segurar um humor troca só a aparência dele; o nível salvo nos registros
  // não muda. O recorte quadrado mantém o enquadramento em todos os avatares.
  const handleCustomizeLevel = (level) => {
    const buttons = [
      {
        text: t.reflection.chooseImage,
        onPress: async () => {
          const uri = await pickImage({
            quality: 1,
            limits: IMAGE_LIMITS.moodAppearance,
            prefix: `custom_mood_level_${level}`,
            cropSquare: true,
          });
          if (uri) {
            onSetAppearance?.(level, uri);
          }
        },
      },
    ];
    if (moodAppearance?.[level]) {
      buttons.push({
        text: t.reflection.resetIcon,
        onPress: () => onSetAppearance?.(level, null),
      });
    }
    buttons.push({ text: t.reflection.cancel, style: 'cancel' });
    Alert.alert(t.reflection.customizeTitle, t.reflection.customizeMessage, buttons);
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.reportOverlay}>
        <Pressable style={styles.reportBackdrop} onPress={onClose} />

        <View
          style={[
            styles.reflectionSheet,
            {
              maxHeight: sheetMaxHeight,
              // A folha é ancorada no fundo da TELA e o teclado sobrepõe essa
              // faixa (edge-to-edge): empurra a folha inteira pra cima na
              // altura do teclado, pra base dela sentar no topo do teclado.
              marginBottom: keyboardOverlap,
              // Sobe a base da folha pra não brigar com os botões de navegação
              // do celular (com teclado aberto ele já cobre essa área).
              paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom,
            },
          ]}
        >
          <View style={styles.reflectionHeader}>
            <View>
              <Text style={styles.reflectionTitle}>{t.reflection.title}</Text>
              <Text style={styles.reflectionDate}>{dateLabel}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close-circle" size={30} color="#817b96" />
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.reflectionScrollContent}
            onLayout={() => {
              // O viewport muda de tamanho quando o teclado abre; nesse momento
              // rola até a nota pra ela continuar à vista.
              if (keyboardHeightRef.current > 0) {
                scrollToNote(false);
              }
            }}
          >
            <Text style={styles.reflectionQuestion}>{t.reflection.moodQuestion}</Text>
            <View style={styles.reflectionMoodRow}>
              {MOOD_LEVELS.map((level) => {
                const isSelected = level === selectedLevel;
                const customUri = moodAppearance?.[level];
                return (
                  <TouchableOpacity
                    key={level}
                    style={styles.reflectionMoodOption}
                    onPress={() =>
                      setSelectedLevel((previous) => (previous === level ? null : level))
                    }
                    onLongPress={() => handleCustomizeLevel(level)}
                    delayLongPress={400}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.reflection.levels[level]}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={[
                        styles.reflectionMoodCircle,
                        isSelected && styles.reflectionMoodCircleSelected,
                      ]}
                    >
                      {customUri ? (
                        <Image
                          source={{ uri: customUri }}
                          style={styles.reflectionMoodImage}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.reflectionMoodEmoji,
                            !isSelected && selectedLevel != null && styles.reflectionMoodEmojiDim,
                          ]}
                        >
                          {DEFAULT_MOOD_EMOJIS[level]}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.reflectionMoodLabel,
                        isSelected && styles.reflectionMoodLabelSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {t.reflection.levels[level]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.reflectionHint}>{t.reflection.customizeHint}</Text>
            {selectedLevel ? (
              <Pressable
                style={styles.reflectionCustomizeButton}
                onPress={() => handleCustomizeLevel(selectedLevel)}
                accessibilityRole="button"
                accessibilityLabel={t.reflection.customizeSelected.replace(
                  '{mood}',
                  t.reflection.levels[selectedLevel]
                )}
              >
                <Ionicons name="color-wand-outline" size={16} color="#3c2ba7" />
                <Text style={styles.reflectionCustomizeButtonText}>
                  {t.reflection.customizeSelected.replace(
                    '{mood}',
                    t.reflection.levels[selectedLevel]
                  )}
                </Text>
              </Pressable>
            ) : null}

            <Text style={styles.reflectionQuestion}>{t.reflection.tagsQuestion}</Text>
            <View style={styles.reflectionTagRow}>
              {MOOD_TAG_KEYS.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.reflectionTagChip,
                      isSelected && styles.reflectionTagChipSelected,
                    ]}
                    onPress={() => handleToggleTag(tag)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t.reflection.tags[tag]}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.reflectionTagText,
                        isSelected && styles.reflectionTagTextSelected,
                      ]}
                    >
                      {t.reflection.tags[tag]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.reflectionNoteInput}
              value={note}
              onChangeText={setNote}
              onLayout={(event) => {
                noteInputYRef.current = event.nativeEvent.layout.y;
              }}
              onFocus={() => setTimeout(() => scrollToNote(true), 120)}
              placeholder={t.reflection.notePlaceholder}
              placeholderTextColor="#68637f"
              multiline
              maxLength={500}
              textAlignVertical="top"
            />

            {photo ? (
              <View style={styles.reflectionPhotoWrapper}>
                <Image source={{ uri: photo }} style={styles.reflectionPhoto} />
                <TouchableOpacity
                  style={styles.reflectionPhotoRemove}
                  onPress={() => setPhoto(null)}
                  hitSlop={8}
                  accessibilityLabel={t.reflection.remove}
                >
                  <Ionicons name="close" size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.reflectionPhotoButton}
                onPress={handlePickPhoto}
                disabled={isLoadingImage}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ busy: isLoadingImage, disabled: isLoadingImage }}
              >
                {isLoadingImage ? (
                  <ActivityIndicator size="small" color="#3c2ba7" />
                ) : (
                  <Ionicons name="camera-outline" size={18} color="#3c2ba7" />
                )}
                <Text style={styles.reflectionPhotoButtonText}>
                  {t.reflection.addPhoto}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.reflectionActions}>
              {hasExisting && (
                <TouchableOpacity
                  style={styles.reflectionRemoveButton}
                  onPress={handleRemove}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t.reflection.remove}
                >
                  <Ionicons name="trash-outline" size={18} color="#b82f3b" />
                  <Text style={styles.reflectionRemoveText}>{t.reflection.remove}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.reflectionSaveButton,
                  !canSave && styles.reflectionSaveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={!canSave}
                activeOpacity={0.85}
              >
                <Text style={styles.reflectionSaveText}>{t.reflection.save}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default ReflectionSheet;
