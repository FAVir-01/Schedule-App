// Agrupamento do feed único por dia: notas avulsas e eventos diários de tarefa.
//
// Módulo puro — exercitado por `scripts/test-domain-rules.js`.

import { getDateKey, normalizeDateValue } from '../utils/dateUtils';
import { sortNotesByRecent } from './notes';

const normalizeSearch = (value) =>
  `${value ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .trim();

export const matchesNoteSearch = (note, term) => {
  const normalizedTerm = normalizeSearch(term);
  if (!normalizedTerm) {
    return true;
  }
  return normalizeSearch([note?.title, note?.text, note?.taskTitle].filter(Boolean).join(' ')).includes(
    normalizedTerm
  );
};

// As fixadas formam a primeira secao. As demais continuam agrupadas por dia.
export const buildNotesFeed = (notes, { search = '' } = {}) => {
  const filtered = (Array.isArray(notes) ? notes : []).filter((note) =>
    matchesNoteSearch(note, search)
  );

  const sorted = sortNotesByRecent(filtered);
  const pinnedNotes = sorted.filter((note) => note?.pinned === true);
  const groups = new Map();
  sorted.filter((note) => note?.pinned !== true).forEach((note) => {
    const date = normalizeDateValue(note.dateKey ?? note.createdAt);
    // Sem data utilizável a nota não some: cai num grupo próprio no fim.
    const key = date ? getDateKey(date) : 'unknown';
    if (!groups.has(key)) {
      groups.set(key, { key, date, notes: [] });
    }
    groups.get(key).notes.push(note);
  });

  const datedGroups = [...groups.values()].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date - a.date;
  });
  return pinnedNotes.length
    ? [{ key: 'pinned', date: null, pinned: true, notes: pinnedNotes }, ...datedGroups]
    : datedGroups;
};
