import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { normalizeDateValue } from '../utils/dateUtils';
import { DEFAULT_MOOD_EMOJIS } from '../utils/moodUtils';
import {
  buildSearchableTimelineItems,
  TIMELINE_PAGE_SIZE,
} from '../utils/timelineUtils';
import { styles } from '../styles/appStyles';

const ENTRY_ICONS = {
  task_created: { name: 'add-circle-outline', color: '#3dd598' },
  task_updated: { name: 'create-outline', color: '#3c2ba7' },
  task_deleted: { name: 'trash-outline', color: '#e0574f' },
  task_completed: { name: 'checkmark-circle', color: '#3dd598' },
  task_uncompleted: { name: 'ellipse-outline', color: '#9aa5b5' },
  subtask_completed: { name: 'checkbox-outline', color: '#3dd598' },
  subtask_uncompleted: { name: 'square-outline', color: '#9aa5b5' },
  reflection: { name: 'journal-outline', color: '#8f63d8' },
};

const FILTER_DEFAULTS = {
  scope: 'all',
  period: 'all',
  mood: 'all',
  requireNote: false,
  requirePhoto: false,
};

const FilterPill = ({ active, label, onPress, accessibilityLabel }) => (
  <Pressable
    style={[
      styles.profileTasksFilterPill,
      active && styles.profileTasksFilterPillActive,
    ]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    accessibilityLabel={accessibilityLabel ?? label}
  >
    <Text
      style={[
        styles.profileTasksFilterText,
        active && styles.profileTasksFilterTextActive,
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

export default function ActivityTimelineModal({
  visible,
  history,
  dayMoods,
  tasks,
  onClose,
  onSelectReflection,
  language = 'en',
}) {
  const rootT = translations[language] ?? translations.en;
  const t = rootT.activity;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(TIMELINE_PAGE_SIZE);
  }, [query, filters]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setFilters(FILTER_DEFAULTS);
      setVisibleCount(TIMELINE_PAGE_SIZE);
    }
  }, [visible]);

  const items = useMemo(
    () =>
      buildSearchableTimelineItems({
        history,
        dayMoods,
        tasks,
        query,
        ...filters,
        activityLabels: t,
        reflectionLabel: t.reflection,
        tagLabels: rootT.reflection.tags,
      }),
    [dayMoods, filters, history, query, rootT.reflection.tags, t, tasks]
  );

  const rows = useMemo(() => {
    const locale = language === 'pt' ? 'pt-BR' : 'en-US';
    const today = new Date();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-');
    const nextRows = [];
    let currentDayKey = null;

    items.slice(0, visibleCount).forEach((item) => {
      const date = normalizeDateValue(item.dateKey) ?? new Date(item.timestamp);
      const dayKey = item.dateKey;
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
                  year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
                });
        nextRows.push({ id: `header-${dayKey}`, kind: 'header', label: header });
      }
      nextRows.push(item);
    });
    return nextRows;
  }, [items, language, t.today, t.yesterday, visibleCount]);

  if (!visible) {
    return null;
  }

  const hasActiveFilters =
    query.trim() || Object.entries(filters).some(([key, value]) => value !== FILTER_DEFAULTS[key]);

  const updateFilter = (key, value) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  };

  const renderTimelineItem = ({ item }) => {
    if (item.kind === 'header') {
      return <Text style={styles.activityDayHeader}>{item.label}</Text>;
    }

    const icon = ENTRY_ICONS[item.kind];
    const isReflection = item.source === 'reflection';
    const title = isReflection
      ? item.note || t.reflection
      : (t[item.kind] ?? '{title}').replace(
          '{title}',
          item.title || t.unknownTask
        );
    const tagLine = isReflection
      ? item.tags.map((tag) => rootT.reflection.tags[tag] ?? tag).join(' · ')
      : '';
    const content = (
      <>
        <Ionicons
          name={icon.name}
          size={18}
          color={icon.color}
          style={styles.activityRowIcon}
        />
        <View style={styles.activityRowContent}>
          <Text style={styles.activityRowLabel} numberOfLines={isReflection ? 3 : 2}>
            {title}
          </Text>
          {tagLine ? (
            <Text style={styles.activityRowMeta} numberOfLines={1}>
              {tagLine}
            </Text>
          ) : null}
        </View>
        {isReflection ? (
          <View style={styles.activityReflectionMeta}>
            {item.level ? (
              <Text style={styles.activityMoodEmoji}>
                {DEFAULT_MOOD_EMOJIS[item.level]}
              </Text>
            ) : null}
            {item.hasPhoto ? (
              <Ionicons name="image-outline" size={15} color="#8f98a8" />
            ) : null}
            <Ionicons name="chevron-forward" size={16} color="#b0b7c4" />
          </View>
        ) : (
          <Text style={styles.activityRowTime}>
            {new Date(item.timestamp).toLocaleTimeString(
              language === 'pt' ? 'pt-BR' : 'en-US',
              { hour: '2-digit', minute: '2-digit', hour12: language !== 'pt' }
            )}
          </Text>
        )}
      </>
    );

    return isReflection ? (
      <Pressable
        style={styles.activityRow}
        onPress={() => onSelectReflection?.(item.dateKey)}
        accessibilityRole="button"
        accessibilityLabel={t.openReflection.replace('{date}', item.dateKey)}
      >
        {content}
      </Pressable>
    ) : (
      <View style={styles.activityRow}>{content}</View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.profileTasksContainer}>
        <View style={styles.profileTasksHeader}>
          <View style={styles.activityHeaderText}>
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

        <View style={styles.activitySearchArea}>
          <View style={styles.profileTasksSearchRow}>
            <Ionicons name="search" size={18} color="#77808f" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t.searchPlaceholder}
              placeholderTextColor="#9aa5b5"
              style={styles.profileTasksSearchInput}
              returnKeyType="search"
              autoCapitalize="none"
              accessibilityLabel={t.searchAccessibility}
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel={t.clearSearch}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color="#9aa5b5" />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksFilterRow}
          >
            {['all', 'reflection', 'activity'].map((scope) => (
              <FilterPill
                key={scope}
                active={filters.scope === scope}
                label={t.scopes[scope]}
                onPress={() => updateFilter('scope', scope)}
              />
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksFilterRow}
          >
            {['all', '7', '30', 'year'].map((period) => (
              <FilterPill
                key={period}
                active={filters.period === period}
                label={t.periods[period]}
                onPress={() => updateFilter('period', period)}
              />
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.profileTasksFilterRow}
          >
            <FilterPill
              active={filters.mood === 'all'}
              label={t.anyMood}
              onPress={() => updateFilter('mood', 'all')}
            />
            <FilterPill
              active={filters.mood === 'positive'}
              label={t.goodDays}
              onPress={() => updateFilter('mood', 'positive')}
            />
            {[1, 2, 3, 4, 5].map((level) => (
              <FilterPill
                key={level}
                active={filters.mood === String(level)}
                label={DEFAULT_MOOD_EMOJIS[level]}
                accessibilityLabel={rootT.reflection.levels[level]}
                onPress={() => updateFilter('mood', String(level))}
              />
            ))}
            <FilterPill
              active={filters.requireNote}
              label={t.withNote}
              onPress={() => updateFilter('requireNote', !filters.requireNote)}
            />
            <FilterPill
              active={filters.requirePhoto}
              label={t.withPhoto}
              onPress={() => updateFilter('requirePhoto', !filters.requirePhoto)}
            />
          </ScrollView>
        </View>

        <View style={styles.activityResultsRow}>
          <Text style={styles.activityResultsText}>
            {t.results.replace('{count}', String(items.length))}
          </Text>
          {hasActiveFilters ? (
            <Pressable
              onPress={() => {
                setQuery('');
                setFilters(FILTER_DEFAULTS);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.activityClearFilters}>{t.clearFilters}</Text>
            </Pressable>
          ) : null}
        </View>

        {rows.length === 0 ? (
          <View style={styles.profileTasksEmpty}>
            <Text style={styles.profileTasksEmptyText}>
              {hasActiveFilters ? t.noResults : t.empty}
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={renderTimelineItem}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.profileTasksList}
            ListFooterComponent={
              visibleCount < items.length ? (
                <Pressable
                  style={styles.activityShowMore}
                  onPress={() => setVisibleCount((count) => count + TIMELINE_PAGE_SIZE)}
                  accessibilityRole="button"
                >
                  <Text style={styles.activityShowMoreText}>{t.showMore}</Text>
                </Pressable>
              ) : null
            }
          />
        )}
      </View>
    </Modal>
  );
}
