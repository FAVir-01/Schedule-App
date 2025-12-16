import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  TASKS: '@schedule_app/tasks',
  SETTINGS: '@schedule_app/settings',
  HISTORY: '@schedule_app/history',
  MONTH_IMAGES: '@schedule_app/month_images',
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

export async function loadMonthImages() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.MONTH_IMAGES);
    return parseStoredJson(raw, {});
  } catch (error) {
    console.warn('Failed to load month images', error);
    return {};
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

export async function saveTask(text, category, type = 'standard', targetValue = 0) {
  try {
    const existingTasks = await loadTasks();
    const newTask = {
      id: Date.now().toString(),
      text,
      category,
      type,
      completed: false,
      subtasks: type === 'standard' ? [] : undefined,
      targetValue: type === 'quantity' ? parseFloat(targetValue) || 0 : undefined,
      currentValue: type === 'quantity' ? 0 : undefined,
    };

    const updatedTasks = [...existingTasks, newTask];
    await AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(updatedTasks));
    return updatedTasks;
  } catch (error) {
    console.warn('Failed to save task', error);
    return [];
  }
}
