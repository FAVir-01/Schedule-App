// Keep saved item identities while editing a plain, newline-separated list.
export const editSubtaskLines = (entries, text) => {
  const previous = entries ?? [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const remaining = previous.map((entry, index) => ({ ...entry, index }));
  // Match unchanged lines first, including moves and duplicate titles. A new
  // line must never take the identity of an unchanged line farther down.
  const matched = lines.map((title) => {
    const index = remaining.findIndex((entry) => entry.title === title);
    return index < 0 ? null : remaining.splice(index, 1)[0];
  });
  return lines.map((title, index) => ({
    id: (matched[index] ?? remaining.shift())?.id ?? null,
    title,
  }));
};

export const reconcileSubtaskEntries = (entries, existing, createId) => {
  const remaining = [...existing];
  return entries.filter((item) => `${typeof item === 'string' ? item : item.title ?? ''}`.trim())
    .map((item, index) => {
      const title = `${typeof item === 'string' ? item : item.title ?? ''}`.trim();
      const match = remaining.findIndex((entry) => typeof item === 'string'
        ? entry.title === title : item.id != null && String(entry.id) === String(item.id));
      const saved = match >= 0 ? remaining.splice(match, 1)[0] : null;
      return saved ? { ...saved, title, completedDates: saved.completedDates ?? {} }
        : { id: createId(index), title, completedDates: {} };
    });
};
