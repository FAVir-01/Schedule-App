import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Platform,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as NavigationBar from 'expo-navigation-bar';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');

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
  const cardSize = isCompact ? 176 : 198;
  const cardIconSize = isCompact ? 108 : 128;
  const cardSpacing = isCompact ? 20 : 28;
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
      void NavigationBar.setBackgroundColorAsync('#000000');
      void NavigationBar.setButtonStyleAsync('light');
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
        width: fabSize,
        height: fabSize,
        borderRadius: fabSize / 2,
        top: isCompact ? -20 : -24,
      },
    }),
    [bottomBarPadding, fabSize, horizontalPadding, insets.bottom, isCompact]
  );

  const openFabMenu = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 200) {
      return;
    }
    lastToggleRef.current = now;
    if (isFabOpen) {
      return;
    }
    setIsFabMenuMounted(true);
    setIsFabOpen(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isFabOpen]);

  const closeFabMenu = useCallback(() => {
    if (!isFabOpen && !isFabMenuMounted) {
      return;
    }
    const now = Date.now();
    if (now - lastToggleRef.current < 200) {
      return;
    }
    lastToggleRef.current = now;
    setIsFabOpen(false);
  }, [isFabMenuMounted, isFabOpen]);

  const handleToggleFab = useCallback(() => {
    if (isFabOpen) {
      closeFabMenu();
    } else {
      openFabMenu();
    }
  }, [closeFabMenu, isFabOpen, openFabMenu]);

  const handleAddHabit = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('Add habit action triggered');
    closeFabMenu();
  }, [closeFabMenu]);

  const handleAddReflection = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('Add reflection action triggered');
    closeFabMenu();
  }, [closeFabMenu]);

  useEffect(() => {
    if (!isFabOpen || Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFabMenu();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [closeFabMenu, isFabOpen]);

  useEffect(() => {
    if (!isFabMenuMounted) {
      overlayOpacity.setValue(0);
      actionsScale.setValue(0.85);
      actionsOpacity.setValue(0);
      actionsTranslateY.setValue(12);
      return;
    }

    if (isFabOpen) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(actionsScale, {
          toValue: 1,
          damping: 18,
          stiffness: 180,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(actionsOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(actionsTranslateY, {
          toValue: 12,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(actionsScale, {
          toValue: 0.85,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !isFabOpen) {
          setIsFabMenuMounted(false);
        }
      });
    }
  }, [actionsOpacity, actionsScale, actionsTranslateY, isFabMenuMounted, isFabOpen, overlayOpacity]);

  const renderTabButton = ({ key, label, icon }) => {
    const isActive = activeTab === key;
    return (
      <TouchableOpacity
        key={key}
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

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
            {TABS.map(renderTabButton)}
          </View>

          <TouchableOpacity
            style={[styles.addButton, dynamicStyles.addButton]}
            onPress={handleToggleFab}
            accessibilityRole="button"
            accessibilityLabel={isFabOpen ? 'Close add menu' : 'Open add menu'}
            activeOpacity={0.85}
          >
            {isFabOpen && (
              <View
                pointerEvents="none"
                style={[
                  styles.addButtonHalo,
                  {
                    width: fabHaloSize,
                    height: fabHaloSize,
                    borderRadius: fabHaloSize / 2,
                    top: (fabSize - fabHaloSize) / 2,
                    left: (fabSize - fabHaloSize) / 2,
                  },
                ]}
              />
            )}
            <Ionicons name={isFabOpen ? 'close' : 'add'} size={32} color="#fff" />
          </TouchableOpacity>
        </View>

        {isFabMenuMounted && (
          <AnimatedPressable
            style={[styles.overlay, { opacity: overlayOpacity }]}
            onPress={closeFabMenu}
            accessibilityRole="button"
            accessibilityLabel="Close add menu"
            pointerEvents="auto"
            accessibilityHint="Tap to dismiss the add options"
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={60} tint="dark" style={styles.overlayBlur} />
            )}
          </AnimatedPressable>
        )}

        {isFabMenuMounted && (
          <Animated.View
            pointerEvents={isFabOpen ? 'auto' : 'none'}
            style={[
              styles.fabActionsContainer,
              {
                bottom: insets.bottom + fabSize / 2 + cardVerticalOffset,
                opacity: actionsOpacity,
                transform: [
                  { scale: actionsScale },
                  { translateY: actionsTranslateY },
                ],
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.fabActionsRow}>
              <TouchableOpacity
                style={[
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
                    <View style={[styles.fabCardIconWrapper, styles.fabCardIconWrapperLeft]}>
                      <View style={[styles.fabCardIconHalo, { borderRadius: cardIconSize }]} />
                      <Image
                        source={habitImage}
                        style={[styles.fabCardIcon, { width: cardIconSize + 8, height: cardIconSize + 8 }]}
                        resizeMode="contain"
                        accessible
                        accessibilityLabel="Illustration of adding a habit"
                      />
                    </View>
                    <Text
                      style={[
                        styles.fabCardTitle,
                        { fontSize: isCompact ? 14 : 15 },
                      ]}
                    >
                      Add habit
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        { fontSize: isCompact ? 11 : 12 },
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
                    <View style={[styles.fabCardIconWrapper, styles.fabCardIconWrapperRight]}>
                      <View style={[styles.fabCardIconHalo, { borderRadius: cardIconSize }]} />
                      <Image
                        source={reflectionImage}
                        style={[styles.fabCardIcon, { width: cardIconSize + 8, height: cardIconSize + 8 }]}
                        resizeMode="contain"
                        accessible
                        accessibilityLabel="Illustration of adding a reflection"
                      />
                    </View>
                    <Text
                      style={[
                        styles.fabCardTitle,
                        { fontSize: isCompact ? 14 : 15 },
                      ]}
                    >
                      Add reflection
                    </Text>
                    <Text
                      style={[
                        styles.fabCardSubtitle,
                        { fontSize: isCompact ? 11 : 12 },
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
  bottomBarDimmed: {
    opacity: 0.4,
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
    zIndex: 12,
    overflow: 'visible',
  },
  addButtonHalo: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 46, 0.28)',
    zIndex: 10,
    overflow: 'hidden',
  },
  overlayBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  fabActionsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  fabActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
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
    paddingHorizontal: 24,
    paddingVertical: 28,
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
    paddingTop: 4,
  },
  fabCardIconWrapper: {
    alignSelf: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    position: 'relative',
  },
  fabCardIconWrapperLeft: {
    transform: [{ rotate: '6deg' }],
  },
  fabCardIconWrapperRight: {
    transform: [{ rotate: '-6deg' }],
  },
  fabCardIconHalo: {
    position: 'absolute',
    top: -16,
    left: -16,
    right: -16,
    bottom: -16,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
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
  fabCardIcon: {
    width: 120,
    height: 120,
  },
});
