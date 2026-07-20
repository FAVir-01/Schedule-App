import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { normalizeDateValue } from '../utils/dateUtils';
import { getMoodMarker, hasReflectionContent } from '../utils/moodUtils';
import { styles } from '../styles/appStyles';

// Post individual: memo evita re-render dos demais posts ao rolar/atualizar.
const FeedPostCard = React.memo(({ dateKey, mood, moodAppearance, language, t, onOpenDay, onEditReflection, onOpenPhoto }) => {
  const marker = getMoodMarker(mood, moodAppearance);
  const date = normalizeDateValue(dateKey);
  const dateLabel = date
    ? format(date, 'EEEE, d MMM', { locale: getDateLocale(language) })
    : dateKey;
  const title = mood.level ? t.reflection.levels[mood.level] : t.reflection.title;

  return (
    <Pressable
      style={({ pressed }) => [styles.feedPostCard, pressed && { opacity: 0.85 }]}
      onPress={() => onOpenDay(dateKey)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${dateLabel}`}
      accessibilityHint={t.calendar.openDayReport}
    >
      <View style={styles.feedPostHeader}>
        <View style={styles.feedPostAvatar}>
          {marker?.image ? (
            <Image source={{ uri: marker.image }} style={styles.feedPostAvatarImage} />
          ) : (
            <Text style={styles.feedPostEmoji}>{marker?.emoji || '📝'}</Text>
          )}
        </View>
        <View style={styles.feedPostTextWrapper}>
          <Text style={styles.feedPostTitle}>{title}</Text>
          <Text style={styles.feedPostDate}>{dateLabel}</Text>
        </View>
        <Pressable
          onPress={() => onEditReflection(dateKey)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`${t.reflection.editReflection}. ${dateLabel}`}
        >
          <Ionicons name="pencil" size={18} color="#8a86a8" />
        </Pressable>
      </View>
      {mood.tags?.length ? (
        <View style={styles.feedTagsRow}>
          {mood.tags.map((tag) => (
            <View key={tag} style={styles.feedTagChip}>
              <Text style={styles.feedTagChipText}>{t.reflection.tags[tag] ?? tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {mood.note ? <Text style={styles.feedPostNote}>{mood.note}</Text> : null}
      {mood.photo ? (
        <Pressable
          onPress={() => onOpenPhoto(mood.photo)}
          accessibilityRole="button"
          accessibilityLabel={`${t.reflection.openPhoto}. ${dateLabel}`}
        >
          <Image
            source={{ uri: mood.photo }}
            style={styles.feedPostPhoto}
            accessible={false}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
});

function ReflectionFeed({
  dayMoods,
  moodAppearance,
  language,
  todayKey,
  onOpenDay,
  onEditReflection,
  bottomPadding = 60,
}) {
  const t = translations[language] ?? translations.en;
  const [openPhoto, setOpenPhoto] = useState(null);

  // Posts em ordem cronológica inversa, com um cabeçalho por mês ("JULHO 2026").
  const feedItems = useMemo(() => {
    const posts = Object.entries(dayMoods ?? {})
      .filter(([, mood]) => hasReflectionContent(mood))
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([dateKey, mood]) => ({ type: 'post', dateKey, mood }));

    const items = [];
    let lastMonthKey = null;
    posts.forEach((post) => {
      const monthKey = post.dateKey.slice(0, 7);
      if (monthKey !== lastMonthKey) {
        const monthDate = normalizeDateValue(`${monthKey}-01`);
        items.push({
          type: 'header',
          dateKey: `header-${monthKey}`,
          label: monthDate
            ? format(monthDate, 'MMMM yyyy', { locale: getDateLocale(language) })
            : monthKey,
        });
        lastMonthKey = monthKey;
      }
      items.push(post);
    });
    return items;
  }, [dayMoods, language]);
  const hasPosts = feedItems.length > 0;

  const handleOpenPhoto = useCallback((photo) => {
    setOpenPhoto(photo);
  }, []);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.type === 'header') {
        return <Text style={styles.feedMonthHeader}>{item.label}</Text>;
      }
      return (
        <FeedPostCard
          dateKey={item.dateKey}
          mood={item.mood}
          moodAppearance={moodAppearance}
          language={language}
          t={t}
          onOpenDay={onOpenDay}
          onEditReflection={onEditReflection}
          onOpenPhoto={handleOpenPhoto}
        />
      );
    },
    [handleOpenPhoto, language, moodAppearance, onEditReflection, onOpenDay, t]
  );

  if (!hasPosts) {
    return (
      <View style={styles.feedEmptyContainer}>
        <Ionicons name="journal-outline" size={44} color="#c5cadb" />
        <Text style={styles.feedEmptyTitle}>{t.calendar.feedEmptyTitle}</Text>
        <Text style={styles.feedEmptyText}>{t.calendar.feedEmptyText}</Text>
        <Pressable
          style={styles.feedEmptyButton}
          onPress={() => onEditReflection(todayKey)}
          accessibilityRole="button"
        >
          <Text style={styles.feedEmptyButtonText}>{t.calendar.feedAddToday}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={feedItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.dateKey}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomPadding }}
      />
      <Modal
        visible={Boolean(openPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenPhoto(null)}
      >
        <Pressable
          style={styles.reportPhotoViewerOverlay}
          onPress={() => setOpenPhoto(null)}
          accessibilityRole="button"
          accessibilityLabel={t.reflection.closePhoto}
        >
          <Image
            source={{ uri: openPhoto }}
            style={styles.reportPhotoViewerImage}
            resizeMode="contain"
            accessible={false}
          />
        </Pressable>
      </Modal>
    </>
  );
}

export default ReflectionFeed;
