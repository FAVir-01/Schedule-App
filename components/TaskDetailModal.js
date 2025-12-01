import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

function TaskDetailModal({
  visible,
  task,
  dateKey,
  onClose,
  onToggleSubtask,
  onToggleCompletion,
  onEdit,
  styles,
  formatTaskTime,
  getSubtaskCompletionStatus,
  lightenColor,
}) {
  if (!visible || !task) {
    return null;
  }

  const totalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
  const completedSubtasks = Array.isArray(task.subtasks)
    ? task.subtasks.filter((item) => getSubtaskCompletionStatus(item, dateKey)).length
    : 0;
  const cardBackground = lightenColor(task.color, 0.85);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailOverlay}>
        <Pressable style={styles.detailBackdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.detailCardContainer}>
          <View style={[styles.detailCard, { backgroundColor: cardBackground, borderColor: task.color }]}>
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailHeaderInfo}>
                <Text style={styles.detailEmoji}>{task.emoji}</Text>
                <View style={styles.detailTitleContainer}>
                  <Text style={styles.detailTitle}>{task.title}</Text>
                  <Text style={styles.detailTime}>{formatTaskTime(task.time)}</Text>
                  {totalSubtasks > 0 && (
                    <Text style={styles.detailSubtaskSummaryLabel}>
                      {completedSubtasks}/{totalSubtasks} subtasks completed
                    </Text>
                  )}
                </View>
              </View>
              <Pressable
                onPress={() => {
                  onToggleCompletion?.(task.id);
                }}
                style={[styles.detailToggle, task.completed && styles.detailToggleCompleted]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.completed }}
                accessibilityLabel={task.completed ? 'Mark task as incomplete' : 'Mark task as complete'}
              >
                {task.completed && <Ionicons name="checkmark" size={18} color="#fff" />}
              </Pressable>
            </View>
            <ScrollView style={styles.detailSubtasksContainer}>
              {totalSubtasks === 0 ? (
                <Text style={styles.detailEmptySubtasks}>No subtasks added yet.</Text>
              ) : (
                task.subtasks.map((subtask) => (
                  <Pressable
                    key={subtask.id}
                    style={styles.detailSubtaskRow}
                    onPress={() => onToggleSubtask?.(task.id, subtask.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: getSubtaskCompletionStatus(subtask, dateKey) }}
                    accessibilityLabel={
                      getSubtaskCompletionStatus(subtask, dateKey)
                        ? `Mark ${subtask.title} as incomplete`
                        : `Mark ${subtask.title} as complete`
                    }
                  >
                    <View
                      style={[
                        styles.detailSubtaskIndicator,
                        getSubtaskCompletionStatus(subtask, dateKey) && styles.detailSubtaskIndicatorCompleted,
                      ]}
                    >
                      {getSubtaskCompletionStatus(subtask, dateKey) && (
                        <Ionicons name="checkmark" size={16} color="#ffffff" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.detailSubtaskText,
                        getSubtaskCompletionStatus(subtask, dateKey) && styles.detailSubtaskTextCompleted,
                      ]}
                    >
                      {subtask.title}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable
              style={styles.detailEditLink}
              onPress={() => onEdit?.(task.id)}
              accessibilityRole="button"
              accessibilityLabel="Edit task"
            >
              <Ionicons name="create-outline" size={18} color="#3c2ba7" />
              <Text style={styles.detailEditButtonText}>Edit Task</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default TaskDetailModal;
