import React from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { getMonthImageSource } from '../constants/months';
import { getDateLocale, getWeekdayInitials, translations } from '../constants/i18n';
import { getDateKey } from '../utils/dateUtils';
import { getMoodMarker } from '../utils/moodUtils';
import { CALENDAR_DAY_SIZE } from '../constants/layout';
import { styles } from '../styles/appStyles';

// --- CÉLULA DO DIA ATUALIZADA (COM DESTAQUE PARA HOJE E HUMOR) ---
const CalendarDayCell = React.memo(({
  date,
  isCurrentMonth,
  status,
  onPress,
  isToday,
  isPast,
  moodEmoji,
  moodImage,
  language,
  labels,
}) => {
  if (!isCurrentMonth) {
    return <View style={{ width: CALENDAR_DAY_SIZE, height: CALENDAR_DAY_SIZE }} />;
  }

  const isSuccess = status === 'success';
  const dateLabel = date.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const accessibilityLabel = [
    dateLabel,
    isToday ? labels.today : null,
    isSuccess ? labels.completed : null,
    moodImage || moodEmoji ? labels.moodRecorded : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={labels.openDayReport}
      style={({ pressed }) => [
        styles.calendarDayCellWrapper,
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
      ]}
    >
      {isSuccess && isToday ? (
        <View style={styles.calendarTodayRing}>
          <View style={styles.calendarSuccessCircle}>
            <Ionicons name="checkmark" size={18} color="#1f9d6d" />
          </View>
        </View>
      ) : isSuccess ? (
        <View style={styles.calendarSuccessCircle}>
          <Ionicons name="checkmark" size={18} color="#1f9d6d" />
        </View>
      ) : isToday ? (
        <View style={styles.calendarTodayCircle}>
          <Text style={styles.calendarTodayText}>{date.getDate()}</Text>
        </View>
      ) : (
        <Text style={[styles.calendarDayText, isPast && styles.calendarDayTextPast]}>
          {date.getDate()}
        </Text>
      )}
      {moodImage || moodEmoji ? (
        <View style={styles.calendarMoodBadge} pointerEvents="none">
          {moodImage ? (
            <Image source={{ uri: moodImage }} style={styles.calendarMoodBadgeImage} />
          ) : (
            <Text style={styles.calendarMoodBadgeText}>{moodEmoji}</Text>
          )}
        </View>
      ) : null}
    </Pressable>
  );
});

// --- ITEM DO MÊS ATUALIZADO ---
const CalendarMonthItem = React.memo(({
  item,
  dayStatusByKey,
  monthStatusSignature,
  onDayPress,
  customImages,
  language,
  todayKey,
  dayMoods,
  moodAppearance,
  monthMoodSignature,
}) => {
  const imageSource = getMonthImageSource(item.monthIndex, customImages);
  const labels = (translations[language] ?? translations.en).calendar;
  const weekdayInitials = getWeekdayInitials(language);

  return (
    <View style={styles.calendarMonthContainer}>
      <ImageBackground
        source={imageSource}
        style={styles.calendarMonthHeader}
        imageStyle={{ resizeMode: 'cover' }}
        resizeMethod="resize"
      >
        {/* Gradiente no rodapé garante contraste do título sobre qualquer foto */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text style={styles.calendarMonthYear}>{format(item.date, 'yyyy')}</Text>
        <Text style={styles.calendarMonthTitle} accessibilityRole="header">
          {format(item.date, 'MMMM', { locale: getDateLocale(language) })}
        </Text>
      </ImageBackground>

      <View style={styles.calendarWeekdayRow}>
        {weekdayInitials.map((initial, index) => (
          <Text
            key={`${index}-${initial}`}
            style={[
              styles.calendarWeekdayText,
              (index === 0 || index === 6) && styles.calendarWeekdayTextWeekend,
            ]}
          >
            {initial}
          </Text>
        ))}
      </View>

      <View style={styles.calendarDaysGrid}>
        {item.days.map((day) => {
          const dayKey = getDateKey(day);
          const marker = getMoodMarker(dayMoods?.[dayKey], moodAppearance);
          return (
            <CalendarDayCell
              key={dayKey}
              date={day}
              isCurrentMonth={day.getMonth() === item.date.getMonth()}
              status={dayStatusByKey[dayKey] ?? 'pending'}
              onPress={onDayPress}
              isToday={dayKey === todayKey}
              isPast={dayKey < todayKey}
              moodEmoji={marker?.emoji ?? null}
              moodImage={marker?.image ?? null}
              language={language}
              labels={labels}
            />
          );
        })}
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  const prevMonthDate = prevProps.item.date;
  const nextMonthDate = nextProps.item.date;

  if (prevMonthDate.getTime() !== nextMonthDate.getTime()) {
    return false;
  }

  if (prevProps.language !== nextProps.language || prevProps.todayKey !== nextProps.todayKey) {
    return false;
  }

  if (prevProps.onDayPress !== nextProps.onDayPress) {
    return false;
  }

  if (prevProps.monthStatusSignature !== nextProps.monthStatusSignature) {
    return false;
  }

  if (prevProps.monthMoodSignature !== nextProps.monthMoodSignature) {
    return false;
  }

  const monthIndex = nextProps.item.monthIndex;
  return prevProps.customImages?.[monthIndex] === nextProps.customImages?.[monthIndex];
});

export default CalendarMonthItem;
