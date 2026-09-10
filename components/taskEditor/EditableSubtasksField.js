import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { editSubtaskLines } from '../../domain/subtaskEditor';
import styles from './styles';

export default function EditableSubtasksField({ value, onChange, title, hint }) {
  return (
    <View style={styles.subtasksPanel}>
      <Text style={styles.subtasksTitle}>{title}</Text>
      <View style={styles.subtasksCard}>
        <TextInput
          multiline
          textAlignVertical="top"
          style={[styles.subtaskComposerInput, { minHeight: 120, lineHeight: 28, flex: 0 }]}
          value={(value ?? []).map((item) => item.title).join('\n')}
          onChangeText={(text) => onChange(editSubtaskLines(value, text))}
          placeholder={hint}
          placeholderTextColor="#626B78"
          accessibilityLabel={title}
        />
      </View>
      <Text style={styles.subtasksPanelHint}>{hint}</Text>
    </View>
  );
}
