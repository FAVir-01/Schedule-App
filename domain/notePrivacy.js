const ids = (value) => Array.isArray(value) ? value.map(String) : [];
export const normalizeNotePrivacy = (settings = {}) => ({
  protectedNoteIds: [...new Set(ids(settings.protectedNoteIds))],
  protectedNoteTaskIds: [...new Set(ids(settings.protectedNoteTaskIds))],
});

export const getNoteProtection = (note, settings = {}) => ({
  noteProtected: ids(settings.protectedNoteIds).includes(String(note?.id)),
  taskNotesProtected: note?.source === 'task' && ids(settings.protectedNoteTaskIds).includes(String(note.taskId)),
});

export const protectNoteForDisplay = (note, settings, unlocked, lockedTitle) => {
  const protection = getNoteProtection(note, settings);
  const isLocked = !unlocked && (protection.noteProtected || protection.taskNotesProtected);
  return {
    ...note, ...protection, isLocked,
    ...(isLocked ? { title: lockedTitle, text: '', images: [] } : {}),
  };
};

export const setNoteProtection = (settings, note, scope, enabled) => {
  const field = scope === 'task' ? 'protectedNoteTaskIds' : 'protectedNoteIds';
  const id = scope === 'task' ? note?.taskId : note?.id;
  if (id == null || (scope === 'task' && note?.source !== 'task')) return settings;
  const values = new Set(ids(settings[field]));
  if (enabled) values.add(String(id));
  else values.delete(String(id));
  return { ...settings, [field]: [...values] };
};
