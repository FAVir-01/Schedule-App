import React, { useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { workspaceTranslations } from '../constants/metricWorkspaceI18n';
import { createMetricId } from '../domain/metrics';
import { compileMetricFormula } from '../domain/metricFormula';
import { initialMetricEditor, metricEditorReducer } from '../domain/metricEditor';
import { availableMetricFields, describeMetricBinding, evaluateMetricWidget, metricPeriodRange, normalizeMetricWorkspace, WORKSPACE_DISPLAYS, WORKSPACE_PERIODS } from '../domain/metricWorkspace';
import { buildMetricSource, displayMetricReference, metricNameError, metricSources, nextSourceLetter, prepareMetricSources, sourceOf, suggestMetricName } from '../domain/metricSources';
import MetricPlot, { metricDate, metricNumber } from './MetricPlot';

const accent = '#654b91';
const emptyWidget = (language) => ({ id: createMetricId(), title: '', unit: '', formula: '', formulaLanguage: language, bindings: [], period: 'month', display: 'number', groupBy: 'auto', startDate: '', endDate: '' });
const searchText = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const errorText = (error, t) => (t.errors[error?.code] ?? t[error?.code] ?? t.errors.incompleteFormula).replace('{detail}', error?.detail ?? '');
const viewIcons = { number: 'calculator-outline', line: 'trending-up-outline', bars: 'stats-chart-outline', table: 'grid-outline' };
const functionNames = { SUM: 'SOMA', AVERAGE: 'MEDIA', MIN: 'MIN', MAX: 'MAX', LAST: 'ULTIMO', DAYS: 'DIAS', ACTIVE_DAYS: 'DIAS_ATIVOS', IF: 'SE', ROUND: 'ARRED', ABS: 'ABS' };

function IconButton({ icon, label, onPress }) {
  return <Pressable onPress={(event) => { event.stopPropagation(); onPress(); }} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}>
    <Ionicons name={icon} size={21} color={accent} />
  </Pressable>;
}

function TaskAvatar({ task }) {
  const [failed, setFailed] = useState(false);
  return <View style={s.avatar}>{task?.image && !failed ? <Image source={{ uri: task.image }} style={s.avatarImage} onError={() => setFailed(true)} /> : <Text style={s.emoji}>{task?.emoji || '✓'}</Text>}</View>;
}

function OptionRow({ title, description, icon, selected, onPress, danger = false }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} style={({ pressed }) => [s.optionRow, pressed && s.pressed]}>
    {icon && <Ionicons name={icon} size={21} color={danger ? '#a13c52' : accent} />}
    <View style={s.grow}><Text style={[s.optionTitle, danger && s.danger]}>{title}</Text>{description ? <Text style={s.secondary}>{description}</Text> : null}</View>
    <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={selected ? 22 : 16} color={selected ? accent : '#a39baa'} />
  </Pressable>;
}

function ValueTable({ result, language, t, raw = false, limit, onMore }) {
  const rows = raw ? [...result.rows].reverse() : [...result.buckets].reverse();
  const refs = raw ? [...result.fields.keys()] : [];
  return <View>
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
      <View style={{ flex: 1 }}>
        <View style={[s.tableRow, s.tableHeading]}><Text style={s.dateCell}>{t.date}</Text>{(raw ? refs : [t.result]).map((ref) => <Text key={ref} style={s.valueCell}>{ref}</Text>)}</View>
        {rows.slice(0, limit).map((row) => <View key={row.dateKey} style={s.tableRow}>
          <Text style={s.dateCell}>{metricDate(row.dateKey, language, !raw && result.monthly ? { month: 'short', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: '2-digit' })}</Text>
          {raw ? refs.map((ref) => <Text key={ref} style={s.valueCell}>{metricNumber(row.values[ref], language)}</Text>) : <Text style={s.valueCell}>{metricNumber(row.value, language)}</Text>}
        </View>)}
      </View>
    </ScrollView>
    {rows.length > limit && <Pressable onPress={onMore} style={s.textAction} accessibilityRole="button"><Text style={s.textActionLabel}>{t.more} · {limit}/{rows.length}</Text></Pressable>}
  </View>;
}

