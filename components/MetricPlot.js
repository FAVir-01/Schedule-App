import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { normalizeDateValue } from '../utils/dateUtils';

export const metricNumber = (value, language) => value == null ? '—' : Number(value).toLocaleString(language === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 2 });
export const metricDate = (key, language, options) => normalizeDateValue(key)?.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', options) ?? '';

export default function MetricPlot({ result, display, language, t, compact = false }) {
  const [selection, setSelection] = useState(null);
  const [width, setWidth] = useState(320);
  const buckets = result.buckets;
  if (!buckets.length) return null;
  const chartWidth = Math.max(220, width);
  const chartHeight = compact ? 110 : 170;
  const left = 35;
  const right = chartWidth - 12;
  const top = 14;
  const bottom = chartHeight - 28;
  const finiteValues = buckets.map((bucket) => bucket.value).filter((value) => value != null);
  const min = finiteValues.reduce((value, next) => Math.min(value, next), 0);
  const max = finiteValues.reduce((value, next) => Math.max(value, next), 1);
  const y = (value) => bottom - (value - min) / (max - min) * (bottom - top);
  const x = (index) => left + (index + 0.5) / buckets.length * (right - left);
  const selected = selection == null ? null : buckets[Math.min(selection, buckets.length - 1)];
  let path = '';
  let gap = true;
  buckets.forEach((bucket, index) => {
    if (bucket.value == null) { gap = true; return; }
    path += `${gap ? 'M' : 'L'}${x(index)},${y(bucket.value)} `; gap = false;
  });
  const labels = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])];
  const dateLabel = (key) => metricDate(key, language, result.monthly ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {!compact && <Text style={s.caption}>{selected ? `${dateLabel(selected.dateKey)} · ${metricNumber(selected.value, language)}` : t.chartHint}</Text>}
    <Pressable onPress={(event) => { event.stopPropagation(); setSelection(Math.max(0, Math.min(buckets.length - 1, Math.floor((event.nativeEvent.locationX - left) / (right - left) * buckets.length)))); }}
      accessibilityRole="adjustable" accessibilityLabel={selected ? `${dateLabel(selected.dateKey)}: ${metricNumber(selected.value, language)}` : t.chartHint}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => setSelection((index) => Math.min(buckets.length - 1, Math.max(0, (index ?? 0) + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
      <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {[min, (max + min) / 2, max].map((value, index) => <React.Fragment key={index}>
          <Line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e9e6f0" strokeDasharray="3 4" />
          <SvgText x={left - 6} y={y(value) + 3} fontSize={9} textAnchor="end" fill="#747080">{metricNumber(value, language)}</SvgText>
        </React.Fragment>)}
        <Line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#bdb7cd" />
        {display === 'bars' ? buckets.map((bucket, index) => bucket.value == null ? null : <Rect key={bucket.key} x={x(index) - Math.max(1, (right - left) / buckets.length * 0.6) / 2}
          y={Math.min(y(0), y(bucket.value))} width={Math.max(1, (right - left) / buckets.length * 0.6)} height={Math.abs(y(bucket.value) - y(0))} rx={2} fill={bucket.value < 0 ? '#b55d72' : '#7661bc'} />)
          : <><Path d={path} fill="none" stroke="#6b50af" strokeWidth={2.5} strokeLinejoin="round" />{buckets.length === 1 && buckets[0].value != null && <Circle cx={x(0)} cy={y(buckets[0].value)} r={4} fill="#6b50af" />}</>}
        {selected && selected.value != null && <><Line x1={x(Math.min(selection, buckets.length - 1))} x2={x(Math.min(selection, buckets.length - 1))} y1={top} y2={bottom} stroke="#8d7cae" strokeDasharray="3 3" /><Circle cx={x(Math.min(selection, buckets.length - 1))} cy={y(selected.value)} r={4} fill="#4c367c" /></>}
        {labels.map((index) => <SvgText key={index} x={x(index)} y={chartHeight - 6} textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'} fontSize={10} fill="#747080">{dateLabel(buckets[index].dateKey)}</SvgText>)}
      </Svg>
    </Pressable>
  </View>;
}
const s = StyleSheet.create({ caption: { color: '#726b7f', fontSize: 12, marginBottom: 9, marginTop: 14 } });
