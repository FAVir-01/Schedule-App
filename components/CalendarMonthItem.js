import React from 'react';
import { ImageBackground, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getMonthImageSource } from '../constants/months';
import { getDateLocale } from '../constants/i18n';
import { getDateKey } from '../utils/dateUtils';
import { CALENDAR_DAY_SIZE } from '../constants/layout';
import { styles } from '../styles/appStyles';

// --- CÉLULA DO DIA ATUALIZADA (COM DESTAQUE PARA HOJE) ---
const CalendarDayCell = React.memo(({ date, isCurrentMonth, status, onPress, isToday }) => {
  if (!isCurrentMonth) {
    return <View style={{ width: CALENDAR_DAY_SIZE, height: CALENDAR_DAY_SIZE }} />;
  }

  const isSuccess = status === 'success';

  return (
    <Pressable
      onPress={() => onPress(date)}
      style={({ pressed }) => [
        styles.calendarDayCellWrapper,
        pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
      ]}
    >
      {isSuccess ? (
        <View style={styles.calendarSuccessCircle}>
          <Ionicons name="checkmark" size={20} color="white" />
        </View>
      ) : isToday ? (
        <View style={styles.calendarTodayCircle}>
          <Text style={styles.calendarTodayText}>{date.getDate()}</Text>
        </View>
      ) : (
        <Text style={styles.calendarDayText}>{date.getDate()}</Text>
      )}
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
}) => {
  const imageSource = getMonthImageSource(item.monthIndex, customImages);

  return (
    <View style={styles.calendarMonthContainer}>
      <ImageBackground
        source={imageSource}
        style={styles.calendarMonthHeader}
        imageStyle={{ resizeMode: 'cover' }}
        resizeMethod="resize"
      >
        {/* Overlay removido aqui */}
        <Text style={styles.calendarMonthTitle}>{format(item.date, 'MMMM yyyy', { locale: getDateLocale(language) })}</Text>
      </ImageBackground>

      <View style={styles.calendarDaysGrid}>
        {item.days.map((day) => {
          const dayKey = getDateKey(day);
          return (
            <CalendarDayCell
              key={dayKey}
              date={day}
              isCurrentMonth={day.getMonth() === item.date.getMonth()}
              status={dayStatusByKey[dayKey] ?? 'pending'}
              onPress={onDayPress}
              isToday={dayKey === todayKey}
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

  const monthIndex = nextProps.item.monthIndex;
  return prevProps.customImages?.[monthIndex] === nextProps.customImages?.[monthIndex];
});

export default CalendarMonthItem;
