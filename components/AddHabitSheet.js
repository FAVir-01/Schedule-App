import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const SHEET_OPEN_DURATION = 300;
const SHEET_CLOSE_DURATION = 220;
const BACKDROP_MAX_OPACITY = 0.5;

const COLORS = ['#FFCF70', '#F7A6A1', '#B39DD6', '#79C3FF', '#A8E6CF', '#FDE2A6'];
const EMOJIS = [
  // carinhas & emoções
  '😀','😁','😂','🤣','😊','🙂','🙃','😉','😍','🥰','😘','😗','😙','😚','🤗','🤩','🤔','🤨','😐','😑','😶',
  '😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','🙄','😓','😔','😕','☹️','🙁',
  '😖','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤒','🤕','🤢','🤮','🤧',
  '😇','🤠','🥳','😎','🤓','🫠','🥸','🤡','💀','👻','👽','🤖','💩',

  // gestos & mãos
  '👍','👎','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👊','👏','🙌','👐','🤲','🙏','🫶','🤝','👋','✋','🖐️',
  '👉','👈','☝️','👇','👆','🫵','✍️',

  // pessoas/atividades físicas & bem-estar
  '🏃‍♂️','🏃‍♀️','🚶‍♂️','🚶‍♀️','🏋️‍♂️','🏋️‍♀️','🤸‍♂️','🤸‍♀️','🏊‍♂️','🏊‍♀️','🚴‍♂️','🚴‍♀️','🧗‍♂️','🧗‍♀️','🧘‍♂️','🧘‍♀️','🤾‍♂️','🤾‍♀️',
  '⛹️‍♂️','⛹️‍♀️','🤺','🤼‍♂️','🤼‍♀️','🤽‍♂️','🤽‍♀️','🚵‍♂️','🚵‍♀️','🧎‍♂️','🧎‍♀️','🧍‍♂️','🧍‍♀️',

  // natureza, clima, dia/noite
  '☀️','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','🌈','🌪️','🌫️','💨',
  '🌙','🌛','🌟','✨','💫','⚡','🔥','💧','💦','🌊',
  '🌱','🌿','🍃','🌵','🌷','🌼','🌻','🌸','💐','🍁','🍂','🍀',

  // comida & bebida (sem álcool)
  '🍎','🍏','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🍍','🥭','🥝','🥑','🍅','🥕','🌽','🥦','🥒','🧄','🧅',
  '🍞','🥐','🥖','🥨','🥯','🧇','🥞','🧀','🍳','🥚','🥗','🥙','🌯','🌮','🍔','🍟','🍕','🍝','🍜','🍣','🍱','🥟','🥠','🍲',
  '🍚','🍛','🍥','🍡','🍢','🍘','🍙','🍿','🍫','🍪','🍩','🧁','🎂','🍰','🍦','🍨','🍧','🍯','🍮','🍵','☕','🧋','🥤','🧃','🧉','💧','🚰',

  // objetos úteis para tarefas/hábitos
  '⏰','⏱️','⏲️','🕰️','🗓️','📅','📆','📋','🗒️','📝','📖','📚','📘','📙','📗','📓','📔',
  '🧠','💡','🔋','🔌','🔋','🪫','🔧','🛠️','🧰','🧪','🔬','⚖️','🧯','🧹','🪣','🧼','🪥','🪒','🚿','🛁',
  '💻','🖥️','⌨️','🖱️','📱','📲','🎧','📷','🎥','🎙️','📎','📌','📍','🔖','🔗','🔒','🔓','🔑','🗝️','🔔','🔕',

  // casa/locais & transporte
  '🏠','🏡','🏢','🏫','🏥','🏬','🏪','🏖️','🏕️','⛰️','🏞️','🌋','🏜️',
  '🚗','🚕','🚙','🚌','🚎','🚑','🚒','🚓','🚚','🚲','🛵','🏍️','🚆','🚄','✈️','🛫','🛬','🚀','⛵','🚤','🚢',

  // hobbies & diversão
  '🎨','🖌️','🧵','🧶','🎸','🎹','🥁','🎻','🎤','🎮','🎲','♟️','🧩','📷','🎞️','🎬','🎯','🎳','🏸','🥊','🥋',

  // animais (amostra ampla)
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
  '🐔','🐧','🦆','🦅','🦉','🦇','🐢','🐍','🦎','🐙','🪼','🐠','🐟','🐡','🐬','🦈','🐳','🐋',
  '🐝','🦋','🐞','🪲','🐜','🪳','🪰','🕷️','🕸️',

  // símbolos & status
  '✅','☑️','✔️','❌','✖️','⭕','❗','❕','⁉️','❓','❔',
  '🔴','🟠','🟡','🟢','🔵','🟣','⚪','⚫','⬜','⬛','🔺','🔻','🔸','🔹',
  '⭐','🌟','✨','💫','🎯','🏆','🎖️','🥇','🥈','🥉',
  '💬','🗨️','🗯️','🔊','🔇','📣','📢','📶',
  '💰','💸','💳','💵','💶','💷','💴','💹',

  // saúde & autocuidado
  '💊','💉','🩹','🩺','🧼','🪥','🧴','🛌','🧘','🫁','🫀','🧬',

  // os que você já tinha
  '🌟','🔥','💪','🧘','📚','🥗','🛏️','🚰','🎯','📝'
];
const DEFAULT_EMOJI = EMOJIS[0];

