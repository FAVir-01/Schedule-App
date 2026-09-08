// Aba Discover: os atalhos nascem um por vez, conforme forem definidos.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { translations } from '../constants/i18n';

export default function DiscoverScreen({ language = 'en', onOpenNotes, onOpenMetrics }) {
  const t = (translations[language] ?? translations.en).discover;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={onOpenNotes}
          accessibilityRole="button"
          accessibilityLabel={t.notesCard}
        >
          <View style={styles.icon}>
            <Ionicons name="document-text-outline" size={20} color="#3c2ba7" />
          </View>
          <Text style={styles.cardTitle}>{t.notesCard}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={onOpenMetrics}
          accessibilityRole="button"
          accessibilityLabel={t.metricsCard}
        >
          <View style={styles.icon}>
            <Ionicons name="stats-chart-outline" size={20} color="#3c2ba7" />
          </View>
          <Text style={styles.cardTitle}>{t.metricsCard}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: 12,
    alignItems: 'flex-start',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  card: {
    width: 148,
    minHeight: 96,
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e3e5ee',
    backgroundColor: '#ffffff',
    shadowColor: '#1a1a2e',
    shadowOpacity: 0.07,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.75,
  },
  icon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#ebe8ff',
  },
  cardTitle: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
  },
});
