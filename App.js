import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  Platform,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
  View,
  useWindowDimensions,
  ImageBackground,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system'; // Legacy import compatible with SDK 54 for this use case

import {
  addMonths as addMonthsDateFns,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getWeeksInMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  loadHistory,
  loadTasks,
  loadUserSettings,
  saveHistory,
  saveTasks,
  saveUserSettings,
  loadCustomImages,
  saveCustomImages
} from './storage';
import AddHabitSheet from './components/AddHabitSheet';

// --- IMAGENS PADRÃO ---
const DEFAULT_MONTH_IMAGES = [
  require('./assets/months/jan.gif'),
  require('./assets/months/feb.gif'),
  require('./assets/months/mar.gif'),
  require('./assets/months/apr.gif'),
  require('./assets/months/may.gif'),
  require('./assets/months/jun.gif'),
  require('./assets/months/jul.gif'),
  require('./assets/months/aug.gif'),
  require('./assets/months/sep.gif'),
  require('./assets/months/oct.gif'),
  require('./assets/months/nov.gif'),
  require('./assets/months/dec.gif'),
];

const MONTH_NAMES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

// Função auxiliar para resolver a imagem (Customizada vs Padrão)
const getMonthImageSource = (monthIndex, customImagesMap) => {
  const index = monthIndex % 12;
  if (customImagesMap && customImagesMap[index]) {
    return { uri: customImagesMap[index] };
  }
  return DEFAULT_MONTH_IMAGES[index];
};

// --- COMPONENTE DA FAIXA DO TOPO ---
const StickyMonthHeader = ({ date, customImages }) => {
  if (!date) return null;

  const monthIndex = date.getMonth();
  const imageSource = getMonthImageSource(monthIndex, customImages);

  return (
    <ImageBackground
      source={imageSource}
      style={styles.stickyHeader}
      imageStyle={{ resizeMode: 'cover' }}
    >
      <View style={styles.headerOverlay} />
      <Text style={styles.stickyHeaderText}>
        {format(date, 'MMMM', { locale: ptBR })}
      </Text>
    </ImageBackground>
  );
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const habitImage = require('./assets/add-habit.png');
const reflectionImage = require('./assets/add-reflection.png');
const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

const triggerImpact = (style) => {
  if (!HAPTICS_SUPPORTED) return;
  try { void Haptics.impactAsync(style); } catch (error) {}
};

const triggerSelection = () => {
  if (!HAPTICS_SUPPORTED) return;
  try { void Haptics.selectionAsync(); } catch (error) {}
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CALENDAR_DAY_SIZE = Math.floor(SCREEN_WIDTH / 7);

// --- CÉLULA DO DIA ---
const CalendarDayCell = ({ date, isCurrentMonth, status, onPress, isToday }) => {
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
          <Text style={styles.calendarTodayText}>{format(date, 'd')}</Text>
        </View>
      ) : (
        <Text style={styles.calendarDayText}>{format(date, 'd')}</Text>
      )}
    </Pressable>
  );
};

// --- ITEM DO MÊS ---
const CalendarMonthItem = ({ item, getDayStatus, onDayPress, customImages }) => {
  const monthStart = startOfMonth(item.date);
  const monthEnd = endOfMonth(item.date);
  const imageSource = getMonthImageSource(item.date.getMonth(), customImages);

  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });

  const checkIsToday = (date) => {
    const now = new Date();
    return (
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  };

  return (
    <View style={styles.calendarMonthContainer}>
      <ImageBackground
        source={imageSource}
        style={styles.calendarMonthHeader}
        imageStyle={{ resizeMode: 'cover' }}
      >
        <View style={styles.headerOverlay} />
        <Text style={styles.calendarMonthTitle}>{format(item.date, 'MMMM yyyy', { locale: ptBR })}</Text>
      </ImageBackground>

      <View style={styles.calendarDaysGrid}>
        {days.map((day) => (
          <CalendarDayCell
            key={day.toISOString()}
            date={day}
            isCurrentMonth={day.getMonth() === item.date.getMonth()}
            status={getDayStatus ? getDayStatus(day) : 'pending'}
            onPress={onDayPress}
            isToday={checkIsToday(day)}
          />
        ))}
      </View>
    </View>
  );
};

