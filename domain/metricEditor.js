export const initialMetricEditor = { draft: null, sheet: null };

// Editor sheets always belong to an open draft. Closing or replacing that
// draft also closes its sheet, including when native callbacks arrive late.
export function metricEditorReducer(state, action) {
  if (action.type === 'open') return { draft: action.draft, sheet: action.sheet ?? null };
  if (action.draftId !== undefined && action.draftId !== state.draft?.id) return state;
  if (action.type === 'close') return initialMetricEditor;
  if (action.type === 'patch') return state.draft ? { ...state, draft: { ...state.draft, ...action.values } } : state;
  if (action.type === 'sheet') {
    if (action.sheet && action.sheet.kind !== 'menu' && !state.draft) return state;
    return { ...state, sheet: action.sheet };
  }
  return state;
}
