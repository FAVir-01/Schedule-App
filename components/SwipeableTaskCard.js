import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function SwipeableTaskCard({
  task,
  backgroundColor,
  borderColor,
  totalSubtasks,
  completedSubtasks,
  onPress,
  onToggleCompletion,
  onCopy,
  onDelete,
  onEdit,
  styles,
  formatTaskTime,
  triggerSelection,
  useNativeDriver,
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const actionWidth = 168;
  const [isOpen, setIsOpen] = useState(false);
  const currentOffsetRef = useRef(0);

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentOffsetRef.current = value;
    });
    return () => {
      translateX.removeListener(id);
    };
  }, [translateX]);

  const closeActions = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver,
    }).start(() => setIsOpen(false));
  }, [translateX, useNativeDriver]);

  const handlePanRelease = useCallback(() => {
    const clampedValue = Math.min(0, Math.max(-actionWidth, currentOffsetRef.current));
    const shouldOpen = clampedValue <= -actionWidth * 0.5;
    const targetValue = shouldOpen ? -actionWidth : 0;

    setIsOpen(shouldOpen);
    currentOffsetRef.current = targetValue;

    Animated.spring(translateX, {
      toValue: targetValue,
      damping: 20,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver,
    }).start();
  }, [actionWidth, translateX, useNativeDriver]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 6 && Math.abs(gesture.dy) < 10,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dx < 0) {
            translateX.setValue(Math.max(-actionWidth, gesture.dx));
          } else if (isOpen) {
            translateX.setValue(Math.min(0, -actionWidth + gesture.dx));
          }
        },
        onPanResponderRelease: () => {
          handlePanRelease();
        },
        onPanResponderTerminate: () => {
          handlePanRelease();
        },
      }),
    [actionWidth, handlePanRelease, isOpen, translateX]
  );

  const handlePress = useCallback(() => {
    if (isOpen) {
      closeActions();
      return;
    }
    onPress?.();
  }, [closeActions, isOpen, onPress]);

  const handleAction = useCallback(
    (callback) => {
      closeActions();
      if (callback) {
        triggerSelection();
        callback();
      }
    },
    [closeActions, triggerSelection]
  );

  const totalLabel = useMemo(() => {
    if (!totalSubtasks) {
      return null;
    }
    return `${completedSubtasks}/${totalSubtasks}`;
  }, [completedSubtasks, totalSubtasks]);

  return (
    <View style={styles.swipeableWrapper}>
      <View style={styles.swipeableActions}>
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionCopy]}
          onPress={() => handleAction(onCopy)}
          accessibilityRole="button"
          accessibilityLabel="Copy task"
        >
          <Ionicons name="copy-outline" size={18} color="#3c2ba7" />
          <Text style={styles.swipeActionText}>Copy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeActionButton, styles.swipeActionDelete]}
          onPress={() => handleAction(onDelete)}
          accessibilityRole="button"
          accessibilityLabel="Delete task"
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={[styles.swipeActionText, styles.swipeActionTextDelete]}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.taskCard,
          {
            backgroundColor,
            borderColor,
            transform: [{ translateX }],
          },
        ]}
      >
        <Pressable style={styles.taskCardContent} onPress={handlePress}>
          <View style={styles.taskInfo}>
            <Text style={styles.taskEmoji}>{task.emoji}</Text>
            <View style={styles.taskDetails}>
              <Text style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={styles.taskTime}>{formatTaskTime(task.time)}</Text>
              {totalLabel && (
                <View style={styles.taskSubtaskSummary}>
                  <Text style={styles.taskSubtaskSummaryText}>{totalLabel}</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable
            onPress={() => handleAction(onToggleCompletion)}
            style={[styles.taskToggle, task.completed && styles.taskToggleCompleted]}
            accessibilityRole="checkbox"
            accessibilityLabel={task.completed ? 'Mark task as incomplete' : 'Mark task as complete'}
            accessibilityState={{ checked: task.completed }}
          >
            {task.completed && <Ionicons name="checkmark" size={18} color="#ffffff" />}
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default SwipeableTaskCard;
