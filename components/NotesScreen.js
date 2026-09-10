// Feed de notas: reune entradas avulsas e os eventos diarios das tarefas.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDateLocale, translations } from '../constants/i18n';
import { buildNotesFeed } from '../domain/notesFeed';
import { styles } from '../styles/appStyles';
import { lightenColor } from '../utils/colorUtils';
import NoteEditorModal from './NoteEditorModal';

const formatDayLabel = (group, t, locale, language) => {
  if (group.pinned) {
    return t.pinnedSection;
  }
  if (!group.date) {
    return t.noDate;
  }
  if (isToday(group.date)) {
    return t.today;
  }
  if (isYesterday(group.date)) {
    return t.yesterday;
  }
  return format(group.date, language === 'pt' ? "d 'de' MMMM" : 'MMMM d', { locale });
};

const getNoteWeight = (note) => {
  const textRows = Math.min(5, Math.ceil(`${note?.text ?? ''}`.length / 24));
  const imageRows = Math.ceil((Array.isArray(note?.images) ? note.images.length : 0) / 2);
  return 72 + textRows * 18 + imageRows * 104;
};

const splitIntoMasonryColumns = (notes) => {
  const columns = [[], []];
  const weights = [0, 0];
  (notes ?? []).forEach((note) => {
    const target = weights[0] <= weights[1] ? 0 : 1;
    columns[target].push(note);
    weights[target] += getNoteWeight(note);
  });
  return columns;
};

const chunkImages = (images) => {
  const rows = [];
  for (let index = 0; index < images.length; index += 2) {
    rows.push(images.slice(index, index + 2));
  }
  return rows;
};

