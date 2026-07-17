import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function UndoSnackbar({ message, actionLabel, onAction, bottom = 24 }) {
  if (!message) {
    return null;
  }

  return (
    <View style={[styles.container, { bottom }]}>
      <Text style={styles.message} numberOfLines={2} accessibilityLiveRegion="polite">
        {message}
      </Text>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        hitSlop={8}
        style={styles.action}
      >
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 60,
    elevation: 12,
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#25233a',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  message: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  action: {
    marginLeft: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  actionText: {
    color: '#b9adff',
    fontSize: 14,
    fontWeight: '800',
  },
});
