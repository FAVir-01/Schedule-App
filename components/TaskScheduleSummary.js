import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTaskScheduleDetails } from '../utils/taskScheduleDetails';

export default function TaskScheduleSummary({ task, language = 'en' }) {
  const rows = getTaskScheduleDetails(task, language);
  if (!rows.length) return null;
  return <View style={s.container}>
    <Text style={s.title}>{language === 'pt' ? 'Dias e horários atuais' : 'Current days and times'}</Text>
    {rows.map((row, index) => <Text key={index} style={s.row}>{row}</Text>)}
  </View>;
}

const s = StyleSheet.create({
  container: { paddingVertical: 12, gap: 5 },
  title: { color: '#42334f', fontSize: 14, fontWeight: '600' },
  row: { color: '#59636f', fontSize: 13, lineHeight: 20 },
});
