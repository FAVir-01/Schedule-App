// Editor de tarefas (criar / editar / duplicar).
//
// Todo o formulário é um único rascunho imutável vindo de `domain/taskDraft`.
// Não existe estado espelhado por campo: os painéis alteram o rascunho direto e
// "voltar" restaura o snapshot tirado quando o painel abriu. Acrescentar um
// campo novo significa mexer no rascunho e na linha que o exibe, não em seis
// lugares.
//
// O rascunho é montado na ABERTURA da folha. A versão anterior limpava ~35
// estados no callback da animação de fechamento, e fechar e reabrir rápido
// pulava a limpeza — a tela de criação abria com os dados da tarefa anterior.

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { formatTaskTime, formatTimeValue } from '../utils/timeUtils';
import {
  getQuantumProgressLabel,
  hasTaskProgress,
  shouldResetTaskProgress,
} from '../utils/taskUtils';
import { translations } from '../constants/i18n';
import { persistPickedImage } from '../services/imagePersistenceService';
import { requestReminderPermission } from '../services/reminderService';
import { IMAGE_LIMITS, getImageErrorMessage } from '../utils/imageUtils';
import {
  DEFAULT_EMOJI,
  EDITOR_COLORS,
  REMINDER_OFFSETS,
  TITLE_MAX_LENGTH,
  createEmptyDraft,
  draftFromTask,
  draftToTask,
  getDraftError,
  minutesToTime,
  parseDigits,
  pickRandomEmoji,
  taskDraftReducer,
  timeToMinutes,
  validateDraft,
} from '../domain/taskDraft';
import {
  OptionList,
  OptionOverlay,
  SheetRow,
  TagPanel,
} from './taskEditor/parts';
import { HAPTICS_SUPPORTED } from './taskEditor/constants';
import DatePanel from './taskEditor/DatePanel';
import RepeatPanel from './taskEditor/RepeatPanel';
import TimePanel from './taskEditor/TimePanel';
import QuantumPanel from './taskEditor/QuantumFields';
import SubtasksPanel from './taskEditor/SubtasksPanel';
import TypePreviewCard from './taskEditor/TypePreviewCard';
import styles from './taskEditor/styles';

const SHEET_OPEN_DURATION = 300;
const SHEET_CLOSE_DURATION = 220;
const BACKDROP_MAX_OPACITY = 0.5;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const DEFAULT_TAG_KEYS = [
  'clean_room',
  'healthy_lifestyle',
  'morning_routine',
  'relationship',
  'sleep_better',
  'workout',
];

const REMINDER_ORDER = ['none', 'at_time', '5m', '15m', '30m', '1h'];

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;
  const int = Number.parseInt(value, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};

