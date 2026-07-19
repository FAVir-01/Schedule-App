import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translations } from '../constants/i18n';
import { FALLBACK_EMOJI, USE_NATIVE_DRIVER } from '../constants/app';
import { lightenColor } from '../utils/colorUtils';
import { getTaskTagDisplayLabel } from '../utils/taskUtils';
import { formatTaskTime } from '../utils/timeUtils';
import { triggerSelection } from '../utils/feedbackUtils';
import { styles } from '../styles/appStyles';

export default function ProfileSwipeTaskCard({
  task,
  onPress,
  onDelete,
  onToggleSelect,
  isSelected,
  selectionMode,
  language = 'en',
}) {
  const t = translations[language] ?? translations.en;
  const translateX = useRef(new Animated.Value(0)).current;
  const actionWidth = 92;
  const [isOpen, setIsOpen] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const currentOffsetRef = useRef(0);

  useEffect(() => {
    setHasImageError(false);
  }, [task.customImage]);

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
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => setIsOpen(false));
  }, [translateX]);

  const toggleActions = useCallback(() => {
    const shouldOpen = !isOpen;
    setIsOpen(shouldOpen);
    const targetValue = shouldOpen ? -actionWidth : 0;
    currentOffsetRef.current = targetValue;
    Animated.spring(translateX, {
      toValue: targetValue,
      damping: 20,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [actionWidth, isOpen, translateX]);

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
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [actionWidth, translateX]);

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
    if (selectionMode) {
      onToggleSelect?.(task.id);
      return;
    }
    onPress?.();
  }, [closeActions, isOpen, onPress, onToggleSelect, selectionMode, task.id]);

  const handleLongPress = useCallback(() => {
    onToggleSelect?.(task.id);
  }, [onToggleSelect, task.id]);

  const handleDelete = useCallback(() => {
    closeActions();
    triggerSelection();
    onDelete?.(task.id);
  }, [closeActions, onDelete, task.id]);

  const tagLabel = getTaskTagDisplayLabel(task, t.taskDisplay.tags);
  const backgroundColor = lightenColor(task.color, 0.92);

  return (
    <View style={styles.profileSwipeWrapper}>
      <View style={styles.profileSwipeActions}>
        <TouchableOpacity
          style={[
            styles.profileSwipeDelete,
            task.profileLocked && styles.profileSwipeDeleteDisabled,
          ]}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={t.profileTasks.deleteTask}
          disabled={task.profileLocked}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.profileSwipeDeleteText}>{t.profileTasks.delete}</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.profileTaskCard,
          isSelected && styles.profileTaskCardSelected,
          {
            borderColor: task.color,
            backgroundColor,
            transform: [{ translateX }],
          },
        ]}
      >
        <Pressable
          style={styles.profileTaskCardContent}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          <View style={styles.profileTaskIcon}>
            {task.customImage && !hasImageError ? (
              <Image
                source={{ uri: task.customImage }}
                style={styles.profileTaskEmojiImage}
                onError={() => setHasImageError(true)}
              />
            ) : (
              <Text style={styles.profileTaskEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
            )}
          </View>
          <View style={styles.profileTaskDetails}>
            <View style={styles.profileTaskTitleRow}>
              <Text style={styles.profileTaskTitle} numberOfLines={1}>
                {task.title}
              </Text>
              {task.profileLocked ? (
                <Ionicons
                  name="lock-closed"
                  size={14}
                  color="#9aa3b2"
                  style={styles.profileTaskLockIcon}
                />
              ) : null}
            </View>
            <View style={styles.profileTaskMetaRow}>
              <Text style={styles.profileTaskTime}>{formatTaskTime(task.time, { language, anytimeLabel: t.sheet.anytime })}</Text>
              {tagLabel ? (
                <View style={styles.profileTaskTag}>
                  <Text style={styles.profileTaskTagText}>{tagLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>
        <View style={styles.profileTaskVisibleActions}>
          <Pressable
            style={[
              styles.profileTaskVisibleAction,
              isSelected && styles.profileTaskVisibleActionSelected,
            ]}
            onPress={() => onToggleSelect?.(task.id)}
            accessibilityRole="checkbox"
            accessibilityLabel={
              (isSelected
                ? t.profileTasks.deselectTask
                : t.profileTasks.selectTask
              ).replace('{title}', task.title)
            }
            accessibilityState={{ checked: isSelected }}
            hitSlop={4}
          >
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={18}
              color={isSelected ? '#ffffff' : '#656d7e'}
            />
          </Pressable>
          <Pressable
            style={styles.profileTaskVisibleAction}
            onPress={toggleActions}
            accessibilityRole="button"
            accessibilityLabel={
              isOpen ? t.profileTasks.hideActions : t.profileTasks.showActions
            }
            accessibilityState={{ expanded: isOpen }}
            hitSlop={4}
          >
            <Ionicons
              name={isOpen ? 'chevron-forward' : 'ellipsis-horizontal'}
              size={18}
              color="#656d7e"
            />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}
