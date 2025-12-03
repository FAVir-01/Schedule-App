import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  TASKS: '@schedule_app/tasks',
  SETTINGS: '@schedule_app/settings',
  HISTORY: '@schedule_app/history',
  CUSTOM_IMAGES: '@schedule_app/custom_images', // Nova chave
};

const parseStoredJson = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse stored data', error);
    return fallback;
  }
};

export async function loadTasks() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TASKS);
    return parseStoredJson(raw, []);
  } catch (error) {
    console.warn('Failed to load tasks', error);
    return [];
  }
}

export async function saveTasks(tasks) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  } catch (error) {
    console.warn('Failed to save tasks', error);
  }
}

export async function loadUserSettings() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return parseStoredJson(raw, null);
  } catch (error) {
    console.warn('Failed to load settings', error);
    return null;
  }
}

export async function saveUserSettings(settings) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save settings', error);
  }
}

export async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
    return parseStoredJson(raw, []);
  } catch (error) {
    console.warn('Failed to load history', error);
    return [];
  }
}

export async function saveHistory(history) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch (error) {
    console.warn('Failed to save history', error);
  }
}

// --- NOVAS FUNÇÕES PARA IMAGENS ---

export async function loadCustomImages() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_IMAGES);
    // Retorna um objeto: { 0: 'uri_janeiro', 1: 'uri_fevereiro', ... }
    return parseStoredJson(raw, {});
  } catch (error) {
    console.warn('Failed to load custom images', error);
    return {};
  }
}

export async function saveCustomImages(imagesMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_IMAGES, JSON.stringify(imagesMap));
  } catch (error) {
    console.warn('Failed to save custom images', error);
  }
}

export async function resetStorage() {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (error) {
    console.warn('Failed to reset storage', error);
  }
}
