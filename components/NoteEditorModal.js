// Editor compartilhado por Notes e pela aba de foto da tarefa.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { translations } from '../constants/i18n';
import {
  NOTE_CARD_COLORS,
  NOTE_MAX_IMAGES,
  NOTE_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
} from '../domain/notes';
import {
  deletePersistedImages,
  persistPickedImage,
} from '../services/imagePersistenceService';
import { styles } from '../styles/appStyles';
import { lightenColor } from '../utils/colorUtils';
import { IMAGE_LIMITS, getImageErrorMessage } from '../utils/imageUtils';

const chunkImages = (images) => {
  const rows = [];
  for (let index = 0; index < images.length; index += 2) {
    rows.push(images.slice(index, index + 2));
  }
  return rows;
};

function EditorImages({ images, onRemove }) {
  const rows = chunkImages(Array.isArray(images) ? images : []);
  if (!rows.length) {
    return null;
  }
  return (
    <View style={styles.noteEditorImageRows}>
      {rows.map((row, rowIndex) => (
        <View key={`${row[0]}-${rowIndex}`} style={styles.noteImageRow}>
          {row.map((uri) => (
            <View
              key={uri}
              style={[
                styles.noteImageCell,
                row.length === 1 && styles.noteImageCellSingle,
                styles.noteEditorImageCell,
              ]}
            >
              <Image source={{ uri }} style={styles.noteEditorImage} resizeMode="cover" />
              <Pressable
                style={styles.noteImageRemove}
                onPress={() => onRemove?.(uri)}
                hitSlop={7}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={14} color="#ffffff" />
              </Pressable>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function TaskOriginAvatar({ context, size = 28 }) {
  const [hasImageError, setHasImageError] = useState(false);
  useEffect(() => setHasImageError(false), [context?.taskImage]);

  return (
    <View
      style={[
        styles.noteTaskAvatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: context?.taskColor
            ? lightenColor(context.taskColor, 0.72)
            : '#eceaf8',
        },
      ]}
    >
      {context?.taskImage && !hasImageError ? (
        <Image
          source={{ uri: context.taskImage }}
          style={styles.noteTaskAvatarImage}
          onError={() => setHasImageError(true)}
        />
      ) : (
        <Text style={[styles.noteTaskAvatarEmoji, { fontSize: Math.max(11, size * 0.55) }]}>
          {context?.taskEmoji || '✓'}
        </Text>
      )}
    </View>
  );
}

const createEditorState = (note, defaultTitle, taskContext) => {
  const images = Array.isArray(note?.images) ? note.images : [];
  return {
    id: note?.id ?? null,
    source: note?.source ?? (taskContext ? 'task' : 'standalone'),
    title: note?.title ?? defaultTitle ?? '',
    text: note?.text ?? '',
    images: [...images],
    originalImages: [...images],
    pinned: note?.pinned === true,
    cardColor: note?.cardColor ?? null,
  };
};

export default function NoteEditorModal({
  visible,
  note = null,
  defaultTitle = '',
  taskContext = null,
  language = 'en',
  reduceMotion = false,
  onSave,
  onDelete,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const localePack = translations[language] ?? translations.en;
  const t = localePack.notes;
  const imageText = localePack.imageHandling;
  const [editor, setEditor] = useState(null);
  const [isPickingImages, setIsPickingImages] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [editorMenu, setEditorMenu] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const feedbackProgress = useRef(new Animated.Value(0)).current;
  const menuProgress = useRef(new Animated.Value(0)).current;
  const feedbackAnimationRef = useRef(null);
  const feedbackTimerRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    undoStackRef.current = [];
    redoStackRef.current = [];
    setEditorMenu(null);
    setFeedback(null);
    setEditor(createEditorState(note, defaultTitle, taskContext));
  }, [defaultTitle, note?.id, taskContext?.taskTitle, visible]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
      setEditorMenu(null);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!editorMenu) {
      return;
    }
    menuProgress.setValue(reduceMotion ? 1 : 0);
    const animation = Animated.spring(menuProgress, {
      toValue: 1,
      damping: 20,
      stiffness: 260,
      mass: 0.7,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [editorMenu, menuProgress, reduceMotion]);

  useEffect(
    () => () => {
      feedbackAnimationRef.current?.stop?.();
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    },
    []
  );

  const hasCustomTitle = Boolean(
    editor?.title.trim() &&
      (!taskContext || note?.id || editor.title.trim() !== `${defaultTitle ?? ''}`.trim())
  );
  const canSave = Boolean(editor && (hasCustomTitle || editor.text.trim() || editor.images.length));

  const showFeedback = useCallback(
    (message, icon) => {
      void Haptics.selectionAsync().catch(() => {});
      setFeedback({ message, icon });
      feedbackAnimationRef.current?.stop?.();
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      feedbackProgress.setValue(reduceMotion ? 1 : 0);
      if (reduceMotion) {
        feedbackTimerRef.current = setTimeout(() => setFeedback(null), 900);
        return;
      }
      const animation = Animated.sequence([
        Animated.spring(feedbackProgress, {
          toValue: 1,
          damping: 18,
          stiffness: 280,
          mass: 0.65,
          useNativeDriver: true,
        }),
        Animated.delay(750),
        Animated.timing(feedbackProgress, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]);
      feedbackAnimationRef.current = animation;
      animation.start(({ finished }) => {
        if (finished) {
          setFeedback(null);
        }
      });
    },
    [feedbackProgress, reduceMotion]
  );

  const closeEditor = useCallback(
    (discardNewImages = true) => {
      Keyboard.dismiss();
      feedbackAnimationRef.current?.stop?.();
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
      setEditorMenu(null);
      undoStackRef.current = [];
      redoStackRef.current = [];
      if (discardNewImages && editor) {
        const originals = new Set(editor.originalImages);
        void deletePersistedImages(editor.images.filter((uri) => !originals.has(uri)));
      }
      setEditor(null);
      onClose?.();
    },
    [editor, onClose]
  );

  const updateEditorTextField = useCallback((field, value) => {
    setEditor((current) => {
      if (!current || current[field] === value) {
        return current;
      }
      undoStackRef.current = [
        ...undoStackRef.current,
        { title: current.title, text: current.text },
      ].slice(-80);
      redoStackRef.current = [];
      return { ...current, [field]: value };
    });
  }, []);

  const handleUndo = useCallback(() => {
    setEditor((current) => {
      const previous = undoStackRef.current.pop();
      if (!current || !previous) {
        return current;
      }
      redoStackRef.current.push({ title: current.title, text: current.text });
      return { ...current, ...previous };
    });
    void Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleRedo = useCallback(() => {
    setEditor((current) => {
      const next = redoStackRef.current.pop();
      if (!current || !next) {
        return current;
      }
      undoStackRef.current.push({ title: current.title, text: current.text });
      return { ...current, ...next };
    });
    void Haptics.selectionAsync().catch(() => {});
  }, []);

  const handlePickImages = useCallback(async () => {
    if (!editor || isPickingImages) {
      return;
    }
    const remaining = NOTE_MAX_IMAGES - editor.images.length;
    if (remaining <= 0) {
      Alert.alert(t.imageLimitTitle, t.imageLimitMessage.replace('{count}', String(NOTE_MAX_IMAGES)));
      return;
    }
    const persisted = [];
    try {
      setIsPickingImages(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }
      for (const asset of result.assets.slice(0, remaining)) {
        persisted.push(
          await persistPickedImage(asset, {
            prefix: 'custom_note_image',
            limits: IMAGE_LIMITS.noteImage,
          })
        );
      }
      setEditor((current) =>
        current ? { ...current, images: [...current.images, ...persisted] } : current
      );
      showFeedback(t.imagesAdded, 'images-outline');
    } catch (error) {
      void deletePersistedImages(persisted);
      console.warn('Failed to select or persist note image', error);
      Alert.alert(
        imageText.errorTitle,
        getImageErrorMessage(imageText, error, IMAGE_LIMITS.noteImage)
      );
    } finally {
      setIsPickingImages(false);
    }
  }, [editor, imageText, isPickingImages, showFeedback, t]);

  const handleRemoveEditorImage = useCallback((uri) => {
    setEditor((current) => {
      if (!current) {
        return current;
      }
      if (!current.originalImages.includes(uri)) {
        void deletePersistedImages([uri]);
      }
      return { ...current, images: current.images.filter((imageUri) => imageUri !== uri) };
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!editor || !canSave || isPickingImages) {
      return;
    }
    const saved = onSave?.({
      id: editor.id,
      source: editor.source,
      title: editor.title,
      text: editor.text,
      images: editor.images,
      pinned: editor.pinned === true,
      cardColor: editor.cardColor ?? null,
    });
    if (saved === false) {
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    closeEditor(false);
  }, [canSave, closeEditor, editor, isPickingImages, onSave]);

  const handleDelete = useCallback(() => {
    if (!editor?.id) {
      return;
    }
    setEditorMenu(null);
    Alert.alert(t.deleteTitle, t.deleteMessage, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => {
          if (onDelete?.(editor.id) !== false) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
              () => {}
            );
            closeEditor(false);
          }
        },
      },
    ]);
  }, [closeEditor, editor, onDelete, t]);

  const handleToggleEditorMenu = useCallback((menu) => {
    Keyboard.dismiss();
    setEditorMenu((current) => (current === menu ? null : menu));
  }, []);

  const handleSelectCardColor = useCallback(
    (cardColor) => {
      setEditor((current) => (current ? { ...current, cardColor } : current));
      showFeedback(t.colorChanged, 'color-palette-outline');
    },
    [showFeedback, t.colorChanged]
  );

  const handleTogglePinned = useCallback(() => {
    const nextPinned = editor?.pinned !== true;
    setEditor((current) => (current ? { ...current, pinned: nextPinned } : current));
    showFeedback(nextPinned ? t.notePinned : t.noteUnpinned, nextPinned ? 'pin' : 'pin-outline');
  }, [editor?.pinned, showFeedback, t.notePinned, t.noteUnpinned]);

  const popoverAnimationStyle = {
    transform: [
      {
        translateY: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
      },
      { scale: menuProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={() => closeEditor(true)}
    >
      <SafeAreaView
        style={styles.noteEditorScreen}
        edges={isKeyboardVisible ? ['top'] : ['top', 'bottom']}
      >
        <KeyboardAvoidingView
          style={styles.noteEditorKeyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.noteEditorHeader}>
            <Pressable
              style={styles.noteEditorHeaderButton}
              onPress={() => closeEditor(true)}
              accessibilityRole="button"
              accessibilityLabel={t.cancel}
            >
              <Ionicons name="arrow-back" size={27} color="#242832" />
            </Pressable>
            <View style={styles.noteEditorHeaderActions}>
              {isKeyboardVisible ? (
                <>
                  <Pressable
                    style={[
                      styles.noteEditorHeaderButton,
                      undoStackRef.current.length === 0 && styles.noteEditorToolButtonDisabled,
                    ]}
                    onPress={handleUndo}
                    disabled={undoStackRef.current.length === 0}
                    accessibilityRole="button"
                    accessibilityLabel={t.undo}
                  >
                    <Ionicons name="arrow-undo-outline" size={24} color="#4c5260" />
                  </Pressable>
                  <Pressable
                    style={[
                      styles.noteEditorHeaderButton,
                      redoStackRef.current.length === 0 && styles.noteEditorToolButtonDisabled,
                    ]}
                    onPress={handleRedo}
                    disabled={redoStackRef.current.length === 0}
                    accessibilityRole="button"
                    accessibilityLabel={t.redo}
                  >
                    <Ionicons name="arrow-redo-outline" size={24} color="#4c5260" />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.noteEditorHeaderButton}
                    onPress={() => handleToggleEditorMenu('palette')}
                    accessibilityRole="button"
                    accessibilityLabel={t.changeSkin}
                  >
                    <Ionicons name="shirt-outline" size={24} color="#3f4552" />
                  </Pressable>
                  <Pressable
                    style={styles.noteEditorHeaderButton}
                    onPress={() => handleToggleEditorMenu('more')}
                    accessibilityRole="button"
                    accessibilityLabel={t.moreOptions}
                  >
                    <Ionicons name="ellipsis-vertical" size={24} color="#3f4552" />
                  </Pressable>
                </>
              )}
              <Pressable
                style={[styles.noteEditorDoneButton, !canSave && styles.noteEditorSaveDisabled]}
                onPress={handleSave}
                disabled={!canSave || isPickingImages}
                accessibilityRole="button"
                accessibilityLabel={t.save}
                accessibilityState={{ disabled: !canSave || isPickingImages }}
              >
                <Ionicons name="checkmark" size={25} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          {feedback ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.noteEditorFeedback,
                {
                  bottom: isKeyboardVisible ? 72 : insets.bottom + 24,
                  opacity: feedbackProgress,
                  transform: [
                    {
                      translateY: feedbackProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-8, 0],
                      }),
                    },
                    {
                      scale: feedbackProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.94, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Ionicons name={feedback.icon} size={17} color="#ffffff" />
              <Text style={styles.noteEditorFeedbackText}>{feedback.message}</Text>
            </Animated.View>
          ) : null}

          {editorMenu ? (
            <Pressable
              style={[styles.noteEditorMenuBackdrop, { top: insets.top + 64 }]}
              onPress={() => setEditorMenu(null)}
              accessibilityRole="button"
              accessibilityLabel={t.closeMenu}
            />
          ) : null}

          {editorMenu === 'palette' ? (
            <Animated.View
              style={[
                styles.noteEditorPopover,
                { top: insets.top + 58 },
                popoverAnimationStyle,
              ]}
            >
              <Text style={styles.noteEditorPopoverTitle}>{t.cardSkin}</Text>
              <View style={styles.noteEditorPalette}>
                {[null, ...NOTE_CARD_COLORS].map((color) => {
                  const isSelected = (editor?.cardColor ?? null) === color;
                  return (
                    <Pressable
                      key={color ?? 'default'}
                      style={[
                        styles.noteEditorColorOuter,
                        isSelected && styles.noteEditorColorOuterSelected,
                      ]}
                      onPress={() => handleSelectCardColor(color)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={color ? t.colorSkin : t.defaultSkin}
                    >
                      <View
                        style={[
                          styles.noteEditorColorDot,
                          { backgroundColor: color ?? '#f5f5f7' },
                        ]}
                      >
                        {isSelected ? (
                          <Ionicons name="checkmark" size={15} color="#252a36" />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          ) : null}

          {editorMenu === 'more' ? (
            <Animated.View
              style={[
                styles.noteEditorPopover,
                { top: insets.top + 58 },
                popoverAnimationStyle,
              ]}
            >
              <Pressable
                style={styles.noteEditorMenuItem}
                onPress={handleTogglePinned}
                accessibilityRole="button"
              >
                <Ionicons
                  name={editor?.pinned ? 'pin' : 'pin-outline'}
                  size={20}
                  color="#3f4552"
                />
                <Text style={styles.noteEditorMenuItemText}>
                  {editor?.pinned ? t.unpin : t.pin}
                </Text>
              </Pressable>
              {editor?.id ? (
                <>
                  <View style={styles.noteEditorMenuDivider} />
                  <Pressable
                    style={styles.noteEditorMenuItem}
                    onPress={handleDelete}
                    accessibilityRole="button"
                  >
                    <Ionicons name="trash-outline" size={20} color="#c4485a" />
                    <Text style={styles.noteEditorMenuItemDanger}>{t.delete}</Text>
                  </Pressable>
                </>
              ) : null}
            </Animated.View>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.noteEditorContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {taskContext ? (
              <View style={styles.noteEditorTaskLabel}>
                <TaskOriginAvatar context={taskContext} />
                <Text style={styles.noteEditorTaskLabelText} numberOfLines={2}>
                  {taskContext.taskTitle || t.unknownTask}
                </Text>
              </View>
            ) : null}

            <TextInput
              style={styles.noteEditorTitleInput}
              value={editor?.title ?? ''}
              onChangeText={(title) => updateEditorTextField('title', title)}
              autoFocus={!note?.id}
              maxLength={NOTE_TITLE_MAX_LENGTH}
              placeholder={t.titlePlaceholder}
              placeholderTextColor="#a3a8b1"
              accessibilityLabel={t.titlePlaceholder}
            />

            <TextInput
              style={styles.noteEditorTextInput}
              value={editor?.text ?? ''}
              onChangeText={(text) => updateEditorTextField('text', text)}
              multiline
              maxLength={NOTE_MAX_LENGTH}
              placeholder={t.newNotePlaceholder}
              placeholderTextColor="#a3a8b1"
              textAlignVertical="top"
              accessibilityLabel={t.newNotePlaceholder}
            />

            <EditorImages images={editor?.images ?? []} onRemove={handleRemoveEditorImage} />
          </ScrollView>

          {isKeyboardVisible ? (
            <View style={styles.noteEditorKeyboardToolbar}>
              <Pressable
                style={styles.noteEditorKeyboardTool}
                onPress={handlePickImages}
                disabled={isPickingImages || (editor?.images.length ?? 0) >= NOTE_MAX_IMAGES}
                accessibilityRole="button"
                accessibilityLabel={t.addImages}
              >
                {isPickingImages ? (
                  <ActivityIndicator size="small" color="#4938b8" />
                ) : (
                  <Ionicons name="image-outline" size={25} color="#4938b8" />
                )}
                <Text style={styles.noteEditorKeyboardToolText}>
                  {(editor?.images.length ?? 0) >= NOTE_MAX_IMAGES
                    ? t.imageLimitReached
                    : t.image}
                </Text>
              </Pressable>
              <Text style={styles.noteEditorImageCount}>
                {`${editor?.images.length ?? 0}/${NOTE_MAX_IMAGES}`}
              </Text>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
