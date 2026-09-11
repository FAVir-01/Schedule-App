import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  insertSubtaskEntry,
  removeSubtaskEntry,
  setSubtaskEntryTitle,
} from '../../domain/subtaskEditor';
import { InlineInfo, SoftPressable } from './parts';
import styles from './styles';

// Cada item e uma linha editavel no lugar, na criacao e na edicao. Enter na
// linha abre a proxima; backspace numa linha vazia volta para a anterior.
function SubtasksPanel({
  value,
  onChange,
  infoText,
  onPressInfo,
  isInfoVisible = false,
  labels,
  titleLabel,
  addLabel,
  hintLabel,
  removeAccessibilityPrefix,
}) {
  const list = Array.isArray(value) ? value : [];
  const hasSubtasks = list.length > 0;
  const inputRefs = useRef([]);
  const nextKeyRef = useRef(0);
  const [pendingFocus, setPendingFocus] = useState(null);

  useEffect(() => {
    if (pendingFocus == null) {
      return;
    }
    inputRefs.current[pendingFocus]?.focus();
    setPendingFocus(null);
  }, [pendingFocus, list.length]);

  const handleInsert = useCallback(
    (index) => {
      nextKeyRef.current += 1;
      onChange(insertSubtaskEntry(list, index, `new-${nextKeyRef.current}`));
      setPendingFocus(index);
    },
    [list, onChange]
  );

  const handleRemove = useCallback(
    (index, focusPrevious = false) => {
      onChange(removeSubtaskEntry(list, index));
      if (focusPrevious && index > 0) {
        setPendingFocus(index - 1);
      }
    },
    [list, onChange]
  );

  return (
    <View style={styles.subtasksPanel}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.subtasksTitle}>{titleLabel ?? labels.subtasks}</Text>
        {onPressInfo ? (
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
      </View>
      <InlineInfo visible={isInfoVisible} text={infoText} />
      {hasSubtasks ? (
        <View style={styles.subtasksCard}>
          <View style={styles.subtasksList}>
            {list.map((item, index) => (
              <View
                key={item.key ?? item.id ?? `row-${index}`}
                style={[styles.subtaskItem, index === list.length - 1 && styles.subtaskItemLast]}
              >
                <Ionicons name="ellipse-outline" size={18} color="#94A3B8" />
                <TextInput
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={styles.subtaskInput}
                  value={item.title}
                  onChangeText={(title) => onChange(setSubtaskEntryTitle(list, index, title))}
                  onSubmitEditing={() => handleInsert(index + 1)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && !item.title) {
                      handleRemove(index, true);
                    }
                  }}
                  blurOnSubmit={false}
                  returnKeyType="next"
                  accessibilityLabel={`${titleLabel ?? labels.subtasks} ${index + 1}`}
                />
                <SoftPressable
                  onPress={() => handleRemove(index)}
                  accessibilityLabel={`${removeAccessibilityPrefix ?? labels.removeSubtask} ${item.title}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.subtaskRemoveButton}
                >
                  <Ionicons name="close-outline" size={20} color="#94A3B8" />
                </SoftPressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.timeGroupAddRow}>
        <View style={styles.timeGroupAddLine} />
        <SoftPressable
          style={styles.timeGroupAddButton}
          onPress={() => handleInsert(list.length)}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? labels.addSubtask}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </SoftPressable>
        <View style={styles.timeGroupAddLine} />
      </View>
      <Text style={styles.subtasksPanelHint}>{hintLabel ?? labels.subtasksHint}</Text>
    </View>
  );
}

export default SubtasksPanel;
