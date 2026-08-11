import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getDateLocale, translations } from '../constants/i18n';
import { FALLBACK_EMOJI } from '../constants/app';
import { normalizeDateValue } from '../utils/dateUtils';
import { getTaskTagDisplayLabel } from '../utils/taskUtils';
import { lightenColor } from '../utils/colorUtils';
import { triggerSelection } from '../utils/feedbackUtils';
import { styles } from '../styles/appStyles';

// Card da lista "Suas tarefas": sem gestos escondidos — toque abre o detalhe,
// long-press entra no modo de seleção (checkbox só aparece nesse modo).
function ProfileTaskRow({
  task,
  metaText,
  streak = 0,
  isArchivedView = false,
  onPress,
  onToggleSelect,
  isSelected,
  selectionMode,
  language = 'en',
}) {
  const t = translations[language] ?? translations.en;
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [task.customImage]);

  const tagLabel = getTaskTagDisplayLabel(task, t.taskDisplay.tags);
  const iconBackground = lightenColor(task.color, 0.9);

  const handlePress = () => {
    if (selectionMode) {
      onToggleSelect?.(task.id);
      return;
    }
    onPress?.(task.id);
  };

  const handleLongPress = () => {
    triggerSelection();
    onToggleSelect?.(task.id);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.profileTaskRow,
        isSelected && styles.profileTaskRowSelected,
        pressed && { opacity: 0.85 },
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      accessibilityState={{ selected: Boolean(isSelected) }}
    >
      <View
        style={[
          styles.profileTaskIcon,
          { backgroundColor: iconBackground },
          isArchivedView && { opacity: 0.6 },
        ]}
      >
        {task.customImage && !hasImageError ? (
          <Image
            source={{ uri: task.customImage }}
            style={styles.profileTaskEmojiImage}
            onError={() => setHasImageError(true)}
          />
        ) : (
          <Text style={styles.profileTaskEmoji}>{task.emoji || FALLBACK_EMOJI}</Text>
        )}
      </View>
      <View style={styles.profileTaskDetails}>
        <View style={styles.profileTaskTitleRow}>
          <Text
            style={[
              styles.profileTaskTitle,
              isArchivedView && styles.profileTaskTitleArchived,
            ]}
            numberOfLines={1}
          >
            {task.title}
          </Text>
          {task.profileLocked ? (
            <Ionicons
              name="lock-closed"
              size={13}
              color="#9aa3b2"
              style={styles.profileTaskLockIcon}
            />
          ) : null}
        </View>
        <View style={styles.profileTaskMetaRow}>
          {metaText ? (
            <Text style={styles.profileTaskMetaText} numberOfLines={1}>
              {metaText}
            </Text>
          ) : null}
          {tagLabel ? (
            <View style={styles.profileTaskTag}>
              <Text style={styles.profileTaskTagText}>{tagLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {selectionMode ? (
        <View
          style={[
            styles.profileTaskSelectCircle,
            isSelected && styles.profileTaskSelectCircleActive,
          ]}
        >
          {isSelected ? <Ionicons name="checkmark" size={15} color="#ffffff" /> : null}
        </View>
      ) : streak > 0 ? (
        <View
          style={styles.profileTaskStreakBadge}
          accessibilityLabel={t.profileTasks.streakAccessibility.replace(
            '{count}',
            String(streak)
          )}
        >
          <Ionicons name="flame" size={13} color="#b63d00" />
          <Text style={styles.profileTaskStreakText}>{streak}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default React.memo(ProfileTaskRow);

export const formatTaskRowDate = (value, language) => {
  const date = normalizeDateValue(value);
  if (!date) {
    return null;
  }
  return format(date, 'd MMM yyyy', { locale: getDateLocale(language) });
};
