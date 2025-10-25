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
  const cardSize = isCompact ? 136 : 152;
  function ScheduleApp() {
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
const styles = StyleSheet.create({
  },
  fabCardIconWrapperRight: {
    transform: [{ rotate: '-6deg' }],
  },
  fabCardIconHalo: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
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
    width: 64,
    height: 64,
  },
});
