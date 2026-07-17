import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  TASKS: '@schedule_app/tasks',
  SETTINGS: '@schedule_app/settings',
  HISTORY: '@schedule_app/history',
  MONTH_IMAGES: '@schedule_app/month_images',
  DAY_MOODS: '@schedule_app/day_moods',
  // Chave legada (lista de expressões); mantida só pro resetStorage limpar.
  CUSTOM_MOOD_IMAGES: '@schedule_app/custom_mood_images',
  MOOD_APPEARANCE: '@schedule_app/mood_appearance',
};

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isObjectArray = (value) =>
  Array.isArray(value) &&
  value.every((item) => item == null || isPlainObject(item));

const preserveInvalidStoredValue = (key, value) => {
  AsyncStorage.setItem(`${key}_corrupt_backup`, value).catch((error) => {
    console.warn('Failed to preserve invalid stored data', error);
  });
};

// Se o JSON ou sua estrutura estiverem inválidos, guarda o dado bruto numa
// chave de recuperação e sinaliza falha para bloquear qualquer sobrescrita.
const parseStoredJson = (key, value, fallback, isValid) => {
  if (value == null) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value);
    if (!isValid(parsed)) {
      console.warn(`Stored data has an invalid format: ${key}`);
      preserveInvalidStoredValue(key, value);
      return undefined;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse stored data', error);
    preserveInvalidStoredValue(key, value);
    return undefined;
  }
};

// Nas funções load*, `undefined` significa "falha de leitura" — o chamador
// NÃO deve salvar por cima do dado existente nesse caso.
export async function loadTasks() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TASKS);
    return parseStoredJson(STORAGE_KEYS.TASKS, raw, [], isObjectArray);
  } catch (error) {
    console.warn('Failed to load tasks', error);
    return undefined;
  }
}

export async function saveTasks(tasks) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.warn('Failed to save tasks', error);
    return false;
  }
}

export async function loadUserSettings() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
    return parseStoredJson(
      STORAGE_KEYS.SETTINGS,
      raw,
      null,
      (value) => value === null || isPlainObject(value)
    );
  } catch (error) {
    console.warn('Failed to load settings', error);
    return undefined;
  }
}

export async function saveUserSettings(settings) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.warn('Failed to save settings', error);
    return false;
  }
}

export async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.HISTORY);
    return parseStoredJson(STORAGE_KEYS.HISTORY, raw, [], isObjectArray);
  } catch (error) {
    console.warn('Failed to load history', error);
    return undefined;
  }
}

export async function saveHistory(history) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.warn('Failed to save history', error);
    return false;
  }
}

export async function loadMonthImages() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.MONTH_IMAGES);
    return parseStoredJson(STORAGE_KEYS.MONTH_IMAGES, raw, {}, isPlainObject);
  } catch (error) {
    console.warn('Failed to load month images', error);
    return undefined;
  }
}

export async function saveMonthImages(imagesMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.MONTH_IMAGES, JSON.stringify(imagesMap));
    return true;
  } catch (error) {
    console.warn('Failed to save month images', error);
    return false;
  }
}

// Reflexões diárias: { [dateKey]: { level, tags, note, photo, updatedAt } }
// (registros antigos podem ter { emoji, image, note } no lugar do nível)
export async function loadDayMoods() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.DAY_MOODS);
    return parseStoredJson(STORAGE_KEYS.DAY_MOODS, raw, {}, isPlainObject);
  } catch (error) {
    console.warn('Failed to load day moods', error);
    return undefined;
  }
}

export async function saveDayMoods(moodsMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DAY_MOODS, JSON.stringify(moodsMap));
    return true;
  } catch (error) {
    console.warn('Failed to save day moods', error);
    return false;
  }
}

// Aparência dos 5 níveis de humor: { [level]: uri de imagem/GIF }.
export async function loadMoodAppearance() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.MOOD_APPEARANCE);
    return parseStoredJson(STORAGE_KEYS.MOOD_APPEARANCE, raw, {}, isPlainObject);
  } catch (error) {
    console.warn('Failed to load mood appearance', error);
    return undefined;
  }
}

export async function saveMoodAppearance(appearanceMap) {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.MOOD_APPEARANCE,
      JSON.stringify(appearanceMap)
    );
    return true;
  } catch (error) {
    console.warn('Failed to save mood appearance', error);
    return false;
  }
}

export async function getRawStorageSnapshot() {
  const primaryKeys = Object.values(STORAGE_KEYS);
  const recoveryKeys = primaryKeys.map((key) => `${key}_corrupt_backup`);
  try {
    const entries = await AsyncStorage.multiGet([...primaryKeys, ...recoveryKeys]);
    return Object.fromEntries(
      entries.filter(([, value]) => value !== null)
    );
  } catch (error) {
    console.warn('Failed to read raw storage snapshot', error);
    return null;
  }
}

export async function resetStorage() {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    return true;
  } catch (error) {
    console.warn('Failed to reset storage', error);
    return false;
  }
}