const LEFT_TABS = [
  { key: 'today', label: 'Today', icon: 'time-outline' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar-clear-outline' },
];

const RIGHT_TABS = [
  { key: 'discover', label: 'Discover', icon: 'compass-outline' },
  { key: 'profile', label: 'Profile', icon: 'person-outline' },
];

const DEFAULT_USER_SETTINGS = {
  activeTab: 'today',
  selectedTagFilter: 'all',
};

const getDateKey = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthStart = (date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  normalized.setDate(1);
  return normalized;
};

const getMonthId = (date) => {
  const normalized = getMonthStart(date);
  return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}`;
};

const lightenColor = (hex, amount = 0.7) => {
  // Simple mockup function for lightening color
  return hex;
};

const formatTimeValue = ({ hour, minute, meridiem }) =>
  `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${meridiem}`;

const formatTaskTime = (time) => {
  if (!time || !time.specified) return 'Anytime';
  if (time.mode === 'period' && time.period) {
    return `${formatTimeValue(time.period.start)} - ${formatTimeValue(time.period.end)}`;
  }
  if (time.point) return formatTimeValue(time.point);
  return 'Anytime';
};

// --- COMPONENTE DE CONFIGURAÇÃO DE IMAGENS (PROFILE) ---
function CustomizeCalendarImages({ customImages, onUpdateImage }) {
  
  const handlePickImage = async (monthIndex) => {
    try {
      // Solicitar permissão
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'You need to allow access to your photos to change the calendar background.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All, // Imagens e Vídeos (GIFs costumam ser tratados como vídeo ou imagem dependendo da lib, mas All cobre tudo)
        allowsEditing: true,
        aspect: [16, 5], // Proporção aproximada da faixa
        quality: 1,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        
        // Salvar persistentemente no FileSystem
        const fileName = uri.split('/').pop();
        const newPath = FileSystem.documentDirectory + fileName;
        
        try {
          await FileSystem.copyAsync({
            from: uri,
            to: newPath
          });
          onUpdateImage(monthIndex, newPath);
        } catch (err) {
            console.log("Error saving file, using cache uri as fallback", err);
            onUpdateImage(monthIndex, uri);
        }
      }
    } catch (error) {
      console.warn('Error picking image:', error);
    }
  };

  const handleResetImage = (monthIndex) => {
    onUpdateImage(monthIndex, null);
  };

  return (
    <View style={styles.customizeContainer}>
      <Text style={styles.customizeTitle}>Customize Calendar</Text>
      <Text style={styles.customizeSubtitle}>Tap on a month to upload your own banner image or GIF.</Text>

      <FlatList
        data={MONTH_NAMES}
        keyExtractor={(item) => item}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item, index }) => {
          const source = getMonthImageSource(index, customImages);
          const isCustom = !!(customImages && customImages[index]);

          return (
            <View style={styles.customizeRow}>
              <ImageBackground
                source={source}
                style={styles.customizePreview}
                imageStyle={{ borderRadius: 12 }}
              >
                <View style={styles.customizeOverlay}>
                   <Text style={styles.customizeMonthName}>{item}</Text>
                </View>
              </ImageBackground>

              <View style={styles.customizeActions}>
                <TouchableOpacity 
                    style={styles.customizeBtn} 
                    onPress={() => handlePickImage(index)}
                >
                    <Ionicons name="add" size={20} color="#3c2ba7" />
                </TouchableOpacity>

                {isCustom && (
                   <TouchableOpacity 
                        style={[styles.customizeBtn, styles.customizeBtnDelete]} 
                        onPress={() => handleResetImage(index)}
                    >
                        <Ionicons name="refresh" size={18} color="#d9534f" />
                   </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

// --- RELATÓRIO DO DIA ---
function DayReportModal({ visible, date, tasks, onClose, customImages }) {
  const { height } = useWindowDimensions();
  const imageSource = date ? getMonthImageSource(date.getMonth(), customImages) : null;
  
  if (!visible || !date) return null;

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.reportOverlay}>
        <Pressable style={styles.reportBackdrop} onPress={onClose} />
        <View style={[styles.reportSheet, { maxHeight: height * 0.9 }]}>
          <ImageBackground
            source={imageSource}
            style={styles.reportHeaderImage}
            imageStyle={{ resizeMode: 'cover' }}
          >
             {/* Overlay removido/transparente conforme pedido */}
             <View style={styles.headerOverlay} />
            
            <View style={styles.reportDateContainer}>
              <Text style={styles.reportDateBig}>{format(date, 'd MMM')}</Text>
              <Text style={styles.reportYear}>{format(date, 'yyyy')}</Text>
            </View>

            <Pressable onPress={onClose} style={styles.reportCloseButton}>
              <Ionicons name="close-circle" size={32} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </ImageBackground>

          <ScrollView contentContainerStyle={styles.reportScrollContent}>
             <Text style={styles.reportSummaryText}>
                {tasks.length > 0 
                  ? `You have ${tasks.length} tasks recorded.` 
                  : "No tasks for this day."}
             </Text>
             {/* Conteúdo simplificado para brevidade */}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ScheduleApp() {
  const [userSettings, setUserSettings] = useState(DEFAULT_USER_SETTINGS);
  const [activeTab, setActiveTab] = useState(DEFAULT_USER_SETTINGS.activeTab);
  const [tasks, setTasks] = useState([]);
  const [customMonthImages, setCustomMonthImages] = useState({}); // { 0: uri, 1: uri }
  
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isHabitSheetOpen, setIsHabitSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  
  const [calendarMonths, setCalendarMonths] = useState(() => {
    const today = new Date();
    const months = [];
    for (let i = -12; i <= 12; i++) {
      const date = getMonthStart(addMonthsDateFns(today, i));
      months.push({ id: i, date: date });
    }
    return months;
  });
  const [visibleCalendarDate, setVisibleCalendarDate] = useState(new Date());

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 360;

  // Carregamento inicial
  useEffect(() => {
    const hydrate = async () => {
      const [storedTasks, storedSettings, storedImages] = await Promise.all([
        loadTasks(),
        loadUserSettings(),
        loadCustomImages()
      ]);
      if(storedTasks) setTasks(storedTasks);
      if(storedSettings) {
        setUserSettings(storedSettings);
        setActiveTab(storedSettings.activeTab);
      }
      if(storedImages) setCustomMonthImages(storedImages);
    };
    hydrate();
  }, []);

  // Persistência
  useEffect(() => { saveTasks(tasks); }, [tasks]);
  useEffect(() => { saveUserSettings(userSettings); }, [userSettings]);
  useEffect(() => { saveCustomImages(customMonthImages); }, [customMonthImages]);

  const handleUpdateCustomImage = useCallback((monthIndex, uri) => {
    setCustomMonthImages(prev => {
        const next = { ...prev };
        if (uri === null) {
            delete next[monthIndex];
        } else {
            next[monthIndex] = uri;
        }
        return next;
    });
  }, []);

  // UI Handlers
  const handleChangeTab = (tab) => {
    triggerSelection();
    setActiveTab(tab);
    setUserSettings(prev => ({...prev, activeTab: tab}));
  };

  const tasksForSelectedDate = useMemo(() => {
    // Lógica simplificada de filtro de tarefas
    return tasks.filter(t => isSameDay(new Date(t.date), selectedDate));
  }, [tasks, selectedDate]);

  function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  const renderCalendarMonth = useCallback(({ item }) => (
      <CalendarMonthItem
        item={item}
        customImages={customMonthImages}
        getDayStatus={() => 'pending'}
        onDayPress={(date) => {
             // Lógica de report simples
             console.log("Day pressed", date);
        }}
      />
    ), [customMonthImages]
  );

  return (
    <View style={[styles.appFrame, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6f6fb" />
      
      <View style={styles.container}>
        <View style={[styles.content, activeTab === 'calendar' && { paddingHorizontal: 0, paddingTop: 0 }]}>
            
            {/* --- TAB TODAY --- */}
            {activeTab === 'today' && (
                <ScrollView contentContainerStyle={{paddingBottom: 80}}>
                   <View style={styles.todayHeader}>
                      <Text style={styles.todayTitle}>Today</Text>
                      <Text style={styles.todaySubtitle}>{format(selectedDate, 'EEEE, d MMMM')}</Text>
                   </View>
                   <View style={styles.emptyStateContainer}>
                       <Text style={styles.emptyState}>
                           {tasksForSelectedDate.length === 0 ? "No tasks yet." : `${tasksForSelectedDate.length} tasks.`}
                       </Text>
                   </View>
                </ScrollView>
            )}

            {/* --- TAB CALENDAR --- */}
            {activeTab === 'calendar' && (
                <View style={{flex: 1}}>
                    <StickyMonthHeader date={visibleCalendarDate} customImages={customMonthImages} />
                    <FlatList
                        data={calendarMonths}
                        renderItem={renderCalendarMonth}
                        keyExtractor={item => item.id.toString()}
                        initialScrollIndex={12}
                        getItemLayout={(data, index) => ({
                            length: 400, 
                            offset: 400 * index, 
                            index
                        })}
                        onViewableItemsChanged={({ viewableItems }) => {
                            if (viewableItems[0]) setVisibleCalendarDate(viewableItems[0].item.date);
                        }}
                    />
                </View>
            )}

            {/* --- TAB DISCOVER (Placeholder) --- */}
            {activeTab === 'discover' && (
                <View style={styles.placeholderContainer}>
                    <Ionicons name="planet-outline" size={64} color="#ccc" />
                    <Text style={styles.heading}>Discover</Text>
                </View>
            )}

            {/* --- TAB PROFILE (Customize) --- */}
            {activeTab === 'profile' && (
                <CustomizeCalendarImages 
                    customImages={customMonthImages}
                    onUpdateImage={handleUpdateCustomImage}
                />
            )}
        </View>

        {/* --- BOTTOM BAR --- */}
        <View style={styles.bottomBarContainer}>
           <View style={styles.bottomBar}>
              <View style={styles.tabGroup}>
                 {LEFT_TABS.map(tab => (
                    <TouchableOpacity key={tab.key} onPress={() => handleChangeTab(tab.key)} style={styles.tabButton}>
                        <Ionicons name={tab.icon} size={24} color={activeTab===tab.key ? '#1a1a2e' : '#ccc'} />
                        <Text style={[styles.tabLabel, activeTab===tab.key ? {color:'#1a1a2e'} : {color:'#ccc'}]}>{tab.label}</Text>
                    </TouchableOpacity>
                 ))}
              </View>
              <View style={{width: 40}} /> 
              <View style={styles.tabGroup}>
                 {RIGHT_TABS.map(tab => (
                    <TouchableOpacity key={tab.key} onPress={() => handleChangeTab(tab.key)} style={styles.tabButton}>
                        <Ionicons name={tab.icon} size={24} color={activeTab===tab.key ? '#1a1a2e' : '#ccc'} />
                        <Text style={[styles.tabLabel, activeTab===tab.key ? {color:'#1a1a2e'} : {color:'#ccc'}]}>{tab.label}</Text>
                    </TouchableOpacity>
                 ))}
              </View>
           </View>
           
           <TouchableOpacity 
              style={styles.addButton} 
              onPress={() => setIsHabitSheetOpen(true)}
           >
              <Ionicons name="add" size={32} color="#fff" />
           </TouchableOpacity>
        </View>

      </View>

      <AddHabitSheet
        visible={isHabitSheetOpen}
        onClose={() => setIsHabitSheetOpen(false)}
        onCreate={(habit) => {
            const newTask = {
                ...habit, 
                id: Date.now().toString(), 
                date: habit.startDate || new Date(),
                completed: false 
            };
            setTasks(prev => [...prev, newTask]);
            setIsHabitSheetOpen(false);
        }}
      />
    </View>
  );
}

export default function App() {
  useEffect(() => {
    // Lock orientation handled best effort
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{flex: 1}} edges={['left', 'right']}>
        <ScheduleApp />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appFrame: { flex: 1, backgroundColor: '#f6f6fb' },
  container: { flex: 1, position: 'relative' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  
  // Customização do Profile
  customizeContainer: { flex: 1 },
  customizeTitle: { fontSize: 24, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  customizeSubtitle: { fontSize: 14, color: '#6f7a86', marginBottom: 20 },
  customizeRow: { 
      flexDirection: 'row', alignItems: 'center', marginBottom: 16, 
      backgroundColor: '#fff', padding: 10, borderRadius: 16,
      shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
  },
  customizePreview: { 
      width: 120, height: 60, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' 
  },
  customizeOverlay: { 
      ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', // Escurecer leve apenas no preview para ler o texto
      justifyContent: 'center', alignItems: 'center'
  },
  customizeMonthName: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  customizeActions: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  customizeBtn: { 
      width: 40, height: 40, borderRadius: 20, backgroundColor: '#edefff', 
      alignItems: 'center', justifyContent: 'center' 
  },
  customizeBtnDelete: { backgroundColor: '#ffeaea' },

  // Headers transparentes (Pedido do usuário)
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent', // ALTERADO DE rgba(0,0,0,0.15) PARA TRANSPARENT
  },
  stickyHeader: {
    width: '100%', height: 60, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
    backgroundColor: '#fff' 
  },
  stickyHeaderText: {
    color: '#fff', fontSize: 18, fontWeight: '700', textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 // Sombra no texto para legibilidade sem fundo escuro
  },
  calendarMonthContainer: { marginBottom: 20, backgroundColor: '#fff', borderRadius: 0 },
  calendarMonthHeader: {
    height: 120, justifyContent: 'flex-end', padding: 20
  },
  calendarMonthTitle: {
    color: '#fff', fontSize: 24, fontWeight: '800', textTransform: 'capitalize',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 // Sombra no texto essencial agora
  },
  calendarDaysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDayCellWrapper: { width: CALENDAR_DAY_SIZE, height: CALENDAR_DAY_SIZE, justifyContent: 'center', alignItems: 'center' },
  calendarDayText: { fontSize: 16, color: '#333' },
  calendarTodayCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#3c2ba7', justifyContent: 'center', alignItems: 'center' },
  calendarTodayText: { color: '#fff', fontWeight: '600' },

  // Tabs & Bottom Bar
  bottomBarContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff' },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: 1, borderColor: '#eee' },
  tabGroup: { flexDirection: 'row', gap: 20 },
  tabButton: { alignItems: 'center' },
  tabLabel: { fontSize: 10, marginTop: 4, fontWeight: '600' },
  addButton: { 
      position: 'absolute', alignSelf: 'center', top: -24, 
      backgroundColor: '#3c2ba7', width: 56, height: 56, borderRadius: 28, 
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#3c2ba7', shadowOpacity: 0.4, shadowRadius: 10, elevation: 8
  },
  
  // Geral
  todayHeader: { marginBottom: 20 },
  todayTitle: { fontSize: 32, fontWeight: '800', color: '#1a1a2e' },
  todaySubtitle: { fontSize: 16, color: '#6f7a86' },
  emptyStateContainer: { padding: 40, alignItems: 'center' },
  emptyState: { color: '#ccc' },
  placeholderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  heading: { fontSize: 24, fontWeight: 'bold', color: '#ccc' },

  // Report Modal
  reportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  reportBackdrop: { ...StyleSheet.absoluteFillObject },
  reportSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  reportHeaderImage: { height: 150, justifyContent: 'flex-end', padding: 20 },
  reportDateBig: { fontSize: 32, fontWeight: 'bold', color: '#fff', textShadowColor:'rgba(0,0,0,0.5)', textShadowRadius: 5 },
  reportYear: { fontSize: 18, color: '#eee', textShadowColor:'rgba(0,0,0,0.5)', textShadowRadius: 5 },
  reportCloseButton: { position: 'absolute', top: 15, right: 15 },
  reportScrollContent: { padding: 20 },
  reportSummaryText: { fontSize: 16, color: '#333' }
});
