import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  TASKS: '@schedule_app/tasks',
  SETTINGS: '@schedule_app/settings',
  HISTORY: '@schedule_app/history',
  MONTH_IMAGES: '@schedule_app/month_images',
};

// Se o JSON estiver corrompido, guarda o dado bruto numa chave de backup
// antes de cair no fallback, para nunca destruir dados irrecuperáveis.
const parseStoredJson = (key, value, fallback) => {
  if (value == null) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Failed to parse stored data', error);
    AsyncStorage.setItem(`${key}_corrupt_backup`, value).catch(() => {});
    return fallback;
  }
};

// Nas funções load*, `undefined` significa "falha de leitura" — o chamador
// NÃO deve salvar por cima do dado existente nesse caso.
export async function loadTasks() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TASKS);
    return parseStoredJson(STORAGE_KEYS.TASKS, raw, []);
  } catch (error) {
    console.warn('Failed to load tasks', error);
    return undefined;
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
    return parseStoredJson(STORAGE_KEYS.SETTINGS, raw, null);
  } catch (error) {
    console.warn('Failed to load settings', error);
    return undefined;
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
    return parseStoredJson(STORAGE_KEYS.HISTORY, raw, []);
  } catch (error) {
    console.warn('Failed to load history', error);
    return undefined;
  }
}

export async function saveHistory(history) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  } catch (error) {
    console.warn('Failed to save history', error);
  }
}

export async function loadMonthImages() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.MONTH_IMAGES);
    return parseStoredJson(STORAGE_KEYS.MONTH_IMAGES, raw, {});
  } catch (error) {
    console.warn('Failed to load month images', error);
    return undefined;
  }
}

export async function saveMonthImages(imagesMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.MONTH_IMAGES, JSON.stringify(imagesMap));
  } catch (error) {
    console.warn('Failed to save month images', error);
  }
}

export async function resetStorage() {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (error) {
    console.warn('Failed to reset storage', error);
  }
}
