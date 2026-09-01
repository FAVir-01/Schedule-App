import React, { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InlineInfo, SoftPressable } from './parts';
import styles from './styles';

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
  const [draft, setDraft] = useState('');
  const trimmedDraft = draft.trim();
  const list = Array.isArray(value) ? value : [];
  const hasSubtasks = list.length > 0;

  const handleAdd = useCallback(() => {
    if (!trimmedDraft) {
      return;
    }
    onChange((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.push(trimmedDraft);
      return next;
    });
    setDraft('');
  }, [onChange, trimmedDraft]);

  const handleRemove = useCallback(
    (index) => {
      onChange((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    },
    [onChange]
  );

  const handleSubmitEditing = useCallback(() => {
    handleAdd();
  }, [handleAdd]);

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
      <View style={styles.subtasksCard}>
        {hasSubtasks && (
          <View style={styles.subtasksList}>
            {list.map((item, index) => (
              <View
                key={`${item}-${index}`}
                style={[styles.subtaskItem, index === list.length - 1 && styles.subtaskItemLast]}
              >
                <Ionicons name="ellipse-outline" size={18} color="#94A3B8" />
                <Text style={styles.subtaskText}>{item}</Text>
                <SoftPressable
                  onPress={() => handleRemove(index)}
                  accessibilityLabel={`${removeAccessibilityPrefix ?? labels.removeSubtask} ${item}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.subtaskRemoveButton}
                >
                  <Ionicons name="close-outline" size={20} color="#94A3B8" />
                </SoftPressable>
              </View>
            ))}
          </View>
        )}
        <View style={[styles.subtaskComposer, hasSubtasks && styles.subtaskComposerWithDivider]}>
          <TextInput
            style={styles.subtaskComposerInput}
            placeholder={addLabel ?? labels.addSubtask}
            placeholderTextColor="#626B78"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSubmitEditing}
            returnKeyType="done"
            accessibilityLabel={addLabel ?? labels.addSubtask}
          />
          <SoftPressable
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel={addLabel ?? labels.addSubtask}
            style={[styles.subtaskComposerAdd, trimmedDraft.length === 0 && styles.subtaskComposerAddDisabled]}
            disabled={trimmedDraft.length === 0}
          >
            <Ionicons
              name="add"
              size={20}
              color={trimmedDraft.length === 0 ? '#C3CCDC' : '#6B7288'}
            />
          </SoftPressable>
        </View>
      </View>
      <Text style={styles.subtasksPanelHint}>{hintLabel ?? labels.subtasksHint}</Text>
    </View>
  );
}

export default SubtasksPanel;
