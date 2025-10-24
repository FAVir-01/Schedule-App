import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TABS = [
  {
    key: 'today',
    label: 'Today',
    icon: 'time-outline',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    icon: 'calendar-clear-outline',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('today');

  const renderTabButton = ({ key, label, icon }) => {
    const isActive = activeTab === key;
    return (
      <TouchableOpacity
        key={key}
        style={styles.tabButton}
        onPress={() => setActiveTab(key)}
        accessibilityRole="button"
        accessibilityLabel={`${label} tab`}
      >
        <Ionicons
          name={icon}
          size={24}
          color={isActive ? styles.activeColor.color : styles.inactiveColor.color}
        />
        <Text style={[styles.tabLabel, isActive ? styles.activeColor : styles.inactiveColor]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        <Text style={styles.heading}>Daily Routine</Text>
        <Text style={styles.description}>
          {activeTab === 'today'
            ? 'Review what you planned for today, check off completed habits, and add new tasks as needed.'
            : 'Open the calendar to plan ahead, review upcoming routines, and adjust your schedule.'}
        </Text>
      </View>

      <View style={styles.bottomBarContainer}>
        <View style={styles.bottomBar}>
          {TABS.map(renderTabButton)}
        </View>

        <TouchableOpacity style={styles.addButton} accessibilityRole="button" accessibilityLabel="Add new routine">
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6fb',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    color: '#4b4b63',
  },
  bottomBarContainer: {
    alignItems: 'center',
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabel: {
    marginTop: 6,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  activeColor: {
    color: '#3c2ba7',
  },
  inactiveColor: {
    color: '#9ba0b0',
  },
  addButton: {
    position: 'absolute',
    top: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3c2ba7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
});

