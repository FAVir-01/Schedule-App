import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translations } from '../constants/i18n';
import {
  getTaskTagDisplayLabel,
  normalizeRepeatConfig,
  normalizeTaskTagKey,
} from '../utils/taskUtils';
import { pruneSelectedTaskIds } from '../utils/historyUtils';
import ProfileSwipeTaskCard from './ProfileSwipeTaskCard';
import { styles } from '../styles/appStyles';

export default function ProfileTasksModal({
  visible,
  tasks,
  onClose,
  onSelectTask,
  onDeleteTask,
  onDeleteSelected,
  language = 'en',
}) {
  const t = translations[language] ?? translations.en;
  const [searchValue, setSearchValue] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [selectedRepeat, setSelectedRepeat] = useState('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  useEffect(() => {
    if (!visible) {
      setSearchValue('');
      setSelectedTag('all');
      setSelectedRepeat('all');
      setSelectedTaskIds([]);
    }
  }, [visible]);

  useEffect(() => {
    setSelectedTaskIds((previous) => pruneSelectedTaskIds(previous, tasks));
  }, [tasks]);

  const tagOptions = useMemo(() => {
    const seen = new Map();
    tasks.forEach((task) => {
      const key = normalizeTaskTagKey(task);
      if (!key || seen.has(key)) {
        return;
      }
      seen.set(key, getTaskTagDisplayLabel(task, t.taskDisplay.tags) ?? t.taskDetails.tag);
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [t.taskDetails.tag, t.taskDisplay.tags, tasks]);

  const repeatOptions = useMemo(() => {
    const seen = new Set();
    tasks.forEach((task) => {
      const repeatConfig = normalizeRepeatConfig(task.repeat);
      if (!repeatConfig.enabled) {
        seen.add('one-time');
        return;
      }
      const frequency = repeatConfig.frequency ?? repeatConfig.option ?? 'daily';
      seen.add(frequency);
    });
    return Array.from(seen);
  }, [tasks]);

  const repeatLabels = useMemo(
    () => ({
      daily: t.taskDisplay.repeats.daily,
      weekly: t.taskDisplay.repeats.weekly,
      monthly: t.taskDisplay.repeats.monthly,
      weekend: t.taskDisplay.repeats.weekend,
      weekdays: t.taskDisplay.repeats.weekdays,
      'one-time': t.taskDisplay.repeats.oneTime,
    }),
    [t.taskDisplay.repeats]
  );

  const filteredTasks = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    return tasks.filter((task) => {
      if (
        normalizedSearch &&
        !(task.title || '').toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }
      if (selectedTag !== 'all' && normalizeTaskTagKey(task) !== selectedTag) {
        return false;
      }
      if (selectedRepeat !== 'all') {
        const repeatConfig = normalizeRepeatConfig(task.repeat);
        if (!repeatConfig.enabled) {
          return selectedRepeat === 'one-time';
        }
        const frequency = repeatConfig.frequency ?? repeatConfig.option ?? 'daily';
        if (frequency !== selectedRepeat) {
          return false;
        }
      }
      return true;
    });
  }, [searchValue, selectedTag, selectedRepeat, tasks]);

  const toggleSelectedTask = useCallback((taskId) => {
    setSelectedTaskIds((previous) =>
      previous.includes(taskId)
        ? previous.filter((id) => id !== taskId)
        : [...previous, taskId]
    );
  }, []);

  const selectionMode = selectedTaskIds.length > 0;
  const handleBulkDelete = useCallback(() => {
    const deletableIds = selectedTaskIds.filter((taskId) =>
      tasks.some((task) => task.id === taskId && !task.profileLocked)
    );
    if (deletableIds.length === 0) {
      setSelectedTaskIds([]);
      return;
    }
    const confirmMessage =
      deletableIds.length === 1
        ? t.profileTasks.deleteSelectedConfirmMessageOne
        : t.profileTasks.deleteSelectedConfirmMessageMany.replace(
            '{count}',
            String(deletableIds.length)
          );
    Alert.alert(
      t.profileTasks.deleteSelectedConfirmTitle,
      confirmMessage,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.profileTasks.deleteSelected,
          style: 'destructive',
          onPress: () => {
            onDeleteSelected?.(deletableIds);
            setSelectedTaskIds([]);
          },
        },
      ]
    );
  }, [onDeleteSelected, selectedTaskIds, t.common.cancel, t.profileTasks, tasks]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileTasksContainer}>
        <View style={styles.profileTasksHeader}>
          <View>
            <Text style={styles.profileTasksTitle}>{t.profileTasks.title}</Text>
            <Text style={styles.profileTasksSubtitle}>
              {t.profileTasks.subtitle}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t.profileTasks.close}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color="#1F2742" />
          </Pressable>
        </View>
        <View style={styles.profileTasksFilters}>
          <View style={styles.profileTasksSearchRow}>
            <Ionicons name="search-outline" size={18} color="#9aa5b5" />
            <TextInput
              style={styles.profileTasksSearchInput}
              value={searchValue}
              onChangeText={setSearchValue}
              placeholder={t.profileTasks.searchPlaceholder}
              placeholderTextColor="#9aa5b5"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksFilterRow}
          >
            <Pressable
              style={[
                styles.profileTasksFilterPill,
                selectedTag === 'all' && styles.profileTasksFilterPillActive,
              ]}
              onPress={() => setSelectedTag('all')}
            >
              <Text
                style={[
                  styles.profileTasksFilterText,
                  selectedTag === 'all' && styles.profileTasksFilterTextActive,
                ]}
              >
                {t.profileTasks.allTags}
              </Text>
            </Pressable>
            {tagOptions.map((option) => (
              <Pressable
                key={option.key}
                style={[
                  styles.profileTasksFilterPill,
                  selectedTag === option.key && styles.profileTasksFilterPillActive,
                ]}
                onPress={() => setSelectedTag(option.key)}
              >
                <Text
                  style={[
                    styles.profileTasksFilterText,
                    selectedTag === option.key && styles.profileTasksFilterTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksFilterRow}
          >
            <Pressable
              style={[
                styles.profileTasksFilterPill,
                selectedRepeat === 'all' && styles.profileTasksFilterPillActive,
              ]}
              onPress={() => setSelectedRepeat('all')}
            >
              <Text
                style={[
                  styles.profileTasksFilterText,
                  selectedRepeat === 'all' && styles.profileTasksFilterTextActive,
                ]}
              >
                {t.profileTasks.allRepeats}
              </Text>
            </Pressable>
            {repeatOptions.map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.profileTasksFilterPill,
                  selectedRepeat === option && styles.profileTasksFilterPillActive,
                ]}
                onPress={() => setSelectedRepeat(option)}
              >
                <Text
                  style={[
                    styles.profileTasksFilterText,
                    selectedRepeat === option && styles.profileTasksFilterTextActive,
                  ]}
                >
                  {repeatLabels[option] ?? option}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {filteredTasks.length === 0 ? (
          <View style={styles.profileTasksEmpty}>
            <Text style={styles.profileTasksEmptyText}>
              {t.profileTasks.empty}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={(task) => task.id}
            renderItem={({ item }) => (
              <ProfileSwipeTaskCard
                task={item}
                onPress={() => onSelectTask?.(item.id)}
                onDelete={onDeleteTask}
                onToggleSelect={toggleSelectedTask}
                isSelected={selectedTaskIds.includes(item.id)}
                selectionMode={selectionMode}
                language={language}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksList}
          />
        )}
        {selectionMode ? (
          <View style={styles.profileTasksBulkBar}>
            <Text style={styles.profileTasksBulkText}>
              {(selectedTaskIds.length === 1
                ? t.profileTasks.selectedOne
                : t.profileTasks.selectedMany
              ).replace('{count}', String(selectedTaskIds.length))}
            </Text>
            <Pressable
              style={styles.profileTasksBulkDelete}
              onPress={handleBulkDelete}
              accessibilityRole="button"
              accessibilityLabel={t.profileTasks.deleteSelectedAccessibility}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.profileTasksBulkDeleteText}>{t.profileTasks.deleteSelected}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
