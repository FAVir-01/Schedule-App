import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { normalizeDateValue } from '../utils/dateUtils';
import {
  getMoodMarker,
  getReflectionPhotos,
  hasPrivateReflectionContent,
  hasReflectionContent,
} from '../utils/moodUtils';
import { styles } from '../styles/appStyles';
import DiaryPrivacyMask from './DiaryPrivacyMask';
import MoodPhotoDeck from './MoodPhotoDeck';
import MoodPhotoViewer from './MoodPhotoViewer';

// Post individual: memo evita re-render dos demais posts ao rolar/atualizar.
const FeedPostCard = React.memo(({
  dateKey,
  mood,
  moodAppearance,
  language,
  t,
  onOpenDay,
  onEditReflection,
  onOpenPhoto,
  isDiaryPrivacyEnabled,
  isDiaryUnlocked,
  onRequestDiaryUnlock,
}) => {
  const marker = getMoodMarker(mood, moodAppearance);
  const photos = getReflectionPhotos(mood);
  const date = normalizeDateValue(dateKey);
  const dateLabel = date
    ? format(date, 'EEEE, d MMM', { locale: getDateLocale(language) })
    : dateKey;
  const title = mood.level ? t.reflection.levels[mood.level] : t.reflection.title;
  const isPrivateLocked =
    isDiaryPrivacyEnabled &&
    !isDiaryUnlocked &&
    hasPrivateReflectionContent(mood);

  const handleEditReflection = async () => {
    if (isPrivateLocked && !(await onRequestDiaryUnlock?.())) {
      return;
    }
    onEditReflection(dateKey);
  };

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
          onPress={handleEditReflection}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`${t.reflection.editReflection}. ${dateLabel}`}
        >
          <Ionicons name="pencil" size={18} color="#625f79" />
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
      {isPrivateLocked ? (
        <DiaryPrivacyMask
          hasText={Boolean(`${mood.note ?? ''}`.trim())}
          hasPhoto={photos.length > 0}
          label={t.diaryPrivacy.unlock}
          onUnlock={onRequestDiaryUnlock}
        />
      ) : (
        <>
          {mood.note ? <Text style={styles.feedPostNote}>{mood.note}</Text> : null}
          <MoodPhotoDeck
            photos={photos}
            onOpen={(index) => onOpenPhoto(photos, index)}
            photoStyle={styles.feedPostPhoto}
            accessibilityLabel={`${
              photos.length > 1
                ? t.reflection.openPhotos.replace('{count}', String(photos.length))
                : t.reflection.openPhoto
            }. ${dateLabel}`}
          />
        </>
      )}
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
  isDiaryPrivacyEnabled = false,
  isDiaryUnlocked = false,
  onRequestDiaryUnlock,
  bottomPadding = 60,
}) {
  const t = translations[language] ?? translations.en;
  const [openPhotos, setOpenPhotos] = useState(null);

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

  const handleOpenPhoto = useCallback((photos, index) => {
    setOpenPhotos({ photos, index });
  }, []);

  useEffect(() => {
    if (isDiaryPrivacyEnabled && !isDiaryUnlocked) {
      setOpenPhotos(null);
    }
  }, [isDiaryPrivacyEnabled, isDiaryUnlocked]);

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
          isDiaryPrivacyEnabled={isDiaryPrivacyEnabled}
          isDiaryUnlocked={isDiaryUnlocked}
          onRequestDiaryUnlock={onRequestDiaryUnlock}
        />
      );
    },
    [
      handleOpenPhoto,
      isDiaryPrivacyEnabled,
      isDiaryUnlocked,
      language,
      moodAppearance,
      onEditReflection,
      onOpenDay,
      onRequestDiaryUnlock,
      t,
    ]
  );

  if (!hasPosts) {
    return (
      <View style={styles.feedEmptyContainer}>
        <Ionicons name="journal-outline" size={44} color="#767c8f" />
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
      <MoodPhotoViewer
        visible={Boolean(openPhotos) && (!isDiaryPrivacyEnabled || isDiaryUnlocked)}
        photos={openPhotos?.photos ?? []}
        initialIndex={openPhotos?.index ?? 0}
        onClose={() => setOpenPhotos(null)}
        closeLabel={t.reflection.closePhoto}
        positionLabel={t.reflection.photoPosition}
      />
    </>
  );
}

export default ReflectionFeed;
