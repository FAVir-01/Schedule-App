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
  Easing,
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
import * as ImagePicker from 'expo-image-picker';
import { formatTaskTime, formatTimeValue } from '../utils/timeUtils';
import { resolveTimeForRepeatDate } from '../utils/taskTimeUtils';
import { lightenColor } from '../utils/colorUtils';
import {
  getQuantumProgressLabel,
  hasTaskProgress,
  shouldResetTaskProgress,
} from '../utils/taskUtils';
import { translations } from '../constants/i18n';
import { persistPickedImage } from '../services/imagePersistenceService';
import { requestReminderPermission } from '../services/reminderService';
import { IMAGE_LIMITS, getImageErrorMessage, isGifImageAsset } from '../utils/imageUtils';
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
  taskDraftReducer,
  timeToMinutes,
  validateDraft,
} from '../domain/taskDraft';
import {
  AnimatedReveal,
  InlineInfo,
  OptionList,
  OptionOverlay,
  SheetRow,
  SoftPressable,
  TagPanel,
  TaskEditorMotionProvider,
} from './taskEditor/parts';
import DatePanel from './taskEditor/DatePanel';
import RepeatPanel from './taskEditor/RepeatPanel';
import TimePanel from './taskEditor/TimePanel';
import QuantumPanel from './taskEditor/QuantumFields';
import SubtasksPanel from './taskEditor/SubtasksPanel';
import TypePreviewCard from './taskEditor/TypePreviewCard';
import ImageCropModal from './ImageCropModal';
import styles from './taskEditor/styles';

const SHEET_OPEN_DURATION = 360;
const SHEET_CLOSE_DURATION = 260;
const BACKDROP_MAX_OPACITY = 0.5;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
// Mesma base lavanda-clara das folhas Reflection e Period summary.
const EDITOR_BACKGROUND_COLOR = '#F6F6FB';

const DEFAULT_TAG_KEYS = [
  'clean_room',
  'healthy_lifestyle',
  'morning_routine',
  'relationship',
  'sleep_better',
  'workout',
];

const REMINDER_ORDER = ['none', 'at_time', '5m', '15m', '30m', '1h'];

