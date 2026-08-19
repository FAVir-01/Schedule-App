import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styles from './styles';

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
  bubbleMaxWidth,
  errorText,
}) {
  return (
    <View
      style={[
        styles.row,
        isLast && styles.rowLast,
        disabled && styles.rowDisabled,
        isInfoVisible && styles.rowInfoVisible,
        errorText && styles.rowHasError,
      ]}
    >
      <TouchableOpacity
        style={styles.rowLeft}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={errorText ? `${label}, ${value}, ${errorText}` : `${label}, ${value}`}
        accessibilityState={{ selected: false, disabled }}
      >
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </TouchableOpacity>

      {infoText ? (
        <Pressable
          onPress={onPressInfo}
          style={styles.infoIconButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={infoText}
        >
          <Ionicons name="help-circle-outline" size={14} color="#59636f" />
        </Pressable>
      ) : null}

      <TouchableOpacity
        style={styles.rowRight}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.72}
        accessible={false}
      >
        <Text style={styles.rowValue}>{value}</Text>
        {showChevron && <Ionicons name="chevron-forward" size={18} color="#9aa0af" />}
      </TouchableOpacity>

      {errorText ? (
        <Text style={styles.rowErrorText} accessibilityLiveRegion="polite">
          {errorText}
        </Text>
      ) : null}

      {isInfoVisible ? (
        <View style={[styles.floatingInfoBubble, styles.rowFloatingInfoBubble, bubbleMaxWidth ? { maxWidth: bubbleMaxWidth } : null]}>
          <Text style={styles.inlineInfoText}>{infoText}</Text>
        </View>
      ) : null}
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
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
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
        <View style={styles.overlayCard}>
          <View style={styles.overlayHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              onPress={onClose}
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={24} color="#1F2742" />
            </Pressable>
            <View style={styles.overlayTitleContainer}>
              <Text style={styles.overlayTitle}>{title}</Text>
              {subtitle ? <Text style={styles.overlaySubtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable
              style={styles.overlayApplyButton}
              onPress={onApply}
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
            </Pressable>
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
        </View>
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
          <Pressable
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
              {isSelected && <View style={styles.radioInner} />}
            </View>
          </Pressable>
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
        <Pressable
          style={[styles.tagAddButton, isDisabled && styles.tagAddButtonDisabled]}
          onPress={handleAddTag}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
        >
          <Text style={[styles.tagAddButtonText, isDisabled && styles.tagAddButtonTextDisabled]}>
            {labels.add}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SegmentedControlButton({ label, active, onPress }) {
  return (
    <Pressable
      style={[styles.segmentedButton, active && styles.segmentedButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentedButtonLabel, active && styles.segmentedButtonLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}


export { OptionList, OptionOverlay, SegmentedControlButton, SheetRow, TagPanel };