const lightenColor = (hex, amount = 0.6) => {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

const createTagKey = (label, existingKeys) => {
  const sanitized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = sanitized || 'tag';
  let candidate = base;
  let suffix = 2;
  while (existingKeys.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

export default function AddHabitSheet({
  visible,
  onClose,
  onCreate,
  onUpdate,
  mode = 'create',
  initialHabit,
  availableTagOptions = [],
  language = 'en',
  reduceMotion = false,
}) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const localePack = translations[language] ?? translations.en;
  const t = localePack.sheet;
  const common = localePack.common;
  const taskDisplayText = localePack.taskDisplay;
  const notificationText = localePack.notifications;
  const imageText = localePack.imageHandling;
  // Português usa relógio de 24h; inglês mantém AM/PM.
  const use24Hour = language === 'pt';

  const isEditMode = mode === 'edit';
  const isCopyMode = mode === 'copy';

  const [draft, dispatch] = useReducer(taskDraftReducer, undefined, () => createEmptyDraft());
  // `panel` guarda o snapshot de quando o painel abriu: voltar restaura esse
  // rascunho inteiro, o que dispensa uma cópia "pending" por campo.
  const [panel, setPanel] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [isMounted, setIsMounted] = useState(visible);
  const [customTags, setCustomTags] = useState([]);
  const [activeInfoKey, setActiveInfoKey] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const titleInputRef = useRef(null);
  const infoTimeoutRef = useRef(null);
  const isClosingRef = useRef(false);
  const isRequestingNotificationPermissionRef = useRef(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const sheetHeight = height - insets.top;
  const infoBubbleMaxWidth = useMemo(() => Math.max(220, width - 84), [width]);
  const sheetBackgroundColor = useMemo(() => lightenColor(draft.color, 0.75), [draft.color]);

  const submitLabel = isEditMode ? common.save : common.create;
  const accessibilityAnnouncement = isEditMode
    ? t.editHabitAnnouncement
    : isCopyMode
    ? t.duplicateHabitAnnouncement
    : t.createHabitAnnouncement;
  const closeSheetAccessibilityLabel = isEditMode
    ? t.closeEditHabit
    : isCopyMode
    ? t.closeDuplicateHabit
    : t.closeCreateHabit;

  // ---------------------------------------------------------------- ciclo ---

  useEffect(() => {
    if (!visible) {
      return;
    }
    // Reidrata na abertura, e não na saída: se a animação de fechamento for
    // interrompida, a próxima abertura ainda começa limpa.
    const nextDraft = initialHabit
      ? draftFromTask(initialHabit)
      : createEmptyDraft({ emoji: pickRandomEmoji() });
    dispatch({ type: 'hydrate', draft: nextDraft });
    setPanel(null);
    setShowErrors(false);
    setActiveInfoKey(null);
    setIsLoadingImage(false);
    setCustomTags([]);
    setCalendarMonth(new Date(nextDraft.startDate.getFullYear(), nextDraft.startDate.getMonth(), 1));
  }, [initialHabit, visible]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      isClosingRef.current = false;
      Animated.timing(backdropOpacity, {
        toValue: BACKDROP_MAX_OPACITY,
        duration: SHEET_OPEN_DURATION,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
      AccessibilityInfo.announceForAccessibility(accessibilityAnnouncement);
      return;
    }
    if (!isMounted) {
      return;
    }
    titleInputRef.current?.blur();
    isClosingRef.current = true;
    Animated.timing(backdropOpacity, {
      toValue: 0,
      duration: SHEET_CLOSE_DURATION,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => {
      if (isClosingRef.current) {
        setIsMounted(false);
      }
    });
  }, [accessibilityAnnouncement, backdropOpacity, isMounted, visible]);

  useEffect(() => () => {
    if (infoTimeoutRef.current) {
      clearTimeout(infoTimeoutRef.current);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (!visible) {
      return;
    }
    onClose?.();
  }, [onClose, visible]);

  const closePanel = useCallback(() => {
    setPanel(null);
  }, []);

  // Voltar descarta o que foi mexido dentro do painel; aplicar apenas fecha,
  // porque o rascunho já foi alterado enquanto o usuário mexia.
  const cancelPanel = useCallback(() => {
    if (panel?.snapshot) {
      dispatch({ type: 'hydrate', draft: panel.snapshot });
    }
    setPanel(null);
  }, [panel]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const onHardwareBack = () => {
      if (panel) {
        cancelPanel();
      } else {
        handleClose();
      }
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => subscription.remove();
  }, [cancelPanel, handleClose, panel, visible]);

  const openPanel = useCallback(
    (key) => {
      titleInputRef.current?.blur();
      Keyboard.dismiss();
      setActiveInfoKey(null);
      if (key === 'date') {
        setCalendarMonth(new Date(draft.startDate.getFullYear(), draft.startDate.getMonth(), 1));
      }
      setPanel({ key, snapshot: draft });
    },
    [draft]
  );

  // ------------------------------------------------------------------ info ---

  const showInfo = useCallback((key) => {
    setActiveInfoKey((previous) => (previous === key ? null : key));
    if (infoTimeoutRef.current) {
      clearTimeout(infoTimeoutRef.current);
    }
    infoTimeoutRef.current = setTimeout(() => setActiveInfoKey(null), 5000);
  }, []);

  const hideInfo = useCallback(() => {
    setActiveInfoKey(null);
    if (infoTimeoutRef.current) {
      clearTimeout(infoTimeoutRef.current);
    }
  }, []);

  // ----------------------------------------------------------------- ícone ---

  const handleShuffleEmoji = useCallback(() => {
    dispatch({ type: 'patch', value: { emoji: pickRandomEmoji(draft.emoji) } });
    if (HAPTICS_SUPPORTED && typeof Haptics.selectionAsync === 'function') {
      Haptics.selectionAsync();
    }
  }, [draft.emoji]);

  const handlePickImage = useCallback(async () => {
    if (isLoadingImage) {
      return;
    }
    try {
      setIsLoadingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        const persistentUri = await persistPickedImage(result.assets[0], {
          prefix: 'custom_habit_icon',
          limits: IMAGE_LIMITS.habitIcon,
        });
        dispatch({ type: 'patch', value: { customImage: persistentUri } });
      }
    } catch (error) {
      console.warn('Failed to select or persist custom habit image', error);
      Alert.alert(
        imageText.errorTitle,
        getImageErrorMessage(imageText, error, IMAGE_LIMITS.habitIcon)
      );
    } finally {
      setIsLoadingImage(false);
    }
  }, [imageText, isLoadingImage]);

  const handleRemoveCustomImage = useCallback(() => {
    dispatch({ type: 'patch', value: { customImage: null } });
  }, []);

  // ------------------------------------------------------------ permissões ---

  const requestNotificationPermission = useCallback(async () => {
    if (isRequestingNotificationPermissionRef.current) {
      return false;
    }
    isRequestingNotificationPermissionRef.current = true;
    try {
      const result = await requestReminderPermission({ requestIfNeeded: true });
      if (result.status === 'granted') {
        return true;
      }
      if (result.status === 'unsupported') {
        Alert.alert(notificationText.unsupportedTitle, notificationText.unsupportedMessage);
      } else if (result.status === 'permission-denied') {
        Alert.alert(notificationText.permissionTitle, notificationText.permissionMessage);
      } else {
        Alert.alert(
          notificationText.permissionErrorTitle,
          notificationText.permissionErrorMessage
        );
      }
      return false;
    } finally {
      isRequestingNotificationPermissionRef.current = false;
    }
  }, [notificationText]);

  // ------------------------------------------------------------------ tags ---

  const tagOptions = useMemo(() => {
    const localizedDefaults = [
      { key: 'none', label: t.noTag },
      ...DEFAULT_TAG_KEYS.map((key) => ({ key, label: taskDisplayText.tags[key] })),
    ];
    const merged = [...localizedDefaults];
    const seen = new Set(merged.map((option) => option.key));
    // Tags fora da lista padrão são do usuário: só nelas o rótulo é persistido,
    // porque as padrão são resolvidas pelo idioma atual na exibição.
    [...availableTagOptions, ...customTags].forEach((option) => {
      if (!option?.key || seen.has(option.key)) {
        return;
      }
      seen.add(option.key);
      merged.push({ ...option, isCustom: !DEFAULT_TAG_KEYS.includes(option.key) });
    });
    // Uma tarefa editada pode carregar uma tag que não está mais em uso.
    if (draft.tag && draft.tag !== 'none' && !seen.has(draft.tag)) {
      merged.push({
        key: draft.tag,
        label: initialHabit?.tagLabel ?? taskDisplayText.tags[draft.tag] ?? draft.tag,
        isCustom: !DEFAULT_TAG_KEYS.includes(draft.tag),
      });
    }
    return merged;
  }, [availableTagOptions, customTags, draft.tag, initialHabit, t.noTag, taskDisplayText.tags]);

  const handleCreateCustomTag = useCallback(
    (label) => {
      const trimmed = label.trim();
      if (!trimmed) {
        return { key: null, created: false };
      }
      const normalized = trimmed.toLowerCase();
      const existing = tagOptions.find((option) => option.label.toLowerCase() === normalized);
      if (existing) {
        dispatch({ type: 'patch', value: { tag: existing.key } });
        return { key: existing.key, created: false };
      }
      const key = createTagKey(trimmed, new Set(tagOptions.map((option) => option.key)));
      setCustomTags((previous) => [...previous, { key, label: trimmed, isCustom: true }]);
      dispatch({ type: 'patch', value: { tag: key } });
      return { key, created: true };
    },
    [tagOptions]
  );

  // -------------------------------------------------------------- rótulos ---

  const formatDateLabel = useCallback(
    (date) => {
      if (!date) {
        return '';
      }
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      if (date.toDateString() === today.toDateString()) {
        return t.quickToday;
      }
      if (date.toDateString() === tomorrow.toDateString()) {
        return t.quickTomorrow;
      }
      return date.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      });
    },
    [language, t.quickToday, t.quickTomorrow]
  );

  const repeatLabel = useMemo(() => {
    if (!draft.repeat.enabled) {
      return t.noRepeat;
    }
    const units = {
      daily: { singular: t.daySingle, plural: t.dayPlural },
      weekly: { singular: t.weekSingle, plural: t.weekPlural },
      monthly: { singular: t.monthSingle, plural: t.monthPlural },
    };
    const unit = units[draft.repeat.frequency] ?? units.daily;
    const interval = draft.repeat.interval;
    const every = `${t.repeatEvery} ${interval} ${interval === 1 ? unit.singular : unit.plural}`;
    const end =
      draft.repeat.hasEndDate && draft.repeat.endDate
        ? ` ${t.until} ${formatDateLabel(draft.repeat.endDate)}`
        : '';
    return `${every}${end}`;
  }, [draft.repeat, formatDateLabel, t]);

  const timeLabel = useMemo(() => {
    if (!draft.time.specified) {
      return t.anytime;
    }
    if (draft.time.mode === 'point') {
      return formatTimeValue(draft.time.point, use24Hour);
    }
    return `${formatTimeValue(draft.time.period.start, use24Hour)} - ${formatTimeValue(
      draft.time.period.end,
      use24Hour
    )}`;
  }, [draft.time, t.anytime, use24Hour]);

  const reminderOptions = useMemo(() => {
    const labelByKey = {
      none: t.noReminder,
      at_time: t.reminderAtTimeOfEvent,
      '5m': t.reminder5m,
      '15m': t.reminder15m,
      '30m': t.reminder30m,
      '1h': t.reminder1h,
    };
    const reference = draft.time.specified
      ? (draft.time.mode === 'period' ? draft.time.period.start : draft.time.point)
      : null;
    return REMINDER_ORDER.map((key) => {
      const offset = REMINDER_OFFSETS[key];
      let hint = null;
      if (key !== 'none') {
        hint = reference
          ? formatTimeValue(minutesToTime(timeToMinutes(reference) + offset), use24Hour)
          : t.noTimeSet;
      }
      return { key, label: labelByKey[key], hint };
    });
  }, [draft.time, t, use24Hour]);

  const reminderLabel = useMemo(() => {
    const match = reminderOptions.find((option) => option.key === draft.reminder);
    if (!match || match.key === 'none') {
      return t.noReminder;
    }
    return match.hint ?? t.noTimeSet;
  }, [draft.reminder, reminderOptions, t.noReminder, t.noTimeSet]);

  const typeOptions = useMemo(
    () => [
      { key: 'default', label: t.defaultType },
      { key: 'quantum', label: t.measurementType },
      { key: 'reminder', label: t.reminderType },
    ],
    [t.defaultType, t.measurementType, t.reminderType]
  );

  const tagLabel = useMemo(
    () => tagOptions.find((option) => option.key === draft.tag)?.label ?? t.noTag,
    [draft.tag, t.noTag, tagOptions]
  );

  const typeLabel = useMemo(
    () => typeOptions.find((option) => option.key === draft.type)?.label ?? typeOptions[0].label,
    [draft.type, typeOptions]
  );

  // -------------------------------------------------------------- validação ---

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const errorMessages = useMemo(
    () => ({
      reminderNeedsTime: notificationText.timeRequiredMessage,
      weekdayRequired: t.weekdayRequiredMessage,
      monthDayRequired: t.monthDayRequiredMessage,
      invalidEndDate: t.invalidEndDateMessage,
      invalidTimerTarget: t.invalidTimerTargetMessage,
      invalidCountTarget: t.invalidCountTargetMessage,
    }),
    [notificationText.timeRequiredMessage, t]
  );

  const errorFor = useCallback(
    (field) => {
      if (!showErrors) {
        return null;
      }
      const error = getDraftError(errors, field);
      return error ? errorMessages[error.code] ?? null : null;
    },
    [errorMessages, errors, showErrors]
  );

  const isSubmitDisabled = !draft.title.trim();

  // --------------------------------------------------------------- prévia ---

  const previewQuantum = useMemo(
    () => ({
      mode: draft.quantum.mode,
      animation: draft.quantum.animation,
      timer: {
        hours: parseDigits(draft.quantum.timerHours),
        minutesPart: parseDigits(draft.quantum.timerMinutes),
      },
      count: {
        value: parseDigits(draft.quantum.countValue),
        unit: draft.quantum.countUnit.trim(),
      },
      doneSeconds: 0,
      doneCount: 0,
    }),
    [draft.quantum]
  );

  const previewSummary = useMemo(() => {
    if (draft.type === 'quantum') {
      return getQuantumProgressLabel({ type: 'quantum', quantum: previewQuantum });
    }
    if (draft.type === 'reminder' || !draft.subtasks.length) {
      return null;
    }
    return `0/${draft.subtasks.length}`;
  }, [draft.subtasks.length, draft.type, previewQuantum]);

  const previewTimeLabel = useMemo(
    () => formatTaskTime(draft.time, { anytimeLabel: t.anytime, language }),
    [draft.time, language, t.anytime]
  );

  // ---------------------------------------------------------------- salvar ---

  const handleSubmit = useCallback(async () => {
    if (errors.length > 0) {
      // Sem focar o campo: o botao so fica ativo com titulo preenchido, e dar
      // foco programatico aqui reabriria o teclado por conta propria.
      setShowErrors(true);
      return;
    }

    // A permissão é pedida no momento de salvar um lembrete de verdade, e não
    // ao abrir o painel: pedir antes da decisão do usuário gasta a única
    // chance de perguntar no Android.
    if (draft.reminder !== 'none') {
      const hasPermission = await requestNotificationPermission();
      if (!hasPermission) {
        return;
      }
    }

    const payload = draftToTask(draft, { tagOptions });
    const submit = () => {
      if (isEditMode) {
        onUpdate?.(payload);
      } else {
        onCreate?.(payload);
      }
      handleClose();
    };

    if (
      isEditMode &&
      hasTaskProgress(initialHabit) &&
      shouldResetTaskProgress(initialHabit, payload.type, payload.quantum)
    ) {
      Alert.alert(t.resetProgressTitle, t.resetProgressMessage, [
        { text: common.cancel, style: 'cancel' },
        { text: t.resetProgressConfirm, style: 'destructive', onPress: submit },
      ]);
      return;
    }
    submit();
  }, [
    common.cancel,
    draft,
    errors,
    handleClose,
    initialHabit,
    isEditMode,
    onCreate,
    onUpdate,
    requestNotificationPermission,
    t.resetProgressConfirm,
    t.resetProgressMessage,
    t.resetProgressTitle,
    tagOptions,
  ]);

  if (!isMounted) {
    return null;
  }

  const rows = [
    {
      key: 'date',
      icon: 'calendar-clear-outline',
      label: t.startingFrom,
      value: formatDateLabel(draft.startDate),
      infoKey: 'startingFrom',
      infoText: t.info.startingFrom,
    },
    {
      key: 'repeat',
      icon: 'repeat-outline',
      label: t.repeat,
      value: repeatLabel,
      infoKey: 'repeat',
      infoText: t.info.repeat,
      error: errorFor('repeat'),
    },
    {
      key: 'time',
      icon: 'time-outline',
      label: t.time,
      value: timeLabel,
      infoKey: 'time',
      infoText: t.info.time,
    },
    {
      key: 'reminder',
      icon: 'notifications-outline',
      label: t.reminder,
      value: reminderLabel,
      infoKey: 'reminder',
      infoText: t.info.reminder,
      error: errorFor('reminder'),
    },
    {
      key: 'tag',
      icon: 'pricetag-outline',
      label: t.tag,
      value: tagLabel,
      infoKey: 'tag',
      infoText: t.info.tag,
    },
    {
      key: 'type',
      icon: 'layers-outline',
      label: t.type,
      value: typeLabel,
      infoKey: 'type',
      infoText: t.info.type,
      error: errorFor('quantum'),
    },
  ];

  return (
    <View pointerEvents="auto" style={styles.container}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        accessibilityRole="button"
        accessibilityLabel={closeSheetAccessibilityLabel}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <View
        style={[
          styles.sheetContainer,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            height: sheetHeight,
            backgroundColor: sheetBackgroundColor,
          },
        ]}
        accessibilityViewIsModal
        importantForAccessibility="yes"
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
          keyboardVerticalOffset={insets.top}
        >
          <View
            style={[
              styles.safeArea,
              { paddingTop: Math.max(insets.top, 12), backgroundColor: sheetBackgroundColor },
            ]}
            onTouchStart={activeInfoKey ? hideInfo : undefined}
          >
            {activeInfoKey ? (
              <Pressable style={styles.infoBackdropDismiss} onPress={hideInfo} />
            ) : null}

            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.closeTaskEditor}
                onPress={handleClose}
                hitSlop={16}
              >
                <Ionicons name="close" size={26} color="#59636f" />
              </Pressable>
              <Pressable
                style={[
                  styles.createButton,
                  __DEV__ && styles.createButtonDevToolsOffset,
                  isSubmitDisabled && styles.createButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSubmitDisabled }}
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                hitSlop={12}
              >
                <Text
                  style={[
                    styles.createButtonText,
                    isSubmitDisabled && styles.createButtonTextDisabled,
                  ]}
                >
                  {submitLabel}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollViewContent,
                { paddingBottom: Math.max(insets.bottom, 24) + 240 },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <View style={styles.identityRow}>
                <View style={styles.iconColumn}>
                  <Pressable
                    style={styles.iconPreview}
                    accessibilityRole="button"
                    accessibilityLabel={t.changePhoto}
                    accessibilityState={{ busy: isLoadingImage, disabled: isLoadingImage }}
                    onPress={handlePickImage}
                    disabled={isLoadingImage}
                    hitSlop={8}
                  >
                    {draft.customImage ? (
                      <Image source={{ uri: draft.customImage }} style={styles.iconPreviewImage} />
                    ) : (
                      <Text style={styles.iconPreviewEmoji}>{draft.emoji}</Text>
                    )}
                    <View style={styles.iconBadge}>
                      {isLoadingImage ? (
                        <ActivityIndicator size={12} color="#FFFFFF" />
                      ) : (
                        <Ionicons name="camera" size={12} color="#FFFFFF" />
                      )}
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.iconActionLink}
                    accessibilityRole="button"
                    accessibilityLabel={draft.customImage ? t.removePhoto : t.shuffleIcon}
                    onPress={draft.customImage ? handleRemoveCustomImage : handleShuffleEmoji}
                    hitSlop={10}
                  >
                    <Ionicons
                      name={draft.customImage ? 'close-circle-outline' : 'shuffle'}
                      size={14}
                      color="#61708A"
                    />
                    <Text style={styles.iconActionText}>
                      {draft.customImage ? t.removePhoto : t.shuffleIcon}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.titleColumn}>
                  <TextInput
                    ref={titleInputRef}
                    value={draft.title}
                    onChangeText={(text) => dispatch({ type: 'setTitle', value: text })}
                    placeholder={t.newTask}
                    placeholderTextColor="#7f8a9a"
                    style={styles.titleInput}
                    accessibilityLabel={t.newTask}
                    maxLength={TITLE_MAX_LENGTH}
                    returnKeyType="done"
                    multiline={false}
                  />
                  <Text style={styles.counter}>{`${draft.title.length}/${TITLE_MAX_LENGTH}`}</Text>
                </View>
              </View>

              <View style={styles.paletteContainer}>
                {EDITOR_COLORS.map((color) => {
                  const isSelected = draft.color === color;
                  return (
                    <Pressable
                      key={color}
                      style={[
                        styles.colorDot,
                        { backgroundColor: color },
                        isSelected && styles.colorDotSelected,
                      ]}
                      onPress={() => dispatch({ type: 'patch', value: { color } })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={t.selectColor.replace('{color}', color)}
                    >
                      {isSelected ? <Ionicons name="checkmark" size={18} color="#1F2742" /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={[styles.listContainer, activeInfoKey && styles.listContainerInfoActive]}>
                {rows.map((row, index) => (
                  <SheetRow
                    key={row.key}
                    icon={(
                      <View style={styles.rowIconContainer}>
                        <Ionicons name={row.icon} size={22} color="#61708A" />
                      </View>
                    )}
                    label={row.label}
                    value={row.value}
                    errorText={row.error}
                    onPress={() => {
                      hideInfo();
                      openPanel(row.key);
                    }}
                    infoText={row.infoText}
                    onPressInfo={() => showInfo(row.infoKey)}
                    isInfoVisible={activeInfoKey === row.infoKey}
                    bubbleMaxWidth={infoBubbleMaxWidth}
                    isLast={index === rows.length - 1}
                  />
                ))}
              </View>

              {draft.type === 'quantum' ? (
                <QuantumPanel
                  mode={draft.quantum.mode}
                  animation={draft.quantum.animation}
                  timerHours={draft.quantum.timerHours}
                  timerMinutes={draft.quantum.timerMinutes}
                  countValue={draft.quantum.countValue}
                  countUnit={draft.quantum.countUnit}
                  onChangeAnimation={(animation) =>
                    dispatch({ type: 'patchQuantum', value: { animation } })
                  }
                  onChangeTimerHours={(timerHours) =>
                    dispatch({ type: 'patchQuantum', value: { timerHours } })
                  }
                  onChangeTimerMinutes={(timerMinutes) =>
                    dispatch({ type: 'patchQuantum', value: { timerMinutes } })
                  }
                  onChangeCountValue={(countValue) =>
                    dispatch({ type: 'patchQuantum', value: { countValue } })
                  }
                  onChangeCountUnit={(countUnit) =>
                    dispatch({ type: 'patchQuantum', value: { countUnit } })
                  }
                  infoText={draft.quantum.mode === 'timer' ? t.info.timer : t.info.count}
                  onPressInfo={() => showInfo(draft.quantum.mode === 'timer' ? 'timer' : 'count')}
                  isInfoVisible={
                    activeInfoKey === (draft.quantum.mode === 'timer' ? 'timer' : 'count')
                  }
                  labels={t}
                />
              ) : (
                <SubtasksPanel
                  value={draft.subtasks}
                  onChange={(subtasks) => dispatch({ type: 'setSubtasks', value: subtasks })}
                  infoText={
                    (draft.type === 'reminder' ? t.info.reminders : t.info.subtasks) ??
                    t.info.subtasks
                  }
                  onPressInfo={() =>
                    showInfo(draft.type === 'reminder' ? 'reminders' : 'subtasks')
                  }
                  isInfoVisible={
                    activeInfoKey === (draft.type === 'reminder' ? 'reminders' : 'subtasks')
                  }
                  labels={t}
                  titleLabel={draft.type === 'reminder' ? t.reminders : t.subtasks}
                  addLabel={draft.type === 'reminder' ? t.addReminder : t.addSubtask}
                  hintLabel={draft.type === 'reminder' ? t.remindersHint : t.subtasksHint}
                  removeAccessibilityPrefix={
                    draft.type === 'reminder' ? t.removeReminder : t.removeSubtask
                  }
                />
              )}
            </ScrollView>

            {panel?.key === 'date' ? (
              <OptionOverlay
                title={t.startingFrom}
                subtitle={formatDateLabel(draft.startDate)}
                onClose={cancelPanel}
                onApply={closePanel}
                applyLabel={common.apply}
                backLabel={t.goBack}
              >
                <DatePanel
                  month={calendarMonth}
                  selectedDate={draft.startDate}
                  onSelectDate={(value) => dispatch({ type: 'setStartDate', value })}
                  onChangeMonth={setCalendarMonth}
                  repeatConfig={draft.repeat}
                  labels={t}
                  language={language}
                />
              </OptionOverlay>
            ) : null}

            {panel?.key === 'repeat' ? (
              <OptionOverlay
                title={t.setTaskRepeat}
                onClose={cancelPanel}
                onApply={closePanel}
                applyLabel={common.apply}
                backLabel={t.goBack}
              >
                <RepeatPanel
                  isEnabled={draft.repeat.enabled}
                  frequency={draft.repeat.frequency}
                  interval={draft.repeat.interval}
                  weekdays={draft.repeat.weekdays}
                  monthDays={draft.repeat.monthDays}
                  hasEndDate={draft.repeat.hasEndDate}
                  endDate={draft.repeat.endDate}
                  startDate={draft.startDate}
                  onToggleEnabled={(enabled) =>
                    dispatch({ type: 'patchRepeat', value: { enabled } })
                  }
                  onFrequencyChange={(frequency) =>
                    dispatch({ type: 'patchRepeat', value: { frequency } })
                  }
                  onIntervalChange={(interval) =>
                    dispatch({ type: 'patchRepeat', value: { interval } })
                  }
                  onToggleWeekday={(value) => dispatch({ type: 'toggleWeekday', value })}
                  onToggleMonthDay={(value) => dispatch({ type: 'toggleMonthDay', value })}
                  onToggleHasEndDate={(hasEndDate) =>
                    dispatch({
                      type: 'patchRepeat',
                      value: { hasEndDate, endDate: hasEndDate ? draft.repeat.endDate ?? draft.startDate : null },
                    })
                  }
                  onChangeEndDate={(endDate) =>
                    dispatch({ type: 'patchRepeat', value: { endDate } })
                  }
                  labels={t}
                  language={language}
                />
              </OptionOverlay>
            ) : null}

            {panel?.key === 'time' ? (
              <OptionOverlay
                title={
                  !draft.time.specified
                    ? t.doItAnyTime
                    : draft.time.mode === 'period'
                    ? t.doItFromTo
                        .replace('{start}', formatTimeValue(draft.time.period.start, use24Hour))
                        .replace('{end}', formatTimeValue(draft.time.period.end, use24Hour))
                    : t.doItAt.replace('{time}', formatTimeValue(draft.time.point, use24Hour))
                }
                onClose={cancelPanel}
                onApply={closePanel}
                applyLabel={common.apply}
                backLabel={t.goBack}
              >
                <TimePanel
                  specified={draft.time.specified}
                  onToggleSpecified={(specified) =>
                    dispatch({ type: 'patchTime', value: { specified } })
                  }
                  mode={draft.time.mode}
                  onModeChange={(value) => dispatch({ type: 'patchTime', value: { mode: value } })}
                  pointTime={draft.time.point}
                  onPointTimeChange={(updater) =>
                    dispatch({
                      type: 'patchTime',
                      value: {
                        point:
                          typeof updater === 'function' ? updater(draft.time.point) : updater,
                      },
                    })
                  }
                  periodTime={draft.time.period}
                  onPeriodTimeChange={(updater) => {
                    const next =
                      typeof updater === 'function' ? updater(draft.time.period) : updater;
                    dispatch({
                      type: 'patchTime',
                      value: { period: { ...draft.time.period, ...next } },
                    });
                  }}
                  labels={t}
                  use24Hour={use24Hour}
                />
              </OptionOverlay>
            ) : null}

            {panel?.key === 'reminder' ? (
              <OptionOverlay
                title={t.reminder}
                onClose={cancelPanel}
                onApply={closePanel}
                applyLabel={common.apply}
                backLabel={t.goBack}
              >
                <OptionList
                  options={reminderOptions}
                  selectedKey={draft.reminder}
                  onSelect={(reminder) => dispatch({ type: 'patch', value: { reminder } })}
                />
              </OptionOverlay>
            ) : null}

            {panel?.key === 'tag' ? (
              <OptionOverlay
                title={t.tag}
                onClose={cancelPanel}
                onApply={closePanel}
                applyLabel={common.apply}
                backLabel={t.goBack}
              >
                <TagPanel
                  options={tagOptions}
                  selectedKey={draft.tag}
                  onSelect={(tag) => dispatch({ type: 'patch', value: { tag } })}
                  onCreateTag={handleCreateCustomTag}
                  labels={t}
                />
              </OptionOverlay>
            ) : null}

            {panel?.key === 'type' ? (
              <OptionOverlay
                title={t.type}
                onClose={cancelPanel}
                onApply={closePanel}
                applyLabel={common.apply}
                backLabel={t.goBack}
              >
                <OptionList
                  options={typeOptions}
                  selectedKey={draft.type}
                  onSelect={(type) => dispatch({ type: 'patch', value: { type } })}
                />
                {draft.type === 'quantum' ? (
                  <>
                    <View style={styles.quantumModeRow}>
                      {['timer', 'count'].map((modeKey) => {
                        const isSelected = draft.quantum.mode === modeKey;
                        return (
                          <Pressable
                            key={modeKey}
                            style={[
                              styles.quantumModeButton,
                              isSelected && styles.quantumModeButtonSelected,
                            ]}
                            onPress={() =>
                              dispatch({ type: 'patchQuantum', value: { mode: modeKey } })
                            }
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                          >
                            <Text
                              style={[
                                styles.quantumModeButtonText,
                                isSelected && styles.quantumModeButtonTextSelected,
                              ]}
                            >
                              {modeKey === 'timer' ? t.timer : t.count}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <QuantumPanel
                      mode={draft.quantum.mode}
                      animation={draft.quantum.animation}
                      timerHours={draft.quantum.timerHours}
                      timerMinutes={draft.quantum.timerMinutes}
                      countValue={draft.quantum.countValue}
                      countUnit={draft.quantum.countUnit}
                      onChangeAnimation={(animation) =>
                        dispatch({ type: 'patchQuantum', value: { animation } })
                      }
                      onChangeTimerHours={(timerHours) =>
                        dispatch({ type: 'patchQuantum', value: { timerHours } })
                      }
                      onChangeTimerMinutes={(timerMinutes) =>
                        dispatch({ type: 'patchQuantum', value: { timerMinutes } })
                      }
                      onChangeCountValue={(countValue) =>
                        dispatch({ type: 'patchQuantum', value: { countValue } })
                      }
                      onChangeCountUnit={(countUnit) =>
                        dispatch({ type: 'patchQuantum', value: { countUnit } })
                      }
                      showTitle={false}
                      labels={t}
                    />
                  </>
                ) : null}
                <View style={styles.typePreviewSection}>
                  <View style={styles.infoLabelRow}>
                    <Text style={styles.typePreviewLabel}>{t.preview}</Text>
                    <Pressable
                      onPress={() => showInfo('preview')}
                      style={styles.infoIconButton}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={14} color="#59636f" />
                    </Pressable>
                  </View>
                  {activeInfoKey === 'preview' ? (
                    <View style={[styles.floatingInfoBubble, styles.previewFloatingInfoBubble]}>
                      <Text style={styles.inlineInfoText}>
                        {draft.type === 'default'
                          ? t.info.previewDefault
                          : draft.type === 'quantum'
                          ? t.info.previewQuantum
                          : t.info.previewReminder}
                      </Text>
                    </View>
                  ) : null}
                  <TypePreviewCard
                    type={draft.type}
                    quantum={previewQuantum}
                    color={draft.color}
                    backgroundColor={sheetBackgroundColor}
                    emoji={draft.emoji || DEFAULT_EMOJI}
                    customImage={draft.customImage}
                    title={draft.title.trim() || common.untitledTask}
                    timeLabel={previewTimeLabel}
                    summary={previewSummary}
                    isActive={panel?.key === 'type'}
                    reduceMotion={reduceMotion}
                  />
                </View>
              </OptionOverlay>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}
