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
import {
  TEXT_RECOGNITION_ERROR_CODES,
  recognizeTextFromImage,
} from '../services/textRecognitionService';
import { styles } from '../styles/appStyles';
import { IMAGE_LIMITS, getImageErrorMessage, isGifImageAsset } from '../utils/imageUtils';
import {
  DEFAULT_MOOD_EMOJIS,
  MOOD_LEVELS,
  MOOD_TAG_KEYS,
  hasPrivateReflectionContent,
  hasReflectionContent,
} from '../utils/moodUtils';
import {
  MAX_REFLECTION_NOTE_LENGTH,
  appendRecognizedText,
} from '../utils/textRecognitionUtils';
import DiaryPrivacyMask from './DiaryPrivacyMask';
import ImageCropModal from './ImageCropModal';

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
  isDiaryPrivacyEnabled = false,
  isDiaryUnlocked = false,
  onRequestDiaryUnlock,
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const t = translations[language] ?? translations.en;
  const imageText = t.imageHandling;
  const isPrivateLocked =
    isDiaryPrivacyEnabled &&
    !isDiaryUnlocked &&
    hasPrivateReflectionContent(mood);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [pendingCropRequest, setPendingCropRequest] = useState(null);
  const [isRecognizingText, setIsRecognizingText] = useState(false);
  // `null` = editor normal. Uma string, inclusive vazia durante a edição,
  // representa a etapa interna de revisão e ainda não altera `note`.
  const [recognizedTextDraft, setRecognizedTextDraft] = useState(null);
  const recognitionRequestRef = useRef(0);
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
      setRecognizedTextDraft(null);
      setIsRecognizingText(false);
      setPendingCropRequest(null);
    }
    // Ignora a resposta de um OCR iniciado para uma abertura anterior da folha.
    recognitionRequestRef.current += 1;
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
  const mergedRecognizedText =
    recognizedTextDraft == null
      ? note
      : appendRecognizedText(note, recognizedTextDraft);
  const recognizedTextExceedsLimit =
    mergedRecognizedText.length > MAX_REFLECTION_NOTE_LENGTH;

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

  const pickImage = async ({
    source = 'gallery',
    quality = 1,
    limits,
    prefix,
    cropSquare = false,
    cropLevel = null,
  }) => {
    if (isLoadingImage) {
      return null;
    }
    try {
      setIsLoadingImage(true);
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            t.reflection.photoCameraPermissionTitle,
            t.reflection.photoCameraPermissionMessage
          );
          return null;
        }
      }
      const launch =
        source === 'camera'
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;
      const result = await launch({
        mediaTypes: ['images'],
        // Mantém o arquivo original. GIFs seguem direto e imagens estáticas
        // usam o editor quadrado do próprio app quando solicitado.
        allowsEditing: false,
        quality,
      });
      if (result.canceled || !result.assets?.length) {
        return null;
      }
      const asset = result.assets[0];
      if (cropSquare && !isGifImageAsset(asset)) {
        setPendingCropRequest({ asset, prefix, limits, level: cropLevel });
        return null;
      }
      return await persistPickedImage(asset, { prefix, limits });
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

  const handleConfirmCrop = async (croppedAsset) => {
    if (!pendingCropRequest) {
      return;
    }
    try {
      const persistentUri = await persistPickedImage(croppedAsset, {
        prefix: pendingCropRequest.prefix,
        limits: pendingCropRequest.limits,
      });
      onSetAppearance?.(pendingCropRequest.level, persistentUri);
      setPendingCropRequest(null);
    } catch (error) {
      console.warn('Failed to crop or persist mood appearance', error);
      Alert.alert(
        imageText.errorTitle,
        getImageErrorMessage(imageText, error, pendingCropRequest.limits)
      );
    }
  };

  const handleCropError = (error) => {
    console.warn('Failed to crop mood appearance', error);
    Alert.alert(
      imageText.errorTitle,
      getImageErrorMessage(imageText, error, pendingCropRequest?.limits)
    );
  };

  const handlePickPhoto = async (source) => {
    const uri = await pickImage({
      source,
      quality: 0.75,
      limits: IMAGE_LIMITS.reflectionPhoto,
      prefix: 'custom_mood_photo',
    });
    if (uri) {
      setPhoto(uri);
    }
  };

  const handleOpenPhotoSource = () => {
    Keyboard.dismiss();
    Alert.alert(
      t.reflection.photoSourceTitle,
      t.reflection.photoSourceMessage,
      [
        {
          text: t.reflection.scan.camera,
          onPress: () => void handlePickPhoto('camera'),
        },
        {
          text: t.reflection.scan.gallery,
          onPress: () => void handlePickPhoto('gallery'),
        },
        { text: t.reflection.cancel, style: 'cancel' },
      ]
    );
  };

  const showRecognitionError = (error) => {
    let message = t.reflection.scan.failedMessage;
    if (error?.code === TEXT_RECOGNITION_ERROR_CODES.UNAVAILABLE) {
      message = t.reflection.scan.unavailableMessage;
    } else if (error?.code === TEXT_RECOGNITION_ERROR_CODES.INVALID_IMAGE) {
      message = t.reflection.scan.invalidImageMessage;
    }
    Alert.alert(t.reflection.scan.errorTitle, message);
  };

  const handleRecognizeImage = async (source) => {
    if (isRecognizingText || isLoadingImage) {
      return;
    }

    let requestId = null;
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            t.reflection.scan.cameraPermissionTitle,
            t.reflection.scan.cameraPermissionMessage
          );
          return;
        }
      }

      const launch =
        source === 'camera'
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;
      const result = await launch({
        mediaTypes: ['images'],
        allowsEditing: true,
        shape: 'rectangle',
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }

      requestId = recognitionRequestRef.current + 1;
      recognitionRequestRef.current = requestId;
      setIsRecognizingText(true);
      const recognized = await recognizeTextFromImage(
        result.assets[0].uri,
        language
      );
      if (requestId !== recognitionRequestRef.current) {
        return;
      }
      if (!recognized) {
        Alert.alert(
          t.reflection.scan.noTextTitle,
          t.reflection.scan.noTextMessage
        );
        return;
      }

      Keyboard.dismiss();
      setRecognizedTextDraft(recognized);
    } catch (error) {
      if (requestId != null && requestId !== recognitionRequestRef.current) {
        return;
      }
      console.warn('Failed to recognize reflection text', error);
      showRecognitionError(error);
    } finally {
      if (requestId == null || requestId === recognitionRequestRef.current) {
        setIsRecognizingText(false);
      }
    }
  };

  const handleOpenTextScanner = () => {
    Keyboard.dismiss();
    Alert.alert(
      t.reflection.scan.sourceTitle,
      t.reflection.scan.sourceMessage,
      [
        {
          text: t.reflection.scan.camera,
          onPress: () => void handleRecognizeImage('camera'),
        },
        {
          text: t.reflection.scan.gallery,
          onPress: () => void handleRecognizeImage('gallery'),
        },
        { text: t.reflection.cancel, style: 'cancel' },
      ]
    );
  };

  const handleInsertRecognizedText = () => {
    if (!recognizedTextDraft?.trim() || recognizedTextExceedsLimit) {
      return;
    }
    setNote(mergedRecognizedText);
    setRecognizedTextDraft(null);
    setTimeout(() => scrollToNote(true), 120);
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
            cropLevel: level,
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

  if (isPrivateLocked) {
    return (
      <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
        <View style={styles.reportOverlay}>
          <Pressable style={styles.reportBackdrop} onPress={onClose} />
          <View
            style={[
              styles.reflectionSheet,
              {
                maxHeight: height * 0.85,
                paddingBottom: insets.bottom,
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
            <DiaryPrivacyMask
              hasText={Boolean(`${mood?.note ?? ''}`.trim())}
              hasPhoto={Boolean(mood?.photo)}
              editor
              label={t.diaryPrivacy.unlock}
              onUnlock={onRequestDiaryUnlock}
            />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <>
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={() => {
        if (recognizedTextDraft != null) {
          setRecognizedTextDraft(null);
          return;
        }
        onClose();
      }}
    >
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

          {recognizedTextDraft != null ? (
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.reflectionScrollContent}
            >
              <View style={styles.reflectionScanReviewHeading}>
                <Ionicons name="scan-outline" size={20} color="#3c2ba7" />
                <Text style={styles.reflectionScanReviewTitle}>
                  {t.reflection.scan.reviewTitle}
                </Text>
              </View>
              <Text style={styles.reflectionScanReviewHint}>
                {t.reflection.scan.reviewHint}
              </Text>
              <TextInput
                style={styles.reflectionScanReviewInput}
                value={recognizedTextDraft}
                onChangeText={setRecognizedTextDraft}
                placeholder={t.reflection.scan.reviewPlaceholder}
                placeholderTextColor="#68637f"
                multiline
                maxLength={MAX_REFLECTION_NOTE_LENGTH}
                textAlignVertical="top"
                accessibilityLabel={t.reflection.scan.reviewAccessibilityLabel}
              />
              {recognizedTextExceedsLimit ? (
                <Text style={styles.reflectionScanLimitError}>
                  {t.reflection.scan.tooLongMessage.replace(
                    '{max}',
                    MAX_REFLECTION_NOTE_LENGTH.toLocaleString(locale)
                  )}
                </Text>
              ) : null}
              <View style={styles.reflectionActions}>
                <TouchableOpacity
                  style={styles.reflectionScanCancelButton}
                  onPress={() => setRecognizedTextDraft(null)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                >
                  <Text style={styles.reflectionScanCancelText}>
                    {t.reflection.cancel}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.reflectionSaveButton,
                    (!recognizedTextDraft.trim() || recognizedTextExceedsLimit) &&
                      styles.reflectionSaveButtonDisabled,
                  ]}
                  onPress={handleInsertRecognizedText}
                  disabled={
                    !recognizedTextDraft.trim() || recognizedTextExceedsLimit
                  }
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={styles.reflectionSaveText}>
                    {t.reflection.scan.addToReflection}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
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

            <View
              onLayout={(event) => {
                noteInputYRef.current = event.nativeEvent.layout.y;
              }}
              style={styles.reflectionNoteField}
            >
              <TextInput
                style={styles.reflectionNoteInput}
                value={note}
                onChangeText={setNote}
                onFocus={() => setTimeout(() => scrollToNote(true), 120)}
                placeholder={t.reflection.notePlaceholder}
                placeholderTextColor="#68637f"
                multiline
                maxLength={MAX_REFLECTION_NOTE_LENGTH}
                textAlignVertical="top"
              />
              <View style={styles.reflectionNoteToolbar}>
                <Pressable
                  style={({ pressed }) => [
                    styles.reflectionScanButton,
                    pressed && styles.reflectionScanButtonPressed,
                  ]}
                  onPress={handleOpenTextScanner}
                  disabled={isRecognizingText || isLoadingImage}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t.reflection.scan.accessibilityLabel}
                  accessibilityState={{
                    busy: isRecognizingText,
                    disabled: isRecognizingText || isLoadingImage,
                  }}
                >
                  {isRecognizingText ? (
                    <ActivityIndicator size="small" color="#3c2ba7" />
                  ) : (
                    <Ionicons name="scan-outline" size={20} color="#3c2ba7" />
                  )}
                </Pressable>
              </View>
            </View>

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
                onPress={handleOpenPhotoSource}
                disabled={isLoadingImage || isRecognizingText}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{
                  busy: isLoadingImage,
                  disabled: isLoadingImage || isRecognizingText,
                }}
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
          )}
        </View>
      </View>
    </Modal>
    <ImageCropModal
      visible={Boolean(pendingCropRequest)}
      asset={pendingCropRequest?.asset}
      strings={imageText}
      onCancel={() => setPendingCropRequest(null)}
      onConfirm={handleConfirmCrop}
      onError={handleCropError}
    />
    </>
  );
}

export default ReflectionSheet;
