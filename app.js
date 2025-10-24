import React, { useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

function ScheduleApp() {
  const [activeTab, setActiveTab] = useState('today');
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;
  const horizontalPadding = useMemo(() => Math.max(16, Math.min(32, width * 0.06)), [width]);
  const bottomBarPadding = useMemo(() => Math.max(20, horizontalPadding), [horizontalPadding]);
  const iconSize = isCompact ? 22 : 24;

  const dynamicStyles = useMemo(
    () => ({
      content: {
        paddingHorizontal: horizontalPadding,
        paddingTop: isCompact ? 32 : 48,
      },
      description: {
        fontSize: isCompact ? 15 : 16,
        lineHeight: isCompact ? 20 : 22,
      },
      bottomBarContainer: {
        paddingHorizontal: Math.max(12, horizontalPadding / 2),
        // Quanto menor, mais a barra desce/encosta no fundo:
        paddingBottom: insets.bottom,
      },
      bottomBar: {
        paddingHorizontal: bottomBarPadding,
        paddingVertical: isCompact ? 6 : 8,
      },
      tabLabel: {
        fontSize: isCompact ? 11 : 12,
        marginTop: isCompact ? 4 : 6,
      },
      addButton: {
        width: isCompact ? 52 : 60,
        height: isCompact ? 52 : 60,
        borderRadius: isCompact ? 26 : 30,
        top: isCompact ? -20 : -24,
      },
    }),
    [bottomBarPadding, horizontalPadding, insets.bottom, isCompact]
  );

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
          size={iconSize}
          color={isActive ? styles.activeColor.color : styles.inactiveColor.color}
        />
        <Text
          style={[
            styles.tabLabel,
            dynamicStyles.tabLabel,
            isActive ? styles.activeColor : styles.inactiveColor,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      {/* Safe area do topo com fundo preto */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
      </SafeAreaView>

      {/* Conteúdo principal */}
      <SafeAreaView style={styles.container} edges={['left', 'right']}>

      <View style={[styles.content, dynamicStyles.content]}>
        <Text style={styles.heading}>Daily Routine</Text>
        <Text style={[styles.description, dynamicStyles.description]}>
          {activeTab === 'today'
            ? 'Review what you planned for today, check off completed habits, and add new tasks as needed.'
            : 'Open the calendar to plan ahead, review upcoming routines, and adjust your schedule.'}
        </Text>
      </View>

      <View style={[styles.bottomBarContainer, dynamicStyles.bottomBarContainer]}>
        <View style={[styles.bottomBar, dynamicStyles.bottomBar]}>
          {TABS.map(renderTabButton)}
        </View>

        <TouchableOpacity
          style={[styles.addButton, dynamicStyles.addButton]}
          accessibilityRole="button"
          accessibilityLabel="Add new routine"
        >
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ScheduleApp />
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ScheduleApp />
    </SafeAreaProvider>
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
    width: '100%',
    alignItems: 'stretch',
    backgroundColor: 'transparent',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingVertical: 12,
    width: '100%',
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
    alignSelf: 'center',
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