// O contador de caracteres do titulo so aparece perto do limite, em vez de
// ocupar a capa o tempo todo.
const TITLE_COUNTER_VISIBLE_FROM = 30;

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
  const { height } = useWindowDimensions();
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
  const [pendingCropAsset, setPendingCropAsset] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const titleInputRef = useRef(null);
  const isClosingRef = useRef(false);
  const isRequestingNotificationPermissionRef = useRef(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(height)).current;

  const sheetHeight = height;
  const previewCardBackgroundColor = useMemo(
    () => lightenColor(draft.color, 0.75),
    [draft.color]
  );

  const submitLabel = isEditMode ? common.save : common.create;
  const editorTitle = isEditMode ? t.editTask : isCopyMode ? t.duplicateTask : t.newTask;
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
      : createEmptyDraft();
    dispatch({ type: 'hydrate', draft: nextDraft });
    setPanel(null);
    setShowErrors(false);
    setActiveInfoKey(null);
    setIsLoadingImage(false);
    setPendingCropAsset(null);
    setCustomTags([]);
    setCalendarMonth(new Date(nextDraft.startDate.getFullYear(), nextDraft.startDate.getMonth(), 1));
  }, [initialHabit, visible]);

  useEffect(() => {
    if (visible) {
      if (!isMounted) {
        backdropOpacity.setValue(0);
        sheetTranslateY.setValue(sheetHeight);
        setIsMounted(true);
        return;
      }
      setIsMounted(true);
      isClosingRef.current = false;
      backdropOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      if (reduceMotion) {
        backdropOpacity.setValue(BACKDROP_MAX_OPACITY);
        sheetTranslateY.setValue(0);
      } else {
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: BACKDROP_MAX_OPACITY,
            duration: SHEET_OPEN_DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(sheetTranslateY, {
            toValue: 0,
            duration: SHEET_OPEN_DURATION,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]).start();
      }
      AccessibilityInfo.announceForAccessibility(accessibilityAnnouncement);
      return;
    }
    if (!isMounted) {
      return;
    }
    titleInputRef.current?.blur();
    isClosingRef.current = true;
    backdropOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    if (reduceMotion) {
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(sheetHeight);
      setIsMounted(false);
      return;
    }
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: SHEET_CLOSE_DURATION,
        easing: Easing.in(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: sheetHeight,
        duration: SHEET_CLOSE_DURATION,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(({ finished }) => {
      if (finished && isClosingRef.current) {
        setIsMounted(false);
      }
    });
  }, [
    accessibilityAnnouncement,
    backdropOpacity,
    isMounted,
    reduceMotion,
    sheetHeight,
    sheetTranslateY,
    visible,
  ]);

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
  }, []);

  const hideInfo = useCallback(() => {
    setActiveInfoKey(null);
  }, []);

  // ----------------------------------------------------------------- ícone ---

  const showImageError = useCallback(
    (error) => {
      console.warn('Failed to select, crop, or persist custom habit image', error);
      Alert.alert(
        imageText.errorTitle,
        getImageErrorMessage(imageText, error, IMAGE_LIMITS.habitIcon)
      );
    },
    [imageText]
  );

  const persistHabitImage = useCallback(async (asset) => {
    const persistentUri = await persistPickedImage(asset, {
      prefix: 'custom_habit_icon',
      limits: IMAGE_LIMITS.habitIcon,
    });
    dispatch({ type: 'patch', value: { customImage: persistentUri } });
  }, []);

  const handlePickImage = useCallback(async () => {
    if (isLoadingImage) {
      return;
    }
    try {
      setIsLoadingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // O arquivo precisa voltar intacto para conseguirmos preservar GIFs.
        // Imagens estáticas são recortadas depois, dentro do próprio app.
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        if (isGifImageAsset(asset)) {
          await persistHabitImage(asset);
        } else {
          setPendingCropAsset(asset);
        }
      }
    } catch (error) {
      showImageError(error);
    } finally {
      setIsLoadingImage(false);
    }
  }, [isLoadingImage, persistHabitImage, showImageError]);

  const handleConfirmCrop = useCallback(
    async (croppedAsset) => {
      try {
        await persistHabitImage(croppedAsset);
        setPendingCropAsset(null);
      } catch (error) {
        showImageError(error);
      }
    },
    [persistHabitImage, showImageError]
  );

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
    const groupCount = Array.isArray(draft.time.groups) ? draft.time.groups.length : 0;
    if (groupCount >= 2) {
      return t.timeGroupsSummary.replace('{count}', String(groupCount));
    }
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
  }, [draft.time, t.anytime, t.timeGroupsSummary, use24Hour]);

  const reminderOptions = useMemo(() => {
    const labelByKey = {
      none: t.noReminder,
      at_time: t.reminderAtTimeOfEvent,
      '5m': t.reminder5m,
      '15m': t.reminder15m,
      '30m': t.reminder30m,
      '1h': t.reminder1h,
    };
    const hasGroups = Array.isArray(draft.time.groups) && draft.time.groups.length >= 2;
    const reference = !hasGroups && draft.time.specified
      ? (draft.time.mode === 'period' ? draft.time.period.start : draft.time.point)
      : null;
    return REMINDER_ORDER.map((key) => {
      const offset = REMINDER_OFFSETS[key];
      let hint = null;
      if (key !== 'none') {
        hint = hasGroups
          ? t.forEachTimeGroup
          : reference
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
    () =>
      formatTaskTime(resolveTimeForRepeatDate(draft.time, draft.repeat, draft.startDate), {
        anytimeLabel: t.anytime,
        language,
      }),
    [draft.repeat, draft.startDate, draft.time, language, t.anytime]
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

  const timeGroups = Array.isArray(draft.time.groups) ? draft.time.groups : [];
  const hasTimeGroups = timeGroups.length >= 2;
  const formatEditorTime = (time) => {
    if (!time?.specified) {
      return t.anytime;
    }
    if (time.mode === 'period') {
      return `${formatTimeValue(time.period.start, use24Hour)} - ${formatTimeValue(
        time.period.end,
        use24Hour
      )}`;
    }
    return formatTimeValue(time.point, use24Hour);
  };
  const getTimeGroupRowLabel = (group, index) => {
    const day = group.days.length === 1 ? group.days[0] : null;
    // Nomear pelo dia so ajuda quando o dia identifica a linha. Numa materia que
    // acontece duas vezes na segunda as duas linhas se chamariam "Segunda-feira"
    // e nao daria para saber qual e a da manha: ai vale o numero do grupo.
    const sharesDay =
      day != null && timeGroups.filter((other) => other.days.includes(day)).length > 1;
    if (day != null && !sharesDay) {
      const dayLabel =
        draft.repeat.frequency === 'weekly'
          ? t.weekdayFullLabels?.[day] ?? day
          : t.dayNumber.replace('{day}', String(day));
      return `${t.time} - ${dayLabel}`;
    }
    return t.timeGroupName.replace('{number}', String(index + 1));
  };
  const timeRows = hasTimeGroups
    ? timeGroups.map((group, index) => ({
        key: `time:${group.id}`,
        icon: 'time-outline',
        label: getTimeGroupRowLabel(group, index),
        value: formatEditorTime(group),
        infoKey: `time:${group.id}`,
        infoText: t.info.time,
      }))
    : [
        {
          key: 'time',
          icon: 'time-outline',
          label: t.time,
          value: timeLabel,
          infoKey: 'time',
          infoText: t.info.time,
        },
      ];
  const activeTimeGroupId = panel?.key?.startsWith('time:') ? panel.key.slice(5) : null;
  const activeTimeGroup = activeTimeGroupId
    ? timeGroups.find((group) => group.id === activeTimeGroupId) ?? null
    : null;
  const activeTime = activeTimeGroup ?? draft.time;
  const patchActiveTime = (value) =>
    dispatch(
      activeTimeGroup
        ? { type: 'patchTimeGroup', id: activeTimeGroup.id, value }
        : { type: 'patchTime', value }
    );

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
    ...timeRows,
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

  // "Quando" reune data, repeticao, horario e lembrete; "detalhes" fica com
  // rotulo e tipo. A ajuda de cada item expande dentro do proprio cartao.
  const sectionRowKeys = {
    when: ['date', 'repeat', ...timeRows.map((row) => row.key), 'reminder'],
    details: ['tag', 'type'],
  };
  const sections = [
    { key: 'when', title: t.sectionWhen },
    { key: 'details', title: t.sectionDetails },
  ].map((section) => {
    const sectionRows = sectionRowKeys[section.key]
      .map((key) => rows.find((row) => row.key === key))
      .filter(Boolean);
    return {
      ...section,
      rows: sectionRows,
    };
  });

  return (
    <TaskEditorMotionProvider reduceMotion={reduceMotion}>
      <View
        pointerEvents="auto"
        style={[styles.container, !visible && styles.containerClosing]}
      >
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        accessibilityRole="button"
        accessibilityLabel={closeSheetAccessibilityLabel}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            height: sheetHeight,
            backgroundColor: EDITOR_BACKGROUND_COLOR,
            transform: [{ translateY: sheetTranslateY }],
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
              { paddingTop: Math.max(insets.top, 12) },
            ]}
          >
            <View style={styles.header}>
              <SoftPressable
                style={styles.headerIconButton}
                accessibilityRole="button"
                accessibilityLabel={t.closeTaskEditor}
                onPress={handleClose}
                hitSlop={16}
              >
                <Ionicons name="close" size={20} color="#504B67" />
              </SoftPressable>
              <View style={styles.headerTitleBlock}>
                <Text style={styles.headerTitle} numberOfLines={1}>{editorTitle}</Text>
              </View>
              <SoftPressable
                style={[
                  styles.createButton,
                  isSubmitDisabled && styles.createButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={submitLabel}
                accessibilityState={{ disabled: isSubmitDisabled }}
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                hitSlop={12}
              >
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={isSubmitDisabled ? '#8A849D' : '#FFFFFF'}
                />
              </SoftPressable>
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
              <View style={styles.identityCard}>
                <SoftPressable
                  style={[
                    styles.mediaPreview,
                    { backgroundColor: lightenColor(draft.color, 0.76) },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t.photoOrGif}
                  accessibilityState={{ busy: isLoadingImage, disabled: isLoadingImage }}
                  onPress={handlePickImage}
                  disabled={isLoadingImage}
                >
                  {isLoadingImage ? (
                    <ActivityIndicator size="small" color="#3C2BA7" />
                  ) : draft.customImage ? (
                    <Image source={{ uri: draft.customImage }} style={styles.mediaPreviewImage} />
                  ) : (
                    <Ionicons name="camera-outline" size={23} color="#5E5682" />
                  )}
                </SoftPressable>

                <View style={styles.identityContent}>
                  <View style={styles.titleColumn}>
                    <TextInput
                      ref={titleInputRef}
                      value={draft.title}
                      onChangeText={(text) => dispatch({ type: 'setTitle', value: text })}
                      placeholder={t.taskNamePlaceholder}
                      placeholderTextColor="#8A909E"
                      style={styles.titleInput}
                      accessibilityLabel={t.taskName}
                      maxLength={TITLE_MAX_LENGTH}
                      returnKeyType="done"
                      multiline={false}
                    />
                    {draft.title.length >= TITLE_COUNTER_VISIBLE_FROM ? (
                      <Text style={styles.counter}>{`${draft.title.length}/${TITLE_MAX_LENGTH}`}</Text>
                    ) : null}
                  </View>

                </View>
              </View>

              <View style={styles.appearanceSection}>
                <View style={styles.appearanceHeader}>
                  <Text style={styles.sectionHeaderText}>{t.appearance}</Text>
                  <View style={[styles.selectedColorSample, { backgroundColor: draft.color }]} />
                </View>
                <View style={styles.paletteContainer}>
                  {EDITOR_COLORS.map((color) => {
                    const isSelected = draft.color === color;
                    return (
                      <SoftPressable
                        key={color}
                        style={[styles.colorDotOuter, isSelected && styles.colorDotOuterSelected]}
                        onPress={() => dispatch({ type: 'patch', value: { color } })}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={t.selectColor.replace('{color}', color)}
                      >
                        <View style={[styles.colorDot, { backgroundColor: color }]}>
                          {isSelected ? (
                            <Ionicons name="checkmark" size={16} color="#252A36" />
                          ) : null}
                        </View>
                      </SoftPressable>
                    );
                  })}
                </View>
              </View>

              {sections.map((section) => (
                <View key={section.key} style={styles.sectionBlock}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>{section.title}</Text>
                  </View>
                  <View style={styles.listContainer}>
                    {section.rows.map((row, index) => (
                      <SheetRow
                        key={row.key}
                        icon={(
                          <View
                            style={[
                              styles.rowIconContainer,
                              { backgroundColor: lightenColor(draft.color, 0.76) },
                            ]}
                          >
                            <Ionicons name={row.icon} size={17} color="#343B4A" />
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
                        isLast={index === section.rows.length - 1}
                      />
                    ))}
                  </View>
                </View>
              ))}

              {draft.type === 'quantum' ? (
                <AnimatedReveal key="quantum-fields">
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
                </AnimatedReveal>
              ) : (
                <AnimatedReveal key={`list-fields-${draft.type}`}>
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
                </AnimatedReveal>
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
                reduceMotion={reduceMotion}
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
                reduceMotion={reduceMotion}
              >
                <RepeatPanel
                  isEnabled={draft.repeat.enabled}
                  frequency={draft.repeat.frequency}
                  interval={draft.repeat.interval}
                  weekdays={draft.repeat.weekdays}
                  monthDays={draft.repeat.monthDays}
                  timeGroups={timeGroups}
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
                  onConfigureTimeGroups={() => dispatch({ type: 'configureTimeGroups' })}
                  onAddTimeGroup={(afterIndex) =>
                    dispatch({ type: 'addTimeGroup', afterIndex })
                  }
                  onAssignTimeGroupDay={(id, day) =>
                    dispatch({ type: 'assignTimeGroupDay', id, day })
                  }
                  onRemoveTimeGroup={(id) => dispatch({ type: 'removeTimeGroup', id })}
                  onClearTimeGroups={() => dispatch({ type: 'clearTimeGroups' })}
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

            {panel?.key === 'time' || panel?.key?.startsWith('time:') ? (
              <OptionOverlay
                title={
                  !activeTime.specified
                    ? t.doItAnyTime
                    : activeTime.mode === 'period'
                    ? t.doItFromTo
                        .replace('{start}', formatTimeValue(activeTime.period.start, use24Hour))
                        .replace('{end}', formatTimeValue(activeTime.period.end, use24Hour))
                    : t.doItAt.replace('{time}', formatTimeValue(activeTime.point, use24Hour))
                }
                onClose={cancelPanel}
                onApply={closePanel}
                applyLabel={common.apply}
                backLabel={t.goBack}
                reduceMotion={reduceMotion}
              >
                <TimePanel
                  specified={activeTime.specified}
                  onToggleSpecified={(specified) => patchActiveTime({ specified })}
                  mode={activeTime.mode}
                  onModeChange={(value) => patchActiveTime({ mode: value })}
                  pointTime={activeTime.point}
                  onPointTimeChange={(updater) =>
                    patchActiveTime({
                      point: typeof updater === 'function' ? updater(activeTime.point) : updater,
                    })
                  }
                  periodTime={activeTime.period}
                  onPeriodTimeChange={(updater) => {
                    const next =
                      typeof updater === 'function' ? updater(activeTime.period) : updater;
                    patchActiveTime({ period: { ...activeTime.period, ...next } });
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
                reduceMotion={reduceMotion}
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
                reduceMotion={reduceMotion}
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
                reduceMotion={reduceMotion}
              >
                <OptionList
                  options={typeOptions}
                  selectedKey={draft.type}
                  onSelect={(type) => dispatch({ type: 'patch', value: { type } })}
                />
                {draft.type === 'quantum' ? (
                  <AnimatedReveal>
                    <View style={styles.quantumModeRow}>
                      {['timer', 'count'].map((modeKey) => {
                        const isSelected = draft.quantum.mode === modeKey;
                        return (
                          <SoftPressable
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
                          </SoftPressable>
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
                  </AnimatedReveal>
                ) : null}
                <View style={styles.typePreviewSection}>
                  <View style={styles.infoLabelRow}>
                    <Text style={styles.typePreviewLabel}>{t.preview}</Text>
                    <SoftPressable
                      onPress={() => showInfo('preview')}
                      style={styles.infoIconButton}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t.info.previewDefault}
                      accessibilityState={{ expanded: activeInfoKey === 'preview' }}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={17}
                        color={activeInfoKey === 'preview' ? '#665BC2' : '#9895A5'}
                      />
                    </SoftPressable>
                  </View>
                  <InlineInfo
                    visible={activeInfoKey === 'preview'}
                    text={
                      draft.type === 'default'
                        ? t.info.previewDefault
                        : draft.type === 'quantum'
                        ? t.info.previewQuantum
                        : t.info.previewReminder
                    }
                  />
                  <TypePreviewCard
                    type={draft.type}
                    quantum={previewQuantum}
                    color={draft.color}
                    backgroundColor={previewCardBackgroundColor}
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
      </Animated.View>
      </View>
      <ImageCropModal
        visible={Boolean(pendingCropAsset)}
        asset={pendingCropAsset}
        strings={imageText}
        onCancel={() => setPendingCropAsset(null)}
        onConfirm={handleConfirmCrop}
        onError={showImageError}
      />
    </TaskEditorMotionProvider>
  );
}
