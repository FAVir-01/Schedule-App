import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styles from './styles';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const TaskEditorMotionContext = createContext(false);

function TaskEditorMotionProvider({ reduceMotion, children }) {
  return (
    <TaskEditorMotionContext.Provider value={Boolean(reduceMotion)}>
      {children}
    </TaskEditorMotionContext.Provider>
  );
}

function SoftPressable({ style, onPressIn, onPressOut, children, ...props }) {
  const reduceMotion = useContext(TaskEditorMotionContext);
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = useCallback(
    (toValue) => {
      scale.stopAnimation();
      if (reduceMotion) {
        scale.setValue(1);
        return;
      }
      Animated.spring(scale, {
        toValue,
        speed: 42,
        bounciness: 0,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },
    [reduceMotion, scale]
  );

  return (
    <AnimatedPressable
      {...props}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(event) => {
        animateScale(0.975);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateScale(1);
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

function InlineInfo({ visible, text }) {
  const reduceMotion = useContext(TaskEditorMotionContext);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(visible ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 170,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, reduceMotion, visible]);

  if (!text) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.inlineInfoContainer,
        {
          maxHeight: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 160] }),
          opacity: progress,
          marginTop: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
          marginBottom: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }),
        },
      ]}
    >
      <View style={styles.inlineInfoSurface}>
        <Text style={styles.inlineInfoText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

function AnimatedReveal({ children, style }) {
  const reduceMotion = useContext(TaskEditorMotionContext);
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [progress, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function SheetRow({
  icon,
  label,
  value,
  onPress,
  showChevron = true,
  isLast = false,
  disabled = false,
  infoText,
  onPressInfo,
  isInfoVisible = false,
  errorText,
}) {
  return (
    <View
      style={[
        styles.row,
        isLast && styles.rowLast,
        disabled && styles.rowDisabled,
        errorText && styles.rowHasError,
      ]}
    >
      <View style={styles.rowMain}>
        <SoftPressable
          style={styles.rowLeft}
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={errorText ? `${label}, ${value}, ${errorText}` : `${label}, ${value}`}
          accessibilityState={{ selected: false, disabled }}
        >
          {icon}
          <View style={styles.rowTextColumn}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
          </View>
        </SoftPressable>

        {infoText ? (
          <SoftPressable
            onPress={onPressInfo}
            style={styles.infoIconButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={infoText}
            accessibilityState={{ expanded: isInfoVisible }}
          >
            <Ionicons
              name="information-circle-outline"
              size={17}
              color={isInfoVisible ? '#665BC2' : '#9895A5'}
            />
          </SoftPressable>
        ) : null}

        <SoftPressable
          style={styles.rowRight}
          onPress={onPress}
          disabled={disabled}
          accessible={false}
        >
          {showChevron && <Ionicons name="chevron-forward" size={18} color="#9aa0af" />}
        </SoftPressable>
      </View>

      {errorText ? (
        <Text style={styles.rowErrorText} accessibilityLiveRegion="polite">
          {errorText}
        </Text>
      ) : null}

      <InlineInfo visible={isInfoVisible} text={infoText} />
    </View>
  );
}

function OptionOverlay({
  title,
  subtitle,
  onClose,
  onApply,
  children,
  applyLabel,
  backLabel,
  applyDisabled,
  scrollEnabled = true,
  reduceMotion = false,
}) {
  const insets = useSafeAreaInsets();
  const transition = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const isExitingRef = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      transition.setValue(1);
      return;
    }
    Animated.timing(transition, {
      toValue: 1,
      duration: 280,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [reduceMotion, transition]);

  const leave = useCallback(
    (callback) => {
      if (isExitingRef.current) {
        return;
      }
      if (reduceMotion) {
        callback?.();
        return;
      }
      isExitingRef.current = true;
      Animated.timing(transition, {
        toValue: 0,
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => callback?.());
    },
    [reduceMotion, transition]
  );

  return (
    <Modal
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => leave(onClose)}
    >
      <View
        style={[
          styles.overlayContainer,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.overlayCard,
            {
              opacity: transition,
              transform: [
                {
                  translateY: transition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [32, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.overlayHeader}>
            <SoftPressable
              style={styles.overlayBackButton}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              onPress={() => leave(onClose)}
              hitSlop={12}
            >
              <Ionicons name="arrow-back" size={19} color="#504B67" />
            </SoftPressable>
            <View style={styles.overlayTitleContainer}>
              <Text style={styles.overlayTitle}>{title}</Text>
              {subtitle ? <Text style={styles.overlaySubtitle}>{subtitle}</Text> : null}
            </View>
            <SoftPressable
              style={styles.overlayApplyButton}
              onPress={() => leave(onApply)}
              accessibilityRole="button"
              accessibilityState={{ disabled: applyDisabled }}
              disabled={applyDisabled}
              hitSlop={12}
            >
              <Text
                style={[styles.overlayApplyText, applyDisabled && styles.overlayApplyTextDisabled]}
              >
                {applyLabel}
              </Text>
            </SoftPressable>
          </View>
          {scrollEnabled ? (
            <ScrollView
              style={styles.overlayScroll}
              contentContainerStyle={styles.overlayScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.overlayScroll, styles.overlayScrollContent]}>{children}</View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function OptionList({ options, selectedKey, onSelect }) {
  return (
    <View style={styles.optionList}>
      {options.map((option, index) => {
        const isSelected = option.key === selectedKey;
        const isLast = index === options.length - 1;

        return (
          <SoftPressable
            key={option.key}
            style={[
              styles.optionItem,
              isLast ? styles.optionItemLast : null,
              isSelected ? styles.optionItemSelected : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option.key)}
          >
            <View style={styles.optionLabelColumn}>
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {option.label}
              </Text>
              {option.hint ? <Text style={styles.optionHint}>{option.hint}</Text> : null}
            </View>
            <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
              {isSelected ? <Ionicons name="checkmark" size={14} color="#3C2BA7" /> : null}
            </View>
          </SoftPressable>
        );
      })}
    </View>
  );
}

function TagPanel({ options, selectedKey, onSelect, onCreateTag, labels }) {
  const [newTagName, setNewTagName] = useState('');
  const trimmed = newTagName.trim();
  const isDisabled = trimmed.length === 0;

  const handleAddTag = useCallback(() => {
    if (isDisabled) {
      return;
    }
    const result = onCreateTag(trimmed);
    if (result?.key) {
      setNewTagName('');
    }
  }, [isDisabled, onCreateTag, trimmed]);

  return (
    <View style={styles.tagPanel}>
      <OptionList options={options} selectedKey={selectedKey} onSelect={onSelect} />
      <View style={styles.tagCreator}>
        <TextInput
          style={styles.tagInput}
          placeholder={labels.createNewTag}
          placeholderTextColor="#7F8A9A"
          value={newTagName}
          onChangeText={setNewTagName}
          onSubmitEditing={handleAddTag}
          returnKeyType="done"
          maxLength={30}
          accessibilityLabel={labels.createNewTag}
        />
        <SoftPressable
          style={[styles.tagAddButton, isDisabled && styles.tagAddButtonDisabled]}
          onPress={handleAddTag}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
        >
          <Text style={[styles.tagAddButtonText, isDisabled && styles.tagAddButtonTextDisabled]}>
            {labels.add}
          </Text>
        </SoftPressable>
      </View>
    </View>
  );
}

function SegmentedControlButton({ label, active, onPress }) {
  return (
    <SoftPressable
      style={[styles.segmentedButton, active && styles.segmentedButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentedButtonLabel, active && styles.segmentedButtonLabelActive]}>
        {label}
      </Text>
    </SoftPressable>
  );
}


export {
  AnimatedReveal,
  InlineInfo,
  OptionList,
  OptionOverlay,
  SegmentedControlButton,
  SheetRow,
  SoftPressable,
  TagPanel,
  TaskEditorMotionProvider,
};
