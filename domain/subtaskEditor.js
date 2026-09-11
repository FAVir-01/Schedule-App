// Linhas do editor de itens. Um item salvo carrega o proprio `id` (e com ele o
// historico de conclusao); uma linha nova tem `id: null` e so uma `key` local
// para o React ate o App gerar o id ao salvar.
export const createSubtaskEntries = (subtasks) => (Array.isArray(subtasks) ? subtasks : [])
  .map((item) => (typeof item === 'string'
    ? { id: null, key: null, title: item }
    : { id: item?.id ?? null, key: item?.id ?? null, title: `${item?.title ?? ''}` }))
  .filter((item) => item.title.trim());

export const setSubtaskEntryTitle = (entries, index, title) =>
  entries.map((item, i) => (i === index ? { ...item, title } : item));

export const insertSubtaskEntry = (entries, index, key) => [
  ...entries.slice(0, index), { id: null, key, title: '' }, ...entries.slice(index),
];

export const removeSubtaskEntry = (entries, index) => entries.filter((_, i) => i !== index);

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
