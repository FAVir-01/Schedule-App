import React, { useMemo } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translations } from '../constants/i18n';
import { getDateKey } from '../utils/dateUtils';
import { styles } from '../styles/appStyles';

const ENTRY_ICONS = {
  task_created: { name: 'add-circle-outline', color: '#3dd598' },
  task_updated: { name: 'create-outline', color: '#3c2ba7' },
  task_deleted: { name: 'trash-outline', color: '#e0574f' },
  task_completed: { name: 'checkmark-circle', color: '#3dd598' },
  task_uncompleted: { name: 'ellipse-outline', color: '#9aa5b5' },
  subtask_completed: { name: 'checkbox-outline', color: '#3dd598' },
  subtask_uncompleted: { name: 'square-outline', color: '#9aa5b5' },
};

// Normaliza o tipo bruto do history (toggles viram completed/uncompleted).
const resolveEntryKind = (entry) => {
  if (entry.type === 'task_completion_toggled') {
    return entry.details?.completed ? 'task_completed' : 'task_uncompleted';
  }
  if (entry.type === 'subtask_completion_toggled') {
    return entry.details?.completed ? 'subtask_completed' : 'subtask_uncompleted';
  }
  return entry.type;
};

export default function ActivityTimelineModal({
  visible,
  history,
  tasks,
  onClose,
  language = 'en',
}) {
  const t = (translations[language] ?? translations.en).activity;

  const sections = useMemo(() => {
    if (!visible) {
      return [];
    }
    const titleByTaskId = new Map(tasks.map((task) => [task.id, task.title]));
    const locale = language === 'pt' ? 'pt-BR' : 'en-US';
    const todayKey = getDateKey(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getDateKey(yesterday);

    const rows = [];
    let currentDayKey = null;
    history.forEach((entry) => {
      const kind = resolveEntryKind(entry);
      if (!ENTRY_ICONS[kind]) {
        return;
      }
      const date = new Date(entry.timestamp);
      if (Number.isNaN(date.getTime())) {
        return;
      }
      const dayKey = getDateKey(date);
      if (dayKey !== currentDayKey) {
        currentDayKey = dayKey;
        const header =
          dayKey === todayKey
            ? t.today
            : dayKey === yesterdayKey
            ? t.yesterday
            : date.toLocaleDateString(locale, {
                day: 'numeric',
                month: 'long',
                year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
              });
        rows.push({ id: `header-${dayKey}`, kind: 'header', label: header });
      }
      const title = entry.details?.title ?? titleByTaskId.get(entry.details?.taskId) ?? t.unknownTask;
      rows.push({
        id: entry.id,
        kind,
        label: (t[kind] ?? '{title}').replace('{title}', title),
        time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: language !== 'pt' }),
      });
    });
    return rows;
  }, [history, language, t, tasks, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileTasksContainer}>
        <View style={styles.profileTasksHeader}>
          <View>
            <Text style={styles.profileTasksTitle}>{t.title}</Text>
            <Text style={styles.profileTasksSubtitle}>{t.subtitle}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t.close}
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color="#1F2742" />
          </Pressable>
        </View>
        {sections.length === 0 ? (
          <View style={styles.profileTasksEmpty}>
            <Text style={styles.profileTasksEmptyText}>{t.empty}</Text>
          </View>
        ) : (
          <FlatList
            data={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <Text style={styles.activityDayHeader}>{item.label}</Text>
              ) : (
                <View style={styles.activityRow}>
                  <Ionicons
                    name={ENTRY_ICONS[item.kind].name}
                    size={18}
                    color={ENTRY_ICONS[item.kind].color}
                    style={styles.activityRowIcon}
                  />
                  <Text style={styles.activityRowLabel} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <Text style={styles.activityRowTime}>{item.time}</Text>
                </View>
              )
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksList}
          />
        )}
      </View>
    </Modal>
  );
}