export default function AddHabitSheet({ visible, onClose, onCreate }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = useMemo(() => {
    const usableHeight = height - insets.top - insets.bottom;
    return Math.min(usableHeight * 0.92, usableHeight - 24);
  }, [height, insets.bottom, insets.top]);
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedEmoji, setSelectedEmoji] = useState(DEFAULT_EMOJI);
  const [isEmojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(visible);
  const titleInputRef = useRef(null);
  const translateY = useRef(new Animated.Value(sheetHeight || height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (!visible) {
      return;
    }
    setEmojiPickerVisible(false);
    onClose?.();
  }, [onClose, visible]);

  const handleSelectEmoji = useCallback((emoji) => {
    setSelectedEmoji(emoji);
    setEmojiPickerVisible(false);
  }, []);

  const handleToggleEmojiPicker = useCallback(() => {
    setEmojiPickerVisible((prev) => !prev);
  }, []);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      isClosingRef.current = false;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: BACKDROP_MAX_OPACITY,
          duration: SHEET_OPEN_DURATION,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 220,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start(() => {
        titleInputRef.current?.focus();
      });
      AccessibilityInfo.announceForAccessibility('Create habit');
    } else if (isMounted) {
      isClosingRef.current = true;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: SHEET_CLOSE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: sheetHeight || height,
          duration: SHEET_CLOSE_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (isClosingRef.current) {
          setIsMounted(false);
          translateY.setValue(sheetHeight || height);
          setTitle('');
          setSelectedColor(COLORS[0]);
          setSelectedEmoji(DEFAULT_EMOJI);
          setEmojiPickerVisible(false);
        }
      });
    }
  }, [backdropOpacity, height, isMounted, sheetHeight, translateY, visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const onHardwareBack = () => {
      handleClose();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);

    return () => {
      subscription.remove();
    };
  }, [handleClose, visible]);

  useEffect(() => {
    if (!isMounted) {
      translateY.setValue(sheetHeight || height);
    }
  }, [height, isMounted, sheetHeight, translateY]);

  const handleCreate = useCallback(() => {
    if (!title.trim()) {
      return;
    }
    onCreate?.({ title: title.trim(), color: selectedColor, emoji: selectedEmoji });
    handleClose();
  }, [handleClose, onCreate, selectedColor, selectedEmoji, title]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          visible && gestureState.dy > 6 && Math.abs(gestureState.dx) < 12,
        onPanResponderMove: (_, gestureState) => {
          if (!visible) {
            return;
          }
          const offset = Math.max(0, gestureState.dy);
          translateY.setValue(offset);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!visible) {
            return;
          }
          const shouldClose = gestureState.vy > 1.2 || gestureState.dy > sheetHeight * 0.25;
          if (shouldClose) {
            handleClose();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.9,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: (_, gestureState) => {
          if (!visible) {
            return;
          }
          const shouldClose = gestureState.vy > 1.2 || gestureState.dy > sheetHeight * 0.25;
          if (shouldClose) {
            handleClose();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              mass: 0.9,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [handleClose, sheetHeight, translateY, visible]
  );

  const isCreateDisabled = !title.trim();

  if (!isMounted) {
    return null;
  }

  return (
    <View pointerEvents={isMounted ? 'auto' : 'none'} style={styles.container}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        accessibilityRole="button"
        accessibilityLabel="Close create habit"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [{ translateY }],
            height: sheetHeight,
          },
        ]}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        {...panResponder.panHandlers}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={handleClose}
                hitSlop={16}
              >
                <Ionicons name="close" size={26} color="#6f7a86" />
              </Pressable>
              <Pressable
                style={[styles.createButton, isCreateDisabled && styles.createButtonDisabled]}
                accessibilityRole="button"
                accessibilityState={{ disabled: isCreateDisabled }}
                onPress={handleCreate}
                disabled={isCreateDisabled}
                hitSlop={12}
              >
                <Text style={[styles.createButtonText, isCreateDisabled && styles.createButtonTextDisabled]}>
                  Create
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollViewContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={[styles.emojiButton, isEmojiPickerVisible && styles.emojiButtonActive]}
                accessibilityRole="button"
                accessibilityLabel={`Choose emoji, currently ${selectedEmoji}`}
                accessibilityHint="Opens a list of emoji options"
                onPress={handleToggleEmojiPicker}
                hitSlop={12}
              >
                <Text style={styles.emoji}>{selectedEmoji}</Text>
                <Ionicons
                  name={isEmojiPickerVisible ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#6f7a86"
                  style={styles.emojiChevron}
                />
              </Pressable>
              {isEmojiPickerVisible && (
                <View style={styles.emojiPicker}>
                  {EMOJIS.map((emoji) => {
                    const isSelected = selectedEmoji === emoji;
                    return (
                      <Pressable
                        key={emoji}
                        style={[styles.emojiOption, isSelected && styles.emojiOptionSelected]}
                        onPress={() => handleSelectEmoji(emoji)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Select emoji ${emoji}`}
                      >
                        <Text style={styles.emojiOptionText}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={(text) => setTitle(text.slice(0, 50))}
                placeholder="New Task"
                placeholderTextColor="#7f8a9a"
                style={styles.titleInput}
                accessibilityLabel="New Task"
                maxLength={50}
                returnKeyType="done"
              />
              <Text style={styles.counter}>{`${title.length}/50`}</Text>
              <View style={styles.paletteContainer}>
                {COLORS.map((color) => {
                  const isSelected = selectedColor === color;
                  return (
                    <Pressable
                      key={color}
                      style={[styles.colorDot, { backgroundColor: color }, isSelected && styles.colorDotSelected]}
                      onPress={() => setSelectedColor(color)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Select color ${color}`}
                    >
                      {isSelected && <Ionicons name="checkmark" size={18} color="#1F2742" />}
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.listContainer}>
                <SheetRow icon="calendar-clear-outline" label="Date" value="Today" />
                <SheetRow icon="repeat-outline" label="Repeat" value="Off" />
                <SheetRow icon="time-outline" label="Time" value="Anytime" />
                <SheetRow icon="notifications-outline" label="Reminder" value="No Reminder" />
                <SheetRow icon="pricetag-outline" label="Tag" value="No tag" isLast />
              </View>
              <View style={styles.subtasksContainer}>
                <SheetRow icon="list-circle-outline" label="Subtasks" value="Add" showChevron isLast />
                <Text style={styles.subtasksHint}>
                  Subtasks can be set as your daily routine or checklist
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

function SheetRow({ icon, label, value, showChevron, isLast }) {
  return (
    <Pressable style={[styles.row, isLast && styles.rowLast]} accessibilityRole="button">
      <View style={styles.rowLeft}>
        <View style={styles.rowIconContainer}>
          <Ionicons name={icon} size={22} color="#61708A" />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        {showChevron && <Ionicons name="chevron-forward" size={20} color="#C2CBD8" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F1528',
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#DDE9FF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 24,
    overflow: 'hidden',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  createButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1F2742',
  },
  createButtonDisabled: {
    backgroundColor: '#B7C2D6',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  createButtonTextDisabled: {
    color: '#E5EBF6',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 48,
  },
  emojiButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 56,
    paddingHorizontal: 32,
    paddingVertical: 18,
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  emojiButtonActive: {
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  emoji: {
    fontSize: 52,
    textAlign: 'center',
  },
  emojiChevron: {
    marginTop: 10,
  },
  emojiPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F6FF',
  },
  emojiOptionSelected: {
    backgroundColor: '#DDE9FF',
    borderWidth: 2,
    borderColor: '#1F2742',
  },
  emojiOptionText: {
    fontSize: 28,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2742',
    textAlign: 'center',
  },
  counter: {
    textAlign: 'center',
    color: '#7F8A9A',
    marginTop: 4,
    marginBottom: 24,
    fontWeight: '500',
  },
  paletteContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  colorDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18, 32, 53, 0.2)',
  },
  colorDotSelected: {
    borderWidth: 2,
    borderColor: '#1F2742',
  },
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  subtasksContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  subtasksHint: {
    color: '#7F8A9A',
    fontSize: 13,
    marginTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(109, 125, 150, 0.16)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIconContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3FF',
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: '#1F2742',
    fontWeight: '600',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    color: '#7F8A9A',
    fontSize: 15,
  },
});
