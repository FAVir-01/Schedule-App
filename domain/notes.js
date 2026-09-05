// Feed único de notas.
//
// Há duas origens:
// - `standalone`: criada diretamente na página Notes;
// - `task`: o texto escrito no card de uma tarefa em um dia específico.
//
// Uma tarefa tem no máximo uma entrada por dia. Editar o campo daquele card
// atualiza a mesma entrada; abrir outro dia cria outra e o histórico se acumula.
import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import { EDITOR_COLORS } from './taskDraft';

export const NOTE_MAX_LENGTH = 2000;
export const NOTE_TITLE_MAX_LENGTH = 120;
export const NOTE_MAX_IMAGES = 6;
export const NOTE_CARD_COLORS = EDITOR_COLORS;
export const NOTE_SOURCE_STANDALONE = 'standalone';
export const NOTE_SOURCE_TASK = 'task';

const createNoteId = () =>
  `${Date.now()}-note-${Math.random().toString(36).slice(2, 8)}`;

const toIsoString = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateKey = (value) => {
  const date = normalizeDateValue(value);
  return date ? getDateKey(date) : null;
};

export const normalizeNoteText = (value) =>
  `${value ?? ''}`.slice(0, NOTE_MAX_LENGTH).trim();

export const normalizeNoteTitle = (value) =>
  `${value ?? ''}`.slice(0, NOTE_TITLE_MAX_LENGTH).trim();

export const normalizeNoteCardColor = (value) =>
  NOTE_CARD_COLORS.includes(value) ? value : null;

export const normalizeNoteImages = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  return value.reduce((images, entry) => {
    const uri = `${entry ?? ''}`.trim();
    if (!uri || seen.has(uri) || images.length >= NOTE_MAX_IMAGES) {
      return images;
    }
    seen.add(uri);
    images.push(uri);
    return images;
  }, []);
};

export const createNote = (
  text,
  {
    title = '',
    images = [],
    pinned = false,
    cardColor = null,
    now = new Date(),
    createId = createNoteId,
  } = {}
) => {
  const normalized = normalizeNoteText(text);
  const normalizedTitle = normalizeNoteTitle(title);
  const normalizedImages = normalizeNoteImages(images);
  const normalizedCardColor = normalizeNoteCardColor(cardColor);
  if (!normalized && !normalizedTitle && normalizedImages.length === 0) {
    return null;
  }
  const createdAt = toIsoString(now) ?? new Date().toISOString();
  return {
    id: createId(),
    source: NOTE_SOURCE_STANDALONE,
    text: normalized,
    ...(normalizedTitle ? { title: normalizedTitle } : {}),
    ...(normalizedImages.length ? { images: normalizedImages } : {}),
    ...(pinned === true ? { pinned: true } : {}),
    ...(normalizedCardColor ? { cardColor: normalizedCardColor } : {}),
    dateKey: toDateKey(now) ?? getDateKey(new Date()),
    createdAt,
    updatedAt: createdAt,
  };
};

// Dados antigos só tinham id/text/createdAt. Eles continuam sendo notas
// avulsas. Entradas de tarefa exigem taskId e dateKey válidos.
export const normalizeNoteCollection = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenIds = new Set();
  const seenTaskDays = new Set();
  return value.reduce((accumulator, entry) => {
    if (!entry || typeof entry !== 'object') {
      return accumulator;
    }
    const id = `${entry.id ?? ''}`.trim();
    if (!id || seenIds.has(id)) {
      return accumulator;
    }

    const text = normalizeNoteText(entry.text);
    const title = normalizeNoteTitle(entry.title);
    const images = normalizeNoteImages(entry.images);
    const cardColor = normalizeNoteCardColor(entry.cardColor);
    const createdAt = toIsoString(entry.createdAt) ?? new Date().toISOString();
    const dateKey = toDateKey(entry.dateKey) ?? toDateKey(createdAt);
    const taskId = `${entry.taskId ?? ''}`.trim();
    const isTaskNote =
      (entry.source === NOTE_SOURCE_TASK || Boolean(taskId)) && Boolean(taskId && dateKey);
    if (!text && !title && images.length === 0) {
      return accumulator;
    }
    if (isTaskNote) {
      const taskDayKey = `${taskId}:${dateKey}`;
      if (seenTaskDays.has(taskDayKey)) {
        return accumulator;
      }
      seenTaskDays.add(taskDayKey);
    }

    seenIds.add(id);
    accumulator.push({
      id,
      source: isTaskNote ? NOTE_SOURCE_TASK : NOTE_SOURCE_STANDALONE,
      text,
      ...(title ? { title } : {}),
      ...(images.length ? { images } : {}),
      ...(entry.pinned === true ? { pinned: true } : {}),
      ...(cardColor ? { cardColor } : {}),
      dateKey: dateKey ?? getDateKey(new Date()),
      createdAt,
      updatedAt: toIsoString(entry.updatedAt) ?? createdAt,
      ...(isTaskNote
        ? {
            taskId,
            taskTitle: `${entry.taskTitle ?? ''}`.trim(),
          }
        : {}),
    });
    return accumulator;
  }, []);
};