export default function MetricsScreen({ language = 'en', config, tasks = [], history = [], today, onChange, onBack, reduceMotion = false }) {
  const t = workspaceTranslations[language] ?? workspaceTranslations.en;
  const insets = useSafeAreaInsets();
  const data = useMemo(() => normalizeMetricWorkspace(config), [config]);
  const [{ draft, sheet }, dispatchEditor] = useReducer(metricEditorReducer, initialMetricEditor);
  const setSheet = (value) => dispatchEditor({ type: 'sheet', sheet: value, draftId: draft?.id });
  const clearEditor = () => dispatchEditor({ type: 'close', draftId: draft?.id });
  const [search, setSearch] = useState('');
  const [tableLimit, setTableLimit] = useState(20);
  const [formError, setFormError] = useState(null);
  const [rangeDraft, setRangeDraft] = useState({ start: '', end: '' });
  const [expandedSources, setExpandedSources] = useState({});
  const [allFunctions, setAllFunctions] = useState(false);
  const formulaInput = useRef(null);
  const formulaSelection = useRef({ start: 0, end: 0 });
  const originalDraft = useRef('');
  const result = useMemo(() => draft ? evaluateMetricWidget(draft, tasks, { today, history }) : null, [draft, tasks, today, history]);
  const results = useMemo(() => new Map(data.widgets.map((widget) => [widget.id, evaluateMetricWidget(widget, tasks, { today, history })])), [data, tasks, today, history]);
  const patch = (values) => { dispatchEditor({ type: 'patch', values, draftId: draft?.id }); setFormError(null); };
  const openSheet = (value) => { Keyboard.dismiss(); setSearch(''); setSheet(value); setTableLimit(20); setAllFunctions(false); };
  const openWidget = (widget = null) => {
    const next = widget ? prepareMetricSources(JSON.parse(JSON.stringify(widget)), tasks) : emptyWidget(language);
    if (widget) next.title = suggestMetricName(next.title, data.widgets, next.id);
    originalDraft.current = JSON.stringify(next);
    Keyboard.dismiss(); setSearch('');
    dispatchEditor({ type: 'open', draft: next, sheet: widget ? null : { kind: 'source' } });
    setFormError(null); setTableLimit(20); setExpandedSources({});
  };
  const closeEditor = () => {
    Keyboard.dismiss();
    if (draft && JSON.stringify(draft) !== originalDraft.current) Alert.alert(t.discardTitle, t.discardBody, [{ text: t.cancel, style: 'cancel' }, { text: t.discard, style: 'destructive', onPress: clearEditor }]);
    else if (draft) clearEditor();
    else onBack();
  };
  const back = () => {
    if (sheet) { setSheet(null); return; }
    closeEditor();
  };
  const save = () => {
    if (!draft) return;
    const nameError = metricNameError(draft.title, data.widgets, draft.id);
    if (nameError) { setFormError({ code: nameError }); return; }
    try {
      const compiled = compileMetricFormula(draft.formula, draft.formulaLanguage);
      const missing = compiled.references.find((ref) => !draft.bindings.some((binding) => binding.ref === ref));
      if (missing) { setFormError({ code: 'unknownReference', detail: missing }); return; }
      metricPeriodRange(draft, today);
    } catch (error) { setFormError({ code: error.code, detail: error.detail }); return; }
    const exists = data.widgets.some((widget) => widget.id === draft.id);
    const widgets = exists ? data.widgets.map((widget) => widget.id === draft.id ? draft : widget) : [...data.widgets, draft];
    if (onChange(normalizeMetricWorkspace({ ...data, widgets })) === false) return;
    Keyboard.dismiss(); clearEditor();
  };
  const insertText = (text) => {
    if (!draft) return;
    const selection = formulaSelection.current;
    const start = Math.min(selection.start, draft.formula.length);
    const end = Math.min(selection.end, draft.formula.length);
    patch({ formula: draft.formula.slice(0, start) + text + draft.formula.slice(end) });
    formulaSelection.current = { start: start + text.length, end: start + text.length };
    formulaInput.current?.focus();
  };
  const selectTask = (task) => {
    if (!draft || sheet?.kind !== 'source') return;
    const replacing = draft.bindings.find((binding) => binding.ref === sheet.ref);
    const ref = replacing?.ref ?? nextSourceLetter(draft.bindings);
    if (!ref) return;
    const sameTask = replacing?.taskId === String(task.id);
    const group = buildMetricSource(task, ref, 'completion', sameTask ? draft.bindings : []);
    const bindings = [...draft.bindings.filter((item) => sourceOf(item) !== ref), ...group].sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }));
    patch({ bindings, title: draft.title || suggestMetricName(task.title, data.widgets, draft.id), formula: draft.formula || ref });
    setSheet(null);
  };
  const removeWidget = (widget) => Alert.alert(t.deleteTitle, t.deleteBody, [{ text: t.cancel, style: 'cancel' }, { text: t.delete, style: 'destructive', onPress: () => { if (onChange({ ...data, widgets: data.widgets.filter((item) => item.id !== widget.id) }) !== false) { setSheet(null); if (draft?.id === widget.id) clearEditor(); } } }]);
  const sourceOptions = tasks.filter((task) => searchText(`${task.title} ${(task.subtasks ?? []).map((subtask) => subtask.title).join(' ')}`).includes(searchText(search)));
  const formatInputDate = (key) => language === 'pt' && key ? key.split('-').reverse().join('/') : key;
  const parseInputDate = (value) => language === 'pt' ? value.split('/').reverse().join('-') : value;
  const names = (key) => draft?.formulaLanguage === 'pt' ? functionNames[key] : key;
  const separator = draft?.formulaLanguage === 'pt' ? '; ' : ', ';
  const firstRef = draft?.bindings[0]?.ref || 'A';
  const exampleRef = draft?.bindings.find((binding) => binding.field === 'subtask')?.ref || firstRef;
  const recipes = [`${exampleRef} * 5`, `(${exampleRef} * 5) / ${names('DAYS')}()`];
  const showError = formError || result?.error;
  const nameError = draft?.title ? metricNameError(draft.title, data.widgets, draft.id) : null;

  const referenceRow = (binding, interactive = true) => {
    const description = describeMetricBinding(binding, tasks, t);
    const field = result?.fields.get(binding.ref);
    return <View key={binding.ref} style={s.reference}>
      <TaskAvatar key={binding.taskId} task={description.task} />
      <Pressable disabled={!interactive} onPress={() => setExpandedSources((previous) => ({ ...previous, [binding.ref]: !previous[binding.ref] }))} style={s.referenceSource} accessibilityRole={interactive ? 'button' : undefined} accessibilityState={interactive ? { expanded: Boolean(expandedSources[binding.ref]) } : undefined} accessibilityLabel={`${description.taskTitle}: ${interactive ? t.variables : description.field}`}>
        <Text style={s.sourceTitle}>{description.taskTitle}</Text>
        {!interactive && <><Text style={s.sourceField}>{description.field}{description.unit ? ` · ${description.unit}` : ''}</Text><Text style={s.refValue}>{metricNumber(field?.error ? null : field?.total, language)} · {field?.constant != null ? t.fixed : t.inPeriod}</Text></>}
      </Pressable>
      {interactive && <Ionicons name={expandedSources[binding.ref] ? 'chevron-up' : 'chevron-down'} size={13} color={accent} />}
      <Pressable onPress={interactive ? () => insertText(displayMetricReference(binding.ref)) : undefined} accessibilityRole={interactive ? 'button' : undefined} accessibilityLabel={t.insertRef.replace('{ref}', binding.ref)} style={s.refBadge}><Text style={s.refLetter}>{displayMetricReference(binding.ref)}</Text></Pressable>
    </View>;
  };

  return <Modal visible animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={back}>
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]} importantForAccessibility={sheet ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={Boolean(sheet)}>
        <IconButton icon={draft ? 'arrow-back' : 'close'} label={draft ? t.back : t.close} onPress={closeEditor} />
        <Text style={s.headerTitle}>{draft ? (data.widgets.some((widget) => widget.id === draft.id) ? t.editWidget : t.newWidget) : t.title}</Text>
        {draft ? <Pressable onPress={save} style={s.saveButton} accessibilityRole="button"><Text style={s.saveLabel}>{t.save}</Text></Pressable>
          : data.widgets.length > 0 ? <IconButton icon="add" label={t.add} onPress={() => openWidget()} /> : <View style={s.iconButton} />}
      </View>
      <ScrollView key={draft?.id ?? 'dashboard'} style={s.body} importantForAccessibility={sheet ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={Boolean(sheet)} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]}>
        {!draft ? data.widgets.length === 0 ? <View style={s.empty}>
          <Text style={s.eyebrow}>{t.eyebrow}</Text>
          <Text style={s.emptyTitle}>{t.emptyTitle}</Text><Text style={s.emptyBody}>{t.emptyBody}</Text>
          <View style={s.example}><Text style={s.eyebrow}>{t.example}</Text><Text style={s.sourceTitle}>{t.exampleSource}</Text>
            <View style={s.exampleMath}><View style={s.refBadge}><Text style={s.refLetter}>A</Text></View><Text style={s.exampleFormula}>× 5</Text><Ionicons name="arrow-forward" size={24} color="#b2a6c3" /><Ionicons name="stats-chart-outline" size={30} color={accent} /></View>
            <Text style={s.secondary}>{t.exampleCaption}</Text>
          </View>
          <Pressable style={s.primary} onPress={() => openWidget()} accessibilityRole="button"><Text style={s.primaryText}>{t.start}</Text><Ionicons name="arrow-forward" size={20} color="#ffffff" /></Pressable>
        </View> : <>
          <Text style={s.secondary}>{t.savedHint}</Text>
          {data.widgets.map((widget) => {
            const value = results.get(widget.id);
            const used = widget.bindings.filter((binding) => value.usedReferences.includes(binding.ref));
            return <Pressable key={widget.id} onPress={() => openWidget(widget)} accessibilityRole="button" style={({ pressed }) => [s.widget, pressed && s.pressed]}>
              <View style={s.row}><Text style={[s.widgetTitle, s.grow]}>{widget.title}</Text><IconButton icon="ellipsis-horizontal" label={`${t.menu}: ${widget.title}`} onPress={() => openSheet({ kind: 'menu', widget })} /></View>
              <Text style={s.periodLabel}>{t.periods[widget.period]}</Text>
              <View style={s.resultRow}><Text style={s.resultNumber}>{metricNumber(value.value, language)}</Text>{widget.unit ? <Text style={s.resultUnit}>{widget.unit}</Text> : null}</View>
              {value.error && <Text style={s.error}>{errorText(value.error, t)}</Text>}
              {['line', 'bars'].includes(widget.display) && <MetricPlot result={value} display={widget.display} language={language} t={t} compact />}
              {widget.display === 'table' && <View>{value.buckets.slice(-3).map((bucket) => <View key={bucket.key} style={s.miniRow}><Text style={s.secondary}>{metricDate(bucket.dateKey, language, value.monthly ? { month: 'short' } : { day: 'numeric', month: 'short' })}</Text><Text style={s.miniValue}>{metricNumber(bucket.value, language)}</Text></View>)}</View>}
              <View style={s.widgetFooter}><Text style={s.smallFormula}>= {widget.formula}</Text>{used.map((binding) => <Text key={binding.ref} style={s.sourceCaption}>{binding.ref} · {describeMetricBinding(binding, tasks, t).path}</Text>)}</View>
            </Pressable>;
          })}
        </> : <>
          <View style={s.namePanel}>
            <TextInput style={s.titleInput} accessibilityLabel={t.nameLabel} placeholder={t.widgetTitle} placeholderTextColor="#796d83" value={draft.title} onChangeText={(title) => patch({ title })} maxLength={64} autoCapitalize="none" autoCorrect={false} spellCheck={false} />
            <Text style={nameError ? s.error : s.secondary}>{nameError ? errorText({ code: nameError }, t) : t.nameHint}</Text>
          </View>
          <View style={s.sourcePanel}>
            <View style={s.row}><Text style={[s.eyebrow, s.grow]}>{t.sources}</Text><Text style={s.secondary}>{metricSources(draft.bindings).length}/6</Text>{nextSourceLetter(draft.bindings) && <IconButton icon="add" label={t.addSource} onPress={() => openSheet({ kind: 'source' })} />}</View>
            {metricSources(draft.bindings).map((binding) => {
              const children = draft.bindings.filter((item) => sourceOf(item) === binding.ref);
              return <View key={binding.ref} style={s.sourceGroup}>
                {referenceRow(binding)}
                {expandedSources[binding.ref] && <>
                  {children.map((child) => <Pressable key={child.ref} style={s.subtaskRow} accessibilityRole="button" accessibilityLabel={`${t.insertRef.replace('{ref}', child.ref)}: ${describeMetricBinding(child, tasks, t).field}`} onPress={() => insertText(displayMetricReference(child.ref))}><Text style={[s.sourceField, s.grow]}>{describeMetricBinding(child, tasks, t).field}</Text><Text style={s.variableRef}>{displayMetricReference(child.ref)}</Text></Pressable>)}
                  <View style={s.sourceActions}><Pressable style={s.textAction} accessibilityRole="button" onPress={() => openSheet({ kind: 'source', ref: binding.ref })}><Text style={s.smallAction}>{t.changeCard}</Text></Pressable><Pressable style={s.textAction} accessibilityRole="button" onPress={() => patch({ bindings: draft.bindings.filter((item) => sourceOf(item) !== binding.ref) })}><Text style={s.smallAction}>{t.removeRef}</Text></Pressable></View>
                </>}
              </View>;
            })}
            {!draft.bindings.length && <Text style={s.secondary}>{t.noReferences}</Text>}
          </View>
          <View style={s.formulaPanel}>
            <View style={s.row}><Text style={[s.formulaLabel, s.grow]}>{t.formula}</Text><IconButton icon="help-circle-outline" label={t.help} onPress={() => openSheet({ kind: 'help' })} /></View>
            <View style={s.formulaRow}><Text style={s.equals}>=</Text><TextInput ref={formulaInput} style={s.formulaInput} accessibilityLabel={t.formula} placeholder={t.formulaPlaceholder} placeholderTextColor="#796d83" value={draft.formula}
              onChangeText={(formula) => patch({ formula })} onSelectionChange={(event) => { formulaSelection.current = event.nativeEvent.selection; }} autoCapitalize="none" autoCorrect={false} spellCheck={false} maxLength={500} multiline />
            </View>
            <Text style={s.formulaHint}>{t.refHint}</Text>
          </View>
          <View style={s.resultPanel}>
            <Text style={s.eyebrow}>{t.preview}</Text>
            <View style={s.resultRow}><Text style={s.resultNumber}>{metricNumber(result.value, language)}</Text><TextInput style={s.unitInput} value={draft.unit} placeholder={t.unit} placeholderTextColor="#796d83" accessibilityLabel={t.unitLabel} onChangeText={(unit) => patch({ unit })} maxLength={40} /></View>
            {showError && <Text style={s.error} accessibilityLiveRegion="polite">{errorText(showError, t)}</Text>}
            <View style={s.settingsRows}>
              <Pressable style={s.settingRow} onPress={() => openSheet({ kind: 'period' })} accessibilityRole="button"><Ionicons name="calendar-outline" size={17} color={accent} /><Text style={s.settingName}>{t.period}</Text><Text style={s.settingValue}>{draft.period === 'custom' ? `${metricDate(draft.startDate, language)} – ${metricDate(draft.endDate, language)}` : t.periods[draft.period]}</Text><Ionicons name="chevron-down" size={15} color={accent} /></Pressable>
              <Pressable style={s.settingRow} onPress={() => openSheet({ kind: 'display' })} accessibilityRole="button"><Ionicons name={viewIcons[draft.display]} size={17} color={accent} /><Text style={s.settingName}>{t.display}</Text><Text style={s.settingValue}>{t.displays[draft.display]}</Text><Ionicons name="chevron-down" size={15} color={accent} /></Pressable>
            </View>
            {['line', 'bars'].includes(draft.display) && <MetricPlot result={result} display={draft.display} language={language} t={t} />}
            {draft.display === 'table' && <ValueTable result={result} language={language} t={t} limit={tableLimit} onMore={() => setTableLimit(tableLimit + 30)} />}
            {draft.display !== 'number' && <Pressable onPress={() => openSheet({ kind: 'group' })} style={s.textAction} accessibilityRole="button"><Text style={s.smallAction}>{t.grouping}: {t.groups[draft.groupBy]}</Text><Ionicons name="chevron-down" size={13} color={accent} /></Pressable>}
            {result.startKey ? <Text style={s.dateRange}>{metricDate(result.startKey, language)} — {metricDate(result.endKey, language)}</Text> : null}
            {result.missing?.length > 0 && <Text style={s.error}>{t.missing}</Text>}
          </View>
          {draft.bindings.length > 0 && <Pressable onPress={() => openSheet({ kind: 'data' })} style={s.inspect} accessibilityRole="button"><Ionicons name="grid-outline" size={16} color={accent} /><Text style={s.textActionLabel}>{t.inspect}</Text><Ionicons name="arrow-forward" size={16} color={accent} /></Pressable>}
        </>}
      </ScrollView>

      {sheet && <View style={s.overlay} accessibilityViewIsModal>
        <Pressable style={s.backdrop} onPress={() => setSheet(null)} accessibilityRole="button" accessibilityLabel={t.close} />
        <View style={[s.sheet, sheet.kind === 'help' && s.guideSheet, { paddingBottom: insets.bottom + 12, marginTop: insets.top + 12 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, s.grow]}>{sheet.kind === 'source' ? t.pickerTitle : sheet.kind === 'help' ? t.helpTitle : sheet.kind === 'data' ? t.dataTitle : sheet.kind === 'period' ? t.period : sheet.kind === 'display' ? t.display : sheet.kind === 'group' ? t.grouping : sheet.kind === 'dates' ? t.periods.custom : t.menu}</Text>
            <IconButton icon="close" label={t.close} onPress={() => setSheet(null)} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}>
            {sheet.kind === 'source' ? <>
              <Text style={s.secondary}>{t.pickerHint}</Text>
              <View style={s.search}><Ionicons name="search-outline" size={19} color="#82778f" /><TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder={t.search} placeholderTextColor="#82778f" accessibilityLabel={t.search} /></View>
              {sourceOptions.map((task) => <Pressable key={task.id} style={s.taskRow} onPress={() => selectTask(task)} accessibilityRole="button" accessibilityLabel={`${task.title}: ${availableMetricFields(task).filter((field) => field.field !== 'subtask').map((field) => t.fields[field.field]).join(', ')}`}>
                <TaskAvatar task={task} /><View style={s.grow}><Text style={s.sourceTitle}>{task.title}</Text><Text style={s.secondary}>{task.type === 'quantum' ? task.quantum?.mode === 'count' ? 'Count' : t.fields.minutes : t.fields.completion}{task.subtasks?.length ? ` · ${task.subtasks.length} subtasks` : ''}</Text></View><Ionicons name="chevron-forward" size={17} color="#a39baa" />
              </Pressable>)}
              {!sourceOptions.length && <Text style={s.secondary}>{tasks.length ? t.noResults : t.noTasks}</Text>}
              {sheet.ref && <Pressable style={s.textAction} onPress={() => { patch({ bindings: draft.bindings.filter((binding) => sourceOf(binding) !== sheet.ref) }); setSheet(null); }} accessibilityRole="button"><Text style={s.danger}>{t.removeRef}</Text></Pressable>}
            </> : sheet.kind === 'period' ? WORKSPACE_PERIODS.map((period) => <OptionRow key={period} title={t.periods[period]} selected={draft.period === period} onPress={() => {
              if (period === 'custom') { setRangeDraft({ start: formatInputDate(draft.startDate || result.startKey), end: formatInputDate(draft.endDate || result.endKey) }); setSheet({ kind: 'dates' }); }
              else { patch({ period }); setSheet(null); }
            }} />) : sheet.kind === 'dates' ? <>
              <Text style={s.secondary}>{t.dayBasis}</Text>
              {[['start', t.startDate], ['end', t.endDate]].map(([key, label]) => <View key={key} style={s.rangeField}><Text style={s.sourceTitle}>{label}</Text><TextInput style={s.dateInput} value={rangeDraft[key]} onChangeText={(value) => setRangeDraft({ ...rangeDraft, [key]: value })} placeholder={t.datePlaceholder} accessibilityLabel={label} keyboardType="numbers-and-punctuation" /></View>)}
              <Pressable style={s.primary} accessibilityRole="button" onPress={() => {
                const change = { period: 'custom', startDate: parseInputDate(rangeDraft.start.trim()), endDate: parseInputDate(rangeDraft.end.trim()) };
                try { metricPeriodRange({ ...draft, ...change }, today); patch(change); setSheet(null); } catch (error) { Alert.alert(t.period, errorText(error, t)); }
              }}><Text style={s.primaryText}>{t.apply}</Text></Pressable>
            </> : sheet.kind === 'display' ? WORKSPACE_DISPLAYS.map((display) => <OptionRow key={display} title={t.displays[display]} description={t.displayHelp[display]} icon={viewIcons[display]} selected={draft.display === display} onPress={() => { patch({ display }); setTableLimit(20); setSheet(null); }} />)
              : sheet.kind === 'group' ? ['auto', 'day', 'month'].map((groupBy) => <OptionRow key={groupBy} title={t.groups[groupBy]} selected={draft.groupBy === groupBy} onPress={() => { patch({ groupBy }); setSheet(null); }} />)
              : sheet.kind === 'data' ? <>
                <Text style={s.secondary}>{t.rowsHint}</Text>{draft.bindings.map((binding) => referenceRow(binding, false))}
                <Text style={s.secondary}>{t.dayBasis}</Text><ValueTable result={result} language={language} t={t} raw limit={tableLimit} onMore={() => setTableLimit(tableLimit + 30)} />
              </> : sheet.kind === 'help' ? <>
                <Text style={s.emptyBody}>{t.helpIntro}</Text><Text style={s.secondary}>{t.subtaskHint}</Text>
                <Text style={s.eyebrow}>{t.examples}</Text>
                {recipes.map((formula, index) => <Pressable key={formula} style={s.recipe} onPress={() => { patch({ formula }); setSheet(null); }} accessibilityRole="button" accessibilityLabel={`${t.useExample}: ${t.recipes[index]}`}><Text style={s.sourceTitle}>{t.recipes[index]}</Text><Text style={s.recipeFormula}>= {formula}</Text></Pressable>)}
                <Text style={s.eyebrow}>{t.functions}</Text>
                {Object.entries(t.functionHelp).filter(([name]) => allFunctions || ['AVERAGE', 'DAYS'].includes(name)).map(([name, description]) => <View key={name} style={s.functionRow}><Text style={s.functionName}>{names(name)}({name === 'DAYS' ? '' : name === 'IF' ? `A > 0${separator}A${separator}0` : name === 'ROUND' ? `A${separator}2` : 'A'})</Text><Text style={[s.secondary, s.grow]}>{description}</Text></View>)}
                <Pressable style={s.textAction} accessibilityRole="button" accessibilityState={{ expanded: allFunctions }} onPress={() => setAllFunctions(!allFunctions)}><Text style={s.textActionLabel}>{allFunctions ? t.lessFunctions : t.moreFunctions}</Text><Ionicons name={allFunctions ? 'chevron-up' : 'chevron-down'} size={14} color={accent} /></Pressable>
                {allFunctions && <Text style={s.secondary}>{draft.formulaLanguage === 'pt' ? workspaceTranslations.pt.formulaNote : workspaceTranslations.en.formulaNote}</Text>}
              </> : sheet.kind === 'menu' ? <>
                <OptionRow title={t.duplicate} icon="copy-outline" onPress={() => {
                  const copy = { ...sheet.widget, id: createMetricId(), title: suggestMetricName(sheet.widget.title, data.widgets) };
                  setSheet(null); openWidget(copy);
                }} />
                {data.widgets.findIndex((widget) => widget.id === sheet.widget.id) > 0 && <OptionRow title={t.moveUp} icon="arrow-up-outline" onPress={() => { const widgets = [...data.widgets]; const index = widgets.findIndex((widget) => widget.id === sheet.widget.id); [widgets[index - 1], widgets[index]] = [widgets[index], widgets[index - 1]]; onChange({ ...data, widgets }); setSheet(null); }} />}
                <OptionRow title={t.delete} icon="trash-outline" danger onPress={() => removeWidget(sheet.widget)} />
              </> : null}
          </ScrollView>
        </View>
      </View>}
    </KeyboardAvoidingView>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8f6fa' }, body: { flex: 1 }, content: { padding: 22, gap: 19 }, grow: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: '#f8f6fa' }, headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#42334f' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: 0.72 }, saveButton: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' }, saveLabel: { color: accent, fontSize: 16, fontWeight: '700' },
  empty: { gap: 23, paddingTop: 26 }, eyebrow: { fontSize: 10, letterSpacing: 1.1, fontWeight: '700', color: '#746580', marginBottom: 2 }, emptyTitle: { fontSize: 34, lineHeight: 41, letterSpacing: -1, fontWeight: '600', color: '#342440' }, emptyBody: { color: '#796d83', fontSize: 15, lineHeight: 24 }, secondary: { color: '#796d83', fontSize: 12, lineHeight: 19 },
  example: { backgroundColor: '#efe9f5', padding: 23, gap: 14, borderRadius: 24, marginTop: 10 }, exampleMath: { flexDirection: 'row', alignItems: 'center', gap: 18, marginVertical: 9 }, exampleFormula: { fontSize: 35, fontWeight: '500', color: accent },
  primary: { minHeight: 52, backgroundColor: accent, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 14 }, primaryText: { fontWeight: '600', color: '#ffffff', fontSize: 15 },
  namePanel: { gap: 5 }, titleInput: { fontSize: 23, lineHeight: 32, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '500', color: '#342440', padding: 0, marginBottom: 4 }, sourcePanel: { gap: 0 },
  sourceActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, paddingRight: 14 }, variableRef: { color: '#604487', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  sourceGroup: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e9e1ef' }, subtaskToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 54 }, subtaskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 12, paddingLeft: 54, paddingRight: 14, paddingVertical: 8 },
  reference: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, refBadge: { minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, refLetter: { color: '#604487', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '500', fontSize: 16 },
  referenceSource: { flex: 1, gap: 4, minHeight: 44, justifyContent: 'center' }, sourceTitle: { color: '#42334f', fontWeight: '600', fontSize: 15, lineHeight: 21 }, sourceField: { color: '#716278', fontSize: 13, lineHeight: 19 }, refValue: { color: accent, fontSize: 12, lineHeight: 18 },
  formulaPanel: { backgroundColor: '#f0eaf6', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, gap: 2 }, formulaLabel: { color: '#6e5787', fontSize: 12, fontWeight: '600' }, formulaRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, equals: { fontSize: 25, color: '#a391b5', paddingTop: 8 }, formulaInput: { flex: 1, color: '#513572', fontSize: 23, lineHeight: 32, minHeight: 58, paddingVertical: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, formulaHint: { fontSize: 11, lineHeight: 17, color: '#706078', marginBottom: 5 },
  resultPanel: { paddingHorizontal: 2, paddingTop: 6, gap: 8 }, resultRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }, resultNumber: { color: '#402b55', fontSize: 44, fontWeight: '500', letterSpacing: -1, fontVariant: ['tabular-nums'] }, resultUnit: { color: '#796d83', fontSize: 16 }, unitInput: { color: '#79658c', minWidth: 65, maxWidth: '70%', fontSize: 17, paddingVertical: 5, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: '#ded4e7' },
  settingsRows: { marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e9e1ef' }, settingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 47, gap: 10, paddingVertical: 8 }, settingName: { color: '#796d83', fontSize: 12 }, settingValue: { flex: 1, color: '#53435f', textAlign: 'right', fontSize: 13 }, dateRange: { color: '#75657e', fontSize: 11, marginTop: 9 },
  error: { color: '#a13c52', fontSize: 12, lineHeight: 19 }, inspect: { flexDirection: 'row', gap: 9, alignItems: 'center', minHeight: 48, justifyContent: 'center' }, textAction: { minHeight: 44, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 5 }, textActionLabel: { color: accent, fontWeight: '500', fontSize: 13 }, smallAction: { color: accent, fontSize: 11 },
  widget: { backgroundColor: '#ffffff', borderRadius: 22, padding: 21, gap: 6, borderWidth: 1, borderColor: '#ece5f1' }, widgetTitle: { color: '#42334f', fontSize: 19, fontWeight: '600' }, periodLabel: { color: '#796d83', fontSize: 12 }, widgetFooter: { borderTopWidth: 1, borderTopColor: '#f0eaf4', paddingTop: 13, marginTop: 9, gap: 6 }, smallFormula: { color: '#69517d', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 }, sourceCaption: { color: '#796d83', fontSize: 11, lineHeight: 17 }, miniRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }, miniValue: { color: '#53435f', fontSize: 13 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,19,43,0.3)' }, sheet: { maxHeight: '92%', backgroundColor: '#fcfafd', borderTopLeftRadius: 26, borderTopRightRadius: 26, flexShrink: 1 }, sheetHandle: { alignSelf: 'center', width: 35, height: 4, borderRadius: 3, backgroundColor: '#d6ccdf', marginTop: 10, marginBottom: 6 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 8 }, sheetTitle: { color: '#42334f', fontSize: 20, fontWeight: '600' }, sheetContent: { paddingHorizontal: 23, paddingBottom: 20, gap: 16 },
  guideSheet: { flex: 1, maxHeight: '100%' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: '#f0ebf5', paddingHorizontal: 13 }, searchInput: { flex: 1, minHeight: 48, color: '#42334f', fontSize: 14 }, taskRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: '#eee8f3', paddingVertical: 10 }, avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#eee7f4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: '100%', height: '100%' }, emoji: { fontSize: 23 }, selectedCard: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 4 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 60, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#eee8f3' }, optionTitle: { color: '#42334f', fontSize: 15, lineHeight: 22, fontWeight: '500' }, danger: { color: '#a13c52', fontSize: 14 }, recipe: { gap: 8, backgroundColor: '#f0eaf6', padding: 15, borderRadius: 14 }, recipeFormula: { color: accent, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, lineHeight: 21 }, functionRow: { flexDirection: 'row', gap: 13 }, functionName: { color: accent, fontSize: 11, minWidth: 95, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', paddingTop: 2 },
  rangeField: { gap: 8 }, dateInput: { minHeight: 49, backgroundColor: '#f0ebf5', borderRadius: 12, paddingHorizontal: 13, fontSize: 16, color: '#42334f' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee8f3', minHeight: 41, alignItems: 'center' }, tableHeading: { backgroundColor: '#f0ebf5' }, dateCell: { width: 112, padding: 10, color: '#796d83', fontSize: 12 }, valueCell: { flex: 1, minWidth: 76, textAlign: 'right', color: '#53435f', padding: 10, fontSize: 13, fontVariant: ['tabular-nums'] },
});
