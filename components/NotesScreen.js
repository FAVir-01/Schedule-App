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

function NoteCard({ note, title, onPress, reduceMotion }) {
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
        <NoteImages images={note.images} />
      </Pressable>
    </Animated.View>
  );
}

export default function NotesScreen({
  visible = false,
  language = 'en',
  notes = [],
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
  const groups = useMemo(() => buildNotesFeed(notes, { search }), [notes, search]);
  const hasNotes = notes.length > 0;

  const openCreateEditor = useCallback(() => {
    setEditorTarget({ key: `new-${Date.now()}`, note: null });
  }, []);

  const openExistingEditor = useCallback((note) => {
    setEditorTarget({ key: note.id, note });
  }, []);

  const editorNote = editorTarget?.note ?? null;
  const taskContext =
    editorNote?.source === 'task'
      ? {
          taskTitle: editorNote.taskTitle,
          taskImage: editorNote.taskImage,
          taskEmoji: editorNote.taskEmoji,
          taskColor: editorNote.taskColor,
        }
      : null;

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
            visible={Boolean(editorTarget)}
            note={editorNote}
            taskContext={taskContext}
            defaultTitle={taskContext?.taskTitle ?? ''}
            language={language}
            reduceMotion={reduceMotion}
            onClose={() => setEditorTarget(null)}
            onSave={(content) => {
              const preferences = {
                pinned: content.pinned,
                cardColor: content.cardColor,
              };
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
        </View>
      </View>
    </Modal>
  );
}
