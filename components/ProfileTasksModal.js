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
  getTaskLastCompletionDateKey,
  getTaskRepeatDisplayLabel,
  getTaskStreak,
  getTaskTagDisplayLabel,
  isTaskInactive,
  normalizeRepeatConfig,
  normalizeTaskTagKey,
} from '../utils/taskUtils';
import { pruneSelectedTaskIds } from '../utils/historyUtils';
import ProfileTaskRow, { formatTaskRowDate } from './ProfileTaskRow';
import UndoSnackbar from './UndoSnackbar';
import { styles } from '../styles/appStyles';

// Seções fixas por tipo: Hábitos (default), Metas (quantum), Lembretes (reminder).
const getTaskSection = (task) => {
  if (task.type === 'quantum') {
    return 'goals';
  }
  if (task.type === 'reminder') {
    return 'reminders';
  }
  return 'habits';
};

const SECTION_ORDER = ['habits', 'goals', 'reminders'];

export default function ProfileTasksModal({
  visible,
  tasks,
  todayKey,
  onClose,
  onSelectTask,
  onDeleteSelected,
  onArchiveSelected,
  onUnarchiveSelected,
  undoMessage,
  undoActionLabel,
  onUndoDelete,
  language = 'en',
}) {
  const t = translations[language] ?? translations.en;
  const [viewTab, setViewTab] = useState('active');
  const [searchValue, setSearchValue] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');
  const [selectedRepeat, setSelectedRepeat] = useState('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);

  useEffect(() => {
    if (!visible) {
      setViewTab('active');
      setSearchValue('');
      setSelectedTag('all');
      setSelectedRepeat('all');
      setSelectedTaskIds([]);
    }
  }, [visible]);

  useEffect(() => {
    setSelectedTaskIds((previous) => pruneSelectedTaskIds(previous, tasks));
  }, [tasks]);

  const { activeTasks, archivedTasks } = useMemo(() => {
    const active = [];
    const archived = [];
    tasks.forEach((task) => {
      (isTaskInactive(task, todayKey) ? archived : active).push(task);
    });
    return { activeTasks: active, archivedTasks: archived };
  }, [tasks, todayKey]);

  const tabTasks = viewTab === 'active' ? activeTasks : archivedTasks;

  const handleSelectTab = useCallback((tab) => {
    setViewTab(tab);
    setSelectedTaskIds([]);
  }, []);

  const tagOptions = useMemo(() => {
    const seen = new Map();
    tabTasks.forEach((task) => {
      const key = normalizeTaskTagKey(task);
      if (!key || seen.has(key)) {
        return;
      }
      seen.set(key, getTaskTagDisplayLabel(task, t.taskDisplay.tags) ?? t.taskDetails.tag);
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [t.taskDetails.tag, t.taskDisplay.tags, tabTasks]);

  const repeatOptions = useMemo(() => {
    const seen = new Set();
    tabTasks.forEach((task) => {
      const repeatConfig = normalizeRepeatConfig(task.repeat);
      if (!repeatConfig.enabled) {
        seen.add('one-time');
        return;
      }
      seen.add(repeatConfig.frequency ?? 'daily');
    });
    return Array.from(seen);
  }, [tabTasks]);

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
    return tabTasks.filter((task) => {
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
        if ((repeatConfig.frequency ?? 'daily') !== selectedRepeat) {
          return false;
        }
      }
      return true;
    });
  }, [searchValue, selectedTag, selectedRepeat, tabTasks]);

  // Lista com cabeçalhos de seção intercalados + metadados prontos por card
  // (streak/última conclusão calculados uma vez por render, não por card).
  const listItems = useMemo(() => {
    const sectionLabels = {
      habits: t.profileTasks.sectionHabits,
      goals: t.profileTasks.sectionGoals,
      reminders: t.profileTasks.sectionReminders,
    };
    const grouped = { habits: [], goals: [], reminders: [] };
    filteredTasks.forEach((task) => {
      grouped[getTaskSection(task)].push(task);
    });

    const items = [];
    SECTION_ORDER.forEach((section) => {
      if (grouped[section].length === 0) {
        return;
      }
      items.push({
        type: 'header',
        key: `header-${section}`,
        label: `${sectionLabels[section]} · ${grouped[section].length}`,
      });
      grouped[section].forEach((task) => {
        const repeatConfig = normalizeRepeatConfig(task.repeat);
        let metaText = null;
        let streak = 0;
        if (viewTab === 'archived') {
          metaText = task.archived && task.archivedAt
            ? t.profileTasks.archivedOn.replace(
                '{date}',
                formatTaskRowDate(task.archivedAt, language) ?? task.archivedAt
              )
            : formatTaskRowDate(task.dateKey ?? task.date, language);
        } else if (!repeatConfig.enabled || task.type === 'reminder') {
          metaText = formatTaskRowDate(task.dateKey ?? task.date, language);
        } else {
          streak = getTaskStreak(task);
          const lastKey = getTaskLastCompletionDateKey(task);
          const lastText = lastKey
            ? t.profileTasks.lastDone.replace(
                '{date}',
                formatTaskRowDate(lastKey, language) ?? lastKey
              )
            : t.profileTasks.neverDone;
          const repeatLabel = getTaskRepeatDisplayLabel(
            task.repeat,
            t.taskDisplay.repeats
          );
          metaText = repeatLabel ? `${repeatLabel} · ${lastText}` : lastText;
        }
        items.push({ type: 'task', key: task.id, task, metaText, streak });
      });
    });
    return items;
  }, [filteredTasks, language, t.profileTasks, t.taskDisplay.repeats, viewTab]);

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
    Alert.alert(t.profileTasks.deleteSelectedConfirmTitle, confirmMessage, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.profileTasks.delete,
        style: 'destructive',
        onPress: () => {
          onDeleteSelected?.(deletableIds);
          setSelectedTaskIds([]);
        },
      },
    ]);
  }, [onDeleteSelected, selectedTaskIds, t.common.cancel, t.profileTasks, tasks]);

  const handleBulkArchive = useCallback(() => {
    onArchiveSelected?.(selectedTaskIds);
    setSelectedTaskIds([]);
  }, [onArchiveSelected, selectedTaskIds]);

  const handleBulkUnarchive = useCallback(() => {
    onUnarchiveSelected?.(selectedTaskIds);
    setSelectedTaskIds([]);
  }, [onUnarchiveSelected, selectedTaskIds]);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'header') {
        return <Text style={styles.profileTasksSectionHeader}>{item.label}</Text>;
      }
      return (
        <ProfileTaskRow
          task={item.task}
          metaText={item.metaText}
          streak={item.streak}
          isArchivedView={viewTab === 'archived'}
          onPress={onSelectTask}
          onToggleSelect={toggleSelectedTask}
          isSelected={selectedTaskIds.includes(item.task.id)}
          selectionMode={selectionMode}
          language={language}
        />
      );
    },
    [language, onSelectTask, selectedTaskIds, selectionMode, toggleSelectedTask, viewTab]
  );

  if (!visible) {
    return null;
  }

  const isFilteringEmpty = tabTasks.length > 0 && filteredTasks.length === 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileTasksContainer}>
        <View style={styles.profileTasksHeader}>
          <Text style={styles.profileTasksTitle}>{t.profileTasks.title}</Text>
          <Pressable
            style={styles.profileTasksCloseButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t.profileTasks.close}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color="#1a1a2e" />
          </Pressable>
        </View>

        <View style={styles.profileTasksTabsPill}>
          {[
            { key: 'active', label: t.profileTasks.tabActive, count: activeTasks.length },
            { key: 'archived', label: t.profileTasks.tabArchived, count: archivedTasks.length },
          ].map((tab) => {
            const isActive = viewTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.profileTasksTab, isActive && styles.profileTasksTabActive]}
                onPress={() => handleSelectTab(tab.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.profileTasksTabText,
                    isActive && styles.profileTasksTabTextActive,
                  ]}
                >
                  {tab.label}
                  {tab.count > 0 ? ` (${tab.count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.profileTasksFilters}>
          <View style={styles.profileTasksSearchRow}>
            <Ionicons name="search-outline" size={18} color="#626b78" />
            <TextInput
              style={styles.profileTasksSearchInput}
              value={searchValue}
              onChangeText={setSearchValue}
              placeholder={t.profileTasks.searchPlaceholder}
              placeholderTextColor="#626b78"
            />
          </View>
          {tagOptions.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.profileTasksFilterRow}
            >
              {[{ key: 'all', label: t.profileTasks.allTags }, ...tagOptions].map((option) => (
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
          ) : null}
          {repeatOptions.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.profileTasksFilterRow}
            >
              {['all', ...repeatOptions].map((option) => (
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
                    {option === 'all'
                      ? t.profileTasks.allRepeats
                      : repeatLabels[option] ?? option}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {listItems.length === 0 ? (
          <View style={styles.profileTasksEmpty}>
            <Ionicons
              name={viewTab === 'archived' ? 'archive-outline' : 'leaf-outline'}
              size={40}
              color="#767c8f"
            />
            <Text style={styles.profileTasksEmptyText}>
              {isFilteringEmpty
                ? t.profileTasks.empty
                : viewTab === 'archived'
                  ? t.profileTasks.emptyArchived
                  : t.profileTasks.emptyActive}
            </Text>
          </View>
        ) : (
          <FlatList
            data={listItems}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksList}
            initialNumToRender={10}
            windowSize={7}
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
            <View style={styles.profileTasksBulkButtons}>
              {viewTab === 'active' ? (
                // Ativas só podem ser arquivadas; excluir exige arquivar antes.
                <Pressable
                  style={styles.profileTasksBulkAction}
                  onPress={handleBulkArchive}
                  accessibilityRole="button"
                  accessibilityLabel={t.profileTasks.archiveSelectedAccessibility}
                >
                  <Ionicons name="archive-outline" size={16} color="#3c2ba7" />
                  <Text style={styles.profileTasksBulkActionText}>
                    {t.profileTasks.archive}
                  </Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    style={styles.profileTasksBulkAction}
                    onPress={handleBulkUnarchive}
                    accessibilityRole="button"
                    accessibilityLabel={t.profileTasks.unarchiveSelectedAccessibility}
                  >
                    <Ionicons name="refresh-outline" size={16} color="#3c2ba7" />
                    <Text style={styles.profileTasksBulkActionText}>
                      {t.profileTasks.unarchive}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.profileTasksBulkDelete}
                    onPress={handleBulkDelete}
                    accessibilityRole="button"
                    accessibilityLabel={t.profileTasks.deleteSelectedAccessibility}
                  >
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                    <Text style={styles.profileTasksBulkDeleteText}>
                      {t.profileTasks.delete}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ) : null}
        <UndoSnackbar
          message={undoMessage}
          actionLabel={undoActionLabel}
          onAction={onUndoDelete}
        />
      </View>
    </Modal>
  );
}
