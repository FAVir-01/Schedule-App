import React, { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
          <Pressable onPress={onPressInfo} style={styles.infoIconButton} hitSlop={8}>
            <Ionicons name="help-circle-outline" size={14} color="#59636f" />
          </Pressable>
        ) : null}
        {isInfoVisible ? (
          <View style={[styles.floatingInfoBubble, styles.sectionFloatingInfoBubble]}>
            <Text style={styles.inlineInfoText}>{infoText}</Text>
          </View>
        ) : null}
      </View>
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
                <Pressable
                  onPress={() => handleRemove(index)}
                  accessibilityLabel={`${removeAccessibilityPrefix ?? labels.removeSubtask} ${item}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={styles.subtaskRemoveButton}
                >
                  <Ionicons name="close-outline" size={20} color="#94A3B8" />
                </Pressable>
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
          <Pressable
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
          </Pressable>
        </View>
      </View>
      <Text style={styles.subtasksPanelHint}>{hintLabel ?? labels.subtasksHint}</Text>
    </View>
  );
}

export default SubtasksPanel;
