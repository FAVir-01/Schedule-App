// Exportação do diário em texto puro.
//
// O backup existe para restaurar o app; este arquivo existe para você LER o
// que escreveu, em qualquer lugar, sem depender do Favit continuar instalado.
// Por isso é .txt e não JSON: precisa abrir em qualquer aparelho, hoje e daqui
// a dez anos.
//
// A ordem é a mesma do Feed (mais recente primeiro, com cabeçalho por mês),
// para o arquivo ser reconhecível como o que a pessoa vê na tela.
//
// Módulo puro (sem React/React Native), exercitado por
// `scripts/test-domain-rules.js`.

import { format } from 'date-fns';
import { getDateLocale } from '../constants/i18n';
import { normalizeDateValue } from './dateUtils';
import { hasReflectionContent } from './moodUtils';

const SECTION_RULE = '='.repeat(46);

const capitalizeFirst = (value) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

export const getDiaryExportFileName = (exportedAt) =>
  `favit-diario-${`${exportedAt}`.slice(0, 10)}.txt`;

// Uma entrada por dia com conteúdo. Humor e tags entram mesmo sem nota: um dia
// registrado só com "Ótimo · Calmo" ainda é um registro, e descartá-lo faria o
// arquivo mentir sobre o histórico.
export const collectDiaryEntries = (dayMoods) =>
  Object.entries(dayMoods ?? {})
    .filter(([dateKey, mood]) => Boolean(normalizeDateValue(dateKey)) && hasReflectionContent(mood))
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dateKey, mood]) => ({ dateKey, mood }));

export const buildDiaryTextExport = ({
  dayMoods,
  language = 'en',
  labels,
  exportedAt = new Date().toISOString(),
} = {}) => {
  const locale = getDateLocale(language);
  const entries = collectDiaryEntries(dayMoods);
  const exportedDate = normalizeDateValue(exportedAt) ?? new Date();

  const lines = [
    labels.fileTitle,
    labels.exportedOn.replace(
      '{date}',
      format(exportedDate, 'PPP', { locale })
    ),
    entries.length === 1
      ? labels.entryCountOne
      : labels.entryCountMany.replace('{count}', String(entries.length)),
  ];

  if (entries.length === 0) {
    lines.push('', SECTION_RULE, '', labels.empty);
    return { contents: `${lines.join('\n')}\n`, entryCount: 0 };
  }

  let lastMonthKey = null;
  entries.forEach(({ dateKey, mood }) => {
    const date = normalizeDateValue(dateKey);
    const monthKey = dateKey.slice(0, 7);
    if (monthKey !== lastMonthKey) {
      lines.push('', SECTION_RULE, capitalizeFirst(format(date, 'MMMM yyyy', { locale })).toUpperCase(), SECTION_RULE);
      lastMonthKey = monthKey;
    }

    // `PPPP` é a data por extenso já localizada ("quinta-feira, 3 de setembro
    // de 2026"); montar o padrão na mão perdia os conectivos do português.
    lines.push('', capitalizeFirst(format(date, 'PPPP', { locale })));

    // Linha de resumo: humor e sentimentos marcados, quando existirem.
    const moodLabel = mood.level ? labels.levels?.[mood.level] : null;
    const tagLabels = Array.isArray(mood.tags)
      ? mood.tags.map((tag) => labels.tags?.[tag] ?? tag).filter(Boolean)
      : [];
    const summary = [moodLabel, tagLabels.length ? tagLabels.join(', ') : null]
      .filter(Boolean)
      .join(' · ');
    if (summary) {
      lines.push(summary);
    }
    if (mood.photo) {
      // A foto não cabe num .txt, mas apagar o rastro dela faria o dia parecer
      // menos do que foi. O arquivo da imagem sai no backup em pasta.
      lines.push(labels.photoAttached);
    }

    const note = `${mood.note ?? ''}`.trim();
    lines.push('', note || labels.noText);
  });

  return { contents: `${lines.join('\n')}\n`, entryCount: entries.length };
};