export const getTaskNoteText = (notes, taskId, dateKey) => {
  const resolvedDateKey = toDateKey(dateKey);
  if (!Array.isArray(notes) || taskId == null || !resolvedDateKey) {
    return '';
  }
  const resolvedTaskId = `${taskId}`;
  return (
    notes.find(
      (note) =>
        note?.source === NOTE_SOURCE_TASK &&
        `${note.taskId}` === resolvedTaskId &&
        note.dateKey === resolvedDateKey
    )?.text ?? ''
  );
};

export const upsertTaskNote = (
  notes,
  { taskId, taskTitle, dateKey, text, title, images, pinned, cardColor },
  { now = new Date(), createId = createNoteId } = {}
) => {
  if (!Array.isArray(notes) || taskId == null) {
    return notes;
  }
  const resolvedTaskId = `${taskId}`.trim();
  const resolvedDateKey = toDateKey(dateKey);
  if (!resolvedTaskId || !resolvedDateKey) {
    return notes;
  }
  const index = notes.findIndex(
    (note) =>
      note?.source === NOTE_SOURCE_TASK &&
      `${note.taskId}` === resolvedTaskId &&
      note.dateKey === resolvedDateKey
  );
  const current = index >= 0 ? notes[index] : null;
  const normalizedText =
    text === undefined ? normalizeNoteText(current?.text) : normalizeNoteText(text);
  const normalizedNoteTitle =
    title === undefined ? normalizeNoteTitle(current?.title) : normalizeNoteTitle(title);
  const normalizedImages =
    images === undefined ? normalizeNoteImages(current?.images) : normalizeNoteImages(images);
  const normalizedTaskTitle = `${taskTitle ?? current?.taskTitle ?? ''}`.trim();
  const nextPinned = pinned === undefined ? current?.pinned === true : pinned === true;
  const nextCardColor =
    cardColor === undefined
      ? normalizeNoteCardColor(current?.cardColor)
      : normalizeNoteCardColor(cardColor);

  // Sem conteudo, o evento daquele dia deixa de existir. Fixacao e cor sao
  // preferencias do card, nao contam como conteudo de uma nota vazia.
  if (!normalizedText && !normalizedNoteTitle && normalizedImages.length === 0) {
    return index < 0 ? notes : notes.filter((_, noteIndex) => noteIndex !== index);
  }

  const timestamp = toIsoString(now) ?? new Date().toISOString();
  if (index >= 0) {
    const currentImages = normalizeNoteImages(current.images);
    if (
      current.text === normalizedText &&
      normalizeNoteTitle(current.title) === normalizedNoteTitle &&
      current.taskTitle === normalizedTaskTitle &&
      (current.pinned === true) === nextPinned &&
      normalizeNoteCardColor(current.cardColor) === nextCardColor &&
      currentImages.length === normalizedImages.length &&
      currentImages.every((uri, imageIndex) => uri === normalizedImages[imageIndex])
    ) {
      return notes;
    }
    const {
      title: _currentTitle,
      images: _currentImages,
      pinned: _currentPinned,
      cardColor: _currentCardColor,
      ...base
    } = current;
    const next = notes.slice();
    next[index] = {
      ...base,
      text: normalizedText,
      taskTitle: normalizedTaskTitle,
      ...(normalizedNoteTitle ? { title: normalizedNoteTitle } : {}),
      ...(normalizedImages.length ? { images: normalizedImages } : {}),
      ...(nextPinned ? { pinned: true } : {}),
      ...(nextCardColor ? { cardColor: nextCardColor } : {}),
      updatedAt: timestamp,
    };
    return next;
  }

  return [
    {
      id: createId(),
      source: NOTE_SOURCE_TASK,
      taskId: resolvedTaskId,
      taskTitle: normalizedTaskTitle,
      text: normalizedText,
      ...(normalizedNoteTitle ? { title: normalizedNoteTitle } : {}),
      ...(normalizedImages.length ? { images: normalizedImages } : {}),
      ...(nextPinned ? { pinned: true } : {}),
      ...(nextCardColor ? { cardColor: nextCardColor } : {}),
      dateKey: resolvedDateKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    ...notes,
  ];
};

export const updateNoteText = (notes, noteId, text, { now = new Date() } = {}) => {
  const normalized = normalizeNoteText(text);
  if (!Array.isArray(notes) || !noteId || !normalized) {
    return notes;
  }
  let changed = false;
  const next = notes.map((note) => {
    if (note?.id !== noteId || note.text === normalized) {
      return note;
    }
    changed = true;
    return { ...note, text: normalized, updatedAt: toIsoString(now) ?? note.updatedAt };
  });
  return changed ? next : notes;
};

export const updateNoteContent = (
  notes,
  noteId,
  { text, title = '', images = [], pinned, cardColor },
  { now = new Date() } = {}
) => {
  if (!Array.isArray(notes) || !noteId) {
    return notes;
  }
  const normalizedText = normalizeNoteText(text);
  const normalizedTitle = normalizeNoteTitle(title);
  const normalizedImages = normalizeNoteImages(images);
  let changed = false;
  const next = notes.map((note) => {
    if (note?.id !== noteId) {
      return note;
    }
    if (!normalizedText && !normalizedTitle && normalizedImages.length === 0) {
      return note;
    }
    const currentImages = normalizeNoteImages(note.images);
    const nextTitle = normalizedTitle;
    const currentTitle = normalizeNoteTitle(note.title);
    const nextPinned = pinned === undefined ? note.pinned === true : pinned === true;
    const currentPinned = note.pinned === true;
    const nextCardColor =
      cardColor === undefined
        ? normalizeNoteCardColor(note.cardColor)
        : normalizeNoteCardColor(cardColor);
    const currentCardColor = normalizeNoteCardColor(note.cardColor);
    if (
      note.text === normalizedText &&
      currentTitle === nextTitle &&
      currentPinned === nextPinned &&
      currentCardColor === nextCardColor &&
      currentImages.length === normalizedImages.length &&
      currentImages.every((uri, index) => uri === normalizedImages[index])
    ) {
      return note;
    }
    changed = true;
    const {
      title: _currentTitle,
      images: _currentImages,
      pinned: _currentPinned,
      cardColor: _currentCardColor,
      ...base
    } = note;
    return {
      ...base,
      text: normalizedText,
      ...(nextTitle ? { title: nextTitle } : {}),
      ...(normalizedImages.length ? { images: normalizedImages } : {}),
      ...(nextPinned ? { pinned: true } : {}),
      ...(nextCardColor ? { cardColor: nextCardColor } : {}),
      updatedAt: toIsoString(now) ?? note.updatedAt,
    };
  });
  return changed ? next : notes;
};

export const removeNote = (notes, noteId) => {
  if (!Array.isArray(notes) || !noteId) {
    return notes;
  }
  const next = notes.filter((note) => note?.id !== noteId);
  return next.length === notes.length ? notes : next;
};

export const sortNotesByRecent = (notes) =>
  [...(Array.isArray(notes) ? notes : [])].sort((a, b) =>
    `${b?.createdAt ?? ''}`.localeCompare(`${a?.createdAt ?? ''}`)
  );

const findLegacyTaskNoteContext = (task, history, fallbackDateKey, fallbackTimestamp) => {
  let latest = null;
  (Array.isArray(history) ? history : []).forEach((entry) => {
    if (
      entry?.type !== 'task_updated' ||
      `${entry.details?.taskId ?? ''}` !== `${task.id}` ||
      !toDateKey(entry.details?.dateKey)
    ) {
      return;
    }
    const timestamp = toIsoString(entry.timestamp);
    if (!latest || `${timestamp ?? ''}` > `${latest.timestamp ?? ''}`) {
      latest = { dateKey: toDateKey(entry.details.dateKey), timestamp };
    }
  });
  return latest ?? { dateKey: fallbackDateKey, timestamp: fallbackTimestamp };
};

// Antes deste feed, `task.notes` era um texto único. Na primeira leitura ele
// vira uma entrada diária e o campo legado é removido da tarefa, impedindo que
// seja importado novamente a cada inicialização.
export const migrateLegacyTaskNotes = (
  tasks,
  notes,
  { history = [], now = new Date() } = {}
) => {
  let nextNotes = normalizeNoteCollection(notes);
  const fallbackTimestamp = toIsoString(now) ?? new Date().toISOString();
  const fallbackTodayKey = toDateKey(now) ?? getDateKey(new Date());
  let tasksChanged = false;
  const nextTasks = (Array.isArray(tasks) ? tasks : []).map((task) => {
    if (!task || typeof task !== 'object' || !Object.prototype.hasOwnProperty.call(task, 'notes')) {
      return task;
    }
    const legacyText = normalizeNoteText(task.notes);
    const { notes: _legacyNotes, ...taskWithoutLegacyNotes } = task;
    tasksChanged = true;
    if (!legacyText || task.id == null) {
      return taskWithoutLegacyNotes;
    }

    const baseDateKey = toDateKey(task.dateKey ?? task.date) ?? fallbackTodayKey;
    const context = findLegacyTaskNoteContext(
      task,
      history,
      baseDateKey,
      fallbackTimestamp
    );
    if (!getTaskNoteText(nextNotes, task.id, context.dateKey)) {
      nextNotes = upsertTaskNote(
        nextNotes,
        {
          taskId: task.id,
          taskTitle: task.title,
          dateKey: context.dateKey,
          text: legacyText,
        },
        { now: context.timestamp ?? fallbackTimestamp }
      );
    }
    return taskWithoutLegacyNotes;
  });

  return {
    tasks: tasksChanged ? nextTasks : tasks,
    notes: nextNotes,
  };
};
