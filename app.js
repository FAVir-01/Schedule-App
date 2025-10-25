import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as NavigationBar from 'expo-navigation-bar';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isFabMenuMounted, setIsFabMenuMounted] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;
  const fabSize = isCompact ? 52 : 60;
  const horizontalPadding = useMemo(() => Math.max(16, Math.min(32, width * 0.06)), [width]);
  const bottomBarPadding = useMemo(() => Math.max(20, horizontalPadding), [horizontalPadding]);
  const iconSize = isCompact ? 22 : 24;
  const cardSize = isCompact ? 136 : 152;
  const cardArtworkSize = isCompact ? 88 : 100;
  const cardSpacing = isCompact ? 16 : 24;
  const cardBorderRadius = isCompact ? 30 : 34;
  const cardVerticalOffset = isCompact ? 116 : 132;
  const fabHaloSize = fabSize + (isCompact ? 26 : 30);
  const lastToggleRef = useRef(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const actionsScale = useRef(new Animated.Value(0.85)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;
  const actionsTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const applyNavigationBarTheme = () => {
      void NavigationBar.setBackgroundColorAsync('#ffffff');
      void NavigationBar.setButtonStyleAsync('dark');
    };

    applyNavigationBarTheme();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        applyNavigationBarTheme();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

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
@@ -246,52 +247,52 @@ function ScheduleApp() {
        style={styles.tabButton}
        onPress={() => setActiveTab(key)}
        accessibilityRole="button"
        accessibilityLabel={`${label} tab`}
        disabled={isFabOpen}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f6fb' }} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6f6fb" />

      <View style={styles.container}>
        <View
          style={[styles.content, dynamicStyles.content]}
          importantForAccessibility={isFabOpen ? 'no-hide-descendants' : 'auto'}
        >
          <Text style={styles.heading}>Daily Routine</Text>
          <Text style={[styles.description, dynamicStyles.description]}>
            {activeTab === 'today'
              ? 'Review what you planned for today, check off completed habits, and add new tasks as needed.'
              : 'Open the calendar to plan ahead, review upcoming routines, and adjust your schedule.'}
          </Text>
        </View>

        <View
          style={[styles.bottomBarContainer, dynamicStyles.bottomBarContainer]}
          importantForAccessibility={isFabOpen ? 'no-hide-descendants' : 'auto'}
        >
          <View
            style={[
              styles.bottomBar,
              dynamicStyles.bottomBar,
              isFabOpen && styles.bottomBarDimmed,
            ]}
          >
@@ -361,121 +362,139 @@ function ScheduleApp() {
                  styles.fabCard,
                  {
                    width: cardSize,
                    height: cardSize,
                    borderRadius: cardBorderRadius,
                    marginHorizontal: cardSpacing / 2,
                    transform: [{ rotate: '-7deg' }],
                  },
                ]}
                onPress={handleAddHabit}
                accessibilityRole="button"
                accessibilityLabel="Add habit"
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#C084FC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.fabCardBackground, { borderRadius: cardBorderRadius }]}
                >
                  <View
                    pointerEvents="none"
                    style={[styles.fabCardHighlight, { borderRadius: cardBorderRadius }]}
                  />
                  <View style={styles.fabCardContent}>
                    <View
                      style={[
                        styles.fabCardArtworkWrapper,
                        styles.fabCardArtworkWrapperLeft,
                        { width: cardArtworkSize, height: cardArtworkSize },
                      ]}
                    >
                      <Image
                        source={require('./assets/add-habit.png')}
                        style={[styles.fabCardArtwork, { width: cardArtworkSize, height: cardArtworkSize }]}
                        resizeMode="contain"
                      />
                    </View>
                    <Text
                      style={[
                        styles.fabCardTitle,
                        { fontSize: isCompact ? 16 : 17 },
                      ]}
                    >
                      Add habit
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        { fontSize: isCompact ? 12 : 13 },
                      ]}
                      numberOfLines={2}
                    >
                      {`Add a new routine\nto your life`}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.fabCard,
                  {
                    width: cardSize,
                    height: cardSize,
                    borderRadius: cardBorderRadius,
                    marginHorizontal: cardSpacing / 2,
                    transform: [{ rotate: '7deg' }],
                  },
                ]}
                onPress={handleAddReflection}
                accessibilityRole="button"
                accessibilityLabel="Add reflection"
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#F59E0B', '#FDE047']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.fabCardBackground, { borderRadius: cardBorderRadius }]}
                >
                  <View
                    pointerEvents="none"
                    style={[styles.fabCardHighlight, { borderRadius: cardBorderRadius }]}
                  />
                  <View style={styles.fabCardContent}>
                    <View
                      style={[
                        styles.fabCardArtworkWrapper,
                        styles.fabCardArtworkWrapperRight,
                        { width: cardArtworkSize, height: cardArtworkSize },
                      ]}
                    >
                      <Image
                        source={require('./assets/add-reflection.png')}
                        style={[styles.fabCardArtwork, { width: cardArtworkSize, height: cardArtworkSize }]}
                        resizeMode="contain"
                      />
                    </View>
                    <Text
                      style={[
                        styles.fabCardTitle,
                        { fontSize: isCompact ? 16 : 17 },
                      ]}
                    >
                      Add reflection
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        { fontSize: isCompact ? 12 : 13 },
                      ]}
                      numberOfLines={2}
                    >
                      {`Reflect on your day\nwith your mood and feelings`}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
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
    position: 'relative',
@@ -578,63 +597,58 @@ const styles = StyleSheet.create({
  fabCard: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  fabCardBackground: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  fabCardHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth * 4,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    opacity: 0.9,
  },
  fabCardContent: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 8,
  },
  fabCardArtworkWrapper: {
    alignSelf: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    borderRadius: 48,
  },
  fabCardArtworkWrapperLeft: {
    transform: [{ rotate: '6deg' }],
  },
  fabCardArtworkWrapperRight: {
    transform: [{ rotate: '-6deg' }],
  },
  fabCardArtwork: {
    borderRadius: 52,
  },
  fabCardTitle: {
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.1,
    marginBottom: 6,
  },
  fabCardSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 4,
  },
});