function NoteImages({ images }) {
  const rows = chunkImages(Array.isArray(images) ? images : []);
  if (!rows.length) {
    return null;
  }
  return (
    <View style={styles.noteCardImageRows}>
      {rows.map((row, rowIndex) => (
        <View key={`${row[0]}-${rowIndex}`} style={styles.noteImageRow}>
          {row.map((uri) => (
            <View
              key={uri}
              style={[styles.noteImageCell, row.length === 1 && styles.noteImageCellSingle]}
            >
              <Image source={{ uri }} style={styles.noteCardImage} resizeMode="cover" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function TaskNoteAvatar({ note, size = 22 }) {
  const [hasImageError, setHasImageError] = useState(false);
  useEffect(() => setHasImageError(false), [note?.taskImage]);

  return (
    <View
      style={[
        styles.noteTaskAvatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: note?.taskColor
            ? lightenColor(note.taskColor, 0.72)
            : '#eceaf8',
        },
      ]}
    >
      {note?.taskImage && !hasImageError ? (
        <Image
          source={{ uri: note.taskImage }}
          style={styles.noteTaskAvatarImage}
          onError={() => setHasImageError(true)}
        />
      ) : (
        <Text style={[styles.noteTaskAvatarEmoji, { fontSize: Math.max(11, size * 0.55) }]}>
          {note?.taskEmoji || '✓'}
        </Text>
      )}
    </View>
  );
}

function NoteCard({ note, title, onPress, onPrivacyOptions, labels, reduceMotion }) {
  const isTaskNote = note.source === 'task';
  const entrance = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return undefined;
    }
    const animation = Animated.spring(entrance, {
      toValue: 1,
      damping: 20,
      stiffness: 230,
      mass: 0.75,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, reduceMotion]);

  const cardColors = note.cardColor
    ? { backgroundColor: lightenColor(note.cardColor, 0.75), borderColor: note.cardColor }
    : null;
  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }}
    >
      <Pressable
        style={({ pressed }) => [
          styles.noteGridCard,
          cardColors,
          pressed && styles.noteGridCardPressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${note.text}`}
      >
        <View style={styles.noteGridCardHeader}>
          {isTaskNote ? (
            <TaskNoteAvatar note={note} />
          ) : (
            <View style={styles.noteStandaloneAvatar}>
              <Ionicons name="document-text-outline" size={14} color="#646b76" />
            </View>
          )}
          <Text style={styles.noteGridCardTitle} numberOfLines={2}>
            {title}
          </Text>
          {note.pinned ? <Ionicons name="pin" size={13} color="#655b83" /> : null}
        </View>
        {note.text ? (
          <Text style={styles.noteGridCardText} numberOfLines={5}>
            {note.text}
          </Text>
        ) : null}
        {note.isLocked ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <Ionicons name="lock-closed-outline" size={15} color="#646b76" />
            <Text style={styles.noteGridCardText}>{labels.unlockNote}</Text>
          </View>
        ) : <NoteImages images={note.images} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
          <Text style={[styles.noteGridCardText, { flex: 1, fontSize: 11 }]} numberOfLines={1}>
            {isTaskNote ? note.taskTitle || labels.unknownTask : labels.generalNote}
          </Text>
          {(note.noteProtected || note.taskNotesProtected) && <Ionicons name="lock-closed-outline" size={12} color="#646b76" />}
          <Pressable onPress={(event) => { event.stopPropagation(); onPrivacyOptions?.(note); }}
            hitSlop={8} accessibilityRole="button" accessibilityLabel={labels.privacyOptions}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#646b76" />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function NotesScreen({
  visible = false,
  language = 'en',
  notes = [],
  tasks = [],
  todayKey,
  onSaveTaskNote,
  onUnlockNotes,
  onNotePrivacyOptions,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onBack,
  reduceMotion = false,
}) {
  const insets = useSafeAreaInsets();
  const localePack = translations[language] ?? translations.en;
  const t = localePack.notes;
  const locale = getDateLocale(language);
  const [search, setSearch] = useState('');
  const [editorTarget, setEditorTarget] = useState(null);
  const [choosingSource, setChoosingSource] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const groups = useMemo(() => buildNotesFeed(notes, { search }), [notes, search]);
  const hasNotes = notes.length > 0;

  const openCreateEditor = useCallback(() => {
    setTaskSearch('');
    setChoosingSource(true);
  }, []);

  const openExistingEditor = useCallback(async (note) => {
    if (note.isLocked && !(await onUnlockNotes?.())) return;
    setEditorTarget({ key: note.id, noteId: note.id });
  }, [onUnlockNotes]);

  const editorNote = notes.find((note) => note.id === editorTarget?.noteId) ?? null;
  const taskContext =
    editorNote?.source === 'task'
      ? {
          taskId: editorNote.taskId,
          taskTitle: editorNote.taskTitle,
          taskImage: editorNote.taskImage,
          taskEmoji: editorNote.taskEmoji,
          taskColor: editorNote.taskColor,
        }
      : editorTarget?.taskContext ?? null;

  const chooseTask = async (task) => {
    const existing = task && notes.find((note) => note.source === 'task' && String(note.taskId) === String(task.id) && note.dateKey === todayKey);
    if (existing) {
      await openExistingEditor(existing);
      setChoosingSource(false);
      return;
    }
    setEditorTarget({ key: `new-${Date.now()}`, dateKey: todayKey, taskContext: task ? {
      taskId: task.id, taskTitle: task.title, taskImage: task.customImage,
      taskEmoji: task.emoji, taskColor: task.color,
    } : null });
    setChoosingSource(false);
  };

  useEffect(() => {
    if (!visible) { setEditorTarget(null); setChoosingSource(false); }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={() => (editorTarget ? setEditorTarget(null) : onBack?.())}
    >
      <View style={styles.notesModalRoot}>
        <View style={styles.notesScreen}>
          <View style={[styles.notesHeader, { paddingTop: insets.top + 14 }]}>
            <Text style={styles.notesTitle}>{t.title}</Text>
            <Pressable
              style={styles.notesCloseButton}
              onPress={onBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t.close}
            >
              <Ionicons name="close" size={20} color="#1a1a2e" />
            </Pressable>
          </View>

          <View style={styles.notesSearch}>
            <Ionicons name="search-outline" size={20} color="#8c929d" />
            <TextInput
              style={styles.notesSearchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t.searchPlaceholder}
              placeholderTextColor="#9aa0aa"
              accessibilityLabel={t.searchPlaceholder}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button">
                <Ionicons name="close-circle" size={18} color="#a6abb4" />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            style={styles.notesBody}
            contentContainerStyle={[
              styles.notesListContent,
              { paddingBottom: insets.bottom + 108 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {groups.length === 0 ? (
              <View style={styles.notesEmptyState}>
                <View style={styles.notesEmptyIcon}>
                  <Ionicons name="document-text-outline" size={27} color="#4938b8" />
                </View>
                <Text style={styles.notesEmpty}>{hasNotes ? t.noResults : t.empty}</Text>
              </View>
            ) : (
              groups.map((group) => {
                const columns = splitIntoMasonryColumns(group.notes);
                return (
                  <View
                    key={group.key}
                    style={styles.notesGroup}
                  >
                    <View style={styles.notesDayHeadingRow}>
                      {group.pinned ? (
                        <Ionicons name="pin" size={14} color="#4938b8" />
                      ) : null}
                      <Text
                        style={[
                          styles.notesDayLabel,
                          group.pinned && styles.notesPinnedDayLabel,
                        ]}
                      >
                        {formatDayLabel(group, t, locale, language)}
                      </Text>
                    </View>
                    <View style={styles.notesGrid}>
                      {columns.map((column, columnIndex) => (
                        <View key={`${group.key}-${columnIndex}`} style={styles.notesGridColumn}>
                          {column.map((note) => {
                            const title =
                              note.title ||
                              (note.source === 'task'
                                ? note.taskTitle || t.unknownTask
                                : t.standalone);
                            return (
                              <NoteCard
                                key={note.id}
                                note={note}
                                title={title}
                                onPress={() => openExistingEditor(note)}
                                onPrivacyOptions={onNotePrivacyOptions}
                                labels={t}
                                reduceMotion={reduceMotion}
                              />
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <Pressable
            style={({ pressed }) => [
              styles.notesFab,
              { bottom: insets.bottom + 20 },
              pressed && styles.notesFabPressed,
            ]}
            onPress={openCreateEditor}
            accessibilityRole="button"
            accessibilityLabel={t.newNote}
          >
            <Ionicons name="add" size={31} color="#ffffff" />
          </Pressable>

          <NoteEditorModal
            key={editorTarget?.key ?? 'closed-editor'}
            visible={Boolean(editorTarget) && !editorNote?.isLocked}
            note={editorNote}
            taskContext={taskContext}
            defaultTitle={taskContext?.taskTitle ?? ''}
            language={language}
            reduceMotion={reduceMotion}
            onClose={() => setEditorTarget(null)}
            onPrivacyOptions={onNotePrivacyOptions}
            onSave={(content) => {
              const preferences = {
                pinned: content.pinned,
                cardColor: content.cardColor,
              };
              if (taskContext && !content.id) {
                return onSaveTaskNote?.(taskContext.taskId, editorTarget.dateKey, content);
              }
              return content.id
                ? onUpdateNote?.(
                    content.id,
                    content.text,
                    content.images,
                    content.title,
                    preferences
                  )
                : onCreateNote?.(
                    content.text,
                    content.images,
                    content.title,
                    preferences
                  );
            }}
            onDelete={onDeleteNote}
          />
          <Modal visible={choosingSource} transparent animationType="fade" onRequestClose={() => setChoosingSource(false)}>
            <View style={styles.reportOverlay}>
              <Pressable style={styles.reportBackdrop} onPress={() => setChoosingSource(false)} />
              <View style={[styles.reflectionSheet, { maxHeight: '80%', paddingBottom: insets.bottom + 20 }]}>
                <View style={styles.reflectionHeader}>
                  <Text style={styles.reflectionTitle}>{t.chooseSource}</Text>
                  <Pressable onPress={() => setChoosingSource(false)} hitSlop={10} accessibilityLabel={localePack.common.cancel} accessibilityRole="button">
                    <Ionicons name="close" size={22} color="#504B67" />
                  </Pressable>
                </View>
                <Pressable style={styles.settingsRow} onPress={() => chooseTask(null)} accessibilityRole="button">
                  <Ionicons name="document-text-outline" size={22} color="#504B67" />
                  <Text style={styles.settingsRowTitle}>{t.generalNote}</Text>
                </Pressable>
                <Text style={[styles.noteGridCardText, { marginHorizontal: 20 }]}>{t.chooseTaskHint}</Text>
                <TextInput value={taskSearch} onChangeText={setTaskSearch} placeholder={t.searchTasks}
                  accessibilityLabel={t.searchTasks} style={[styles.notesSearchInput, { marginHorizontal: 20, minHeight: 44, flex: 0 }]} />
                <ScrollView keyboardShouldPersistTaps="handled">
                  {tasks.filter((task) => task.title?.toLocaleLowerCase().includes(taskSearch.trim().toLocaleLowerCase())).map((task) => (
                    <Pressable key={task.id} style={styles.settingsRow} onPress={() => chooseTask(task)} accessibilityRole="button">
                      <Text>{task.emoji || '✓'}</Text>
                      <Text style={[styles.settingsRowTitle, { flex: 1 }]}>{task.title}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#646b76" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}
