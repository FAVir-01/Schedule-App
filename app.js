import React, { useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const SCHEDULE_ITEMS = [
  {
    id: '1',
    day: 'Segunda',
    time: '09:00',
    title: 'Reunião de Abertura',
    description: 'Boas-vindas e apresentação da programação da semana.',
    location: 'Auditório Principal',
  },
  {
    id: '2',
    day: 'Segunda',
    time: '11:00',
    title: 'Workshop: Design Thinking',
    description: 'Aplicando técnicas de design thinking para resolver problemas.',
    location: 'Sala 2',
  },
  {
    id: '3',
    day: 'Terça',
    time: '10:00',
    title: 'Palestra: Futuro da Tecnologia',
    description: 'Tendências e novidades do mercado de tecnologia.',
    location: 'Auditório Principal',
  },
  {
    id: '4',
    day: 'Terça',
    time: '14:00',
    title: 'Mentorias Individuais',
    description: 'Sessões rápidas para tirar dúvidas com especialistas.',
    location: 'Sala 5',
  },
  {
    id: '5',
    day: 'Quarta',
    time: '09:30',
    title: 'Hands-on: React Native',
    description: 'Construindo interfaces responsivas com React Native.',
    location: 'Laboratório 1',
  },
  {
    id: '6',
    day: 'Quarta',
    time: '16:00',
    title: 'Painel: Histórias Inspiradoras',
    description: 'Profissionais compartilham suas trajetórias na área de tecnologia.',
    location: 'Auditório Principal',
  },
  {
    id: '7',
    day: 'Quinta',
    time: '08:30',
    title: 'Café com Networking',
    description: 'Momento para conhecer outros participantes e trocar experiências.',
    location: 'Hall de Entrada',
  },
  {
    id: '8',
    day: 'Quinta',
    time: '13:30',
    title: 'Sessão de Pitch',
    description: 'Apresente seu projeto e receba feedback dos mentores.',
    location: 'Sala 3',
  },
  {
    id: '9',
    day: 'Sexta',
    time: '10:00',
    title: 'Oficina: Planejamento de Carreira',
    description: 'Ferramentas para organizar metas profissionais e pessoais.',
    location: 'Sala 1',
  },
  {
    id: '10',
    day: 'Sexta',
    time: '15:00',
    title: 'Encerramento e Premiação',
    description: 'Resumo da semana e reconhecimento dos destaques.',
    location: 'Auditório Principal',
  },
];

const DAY_OPTIONS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

export default function App() {
  const [selectedDay, setSelectedDay] = useState(DAY_OPTIONS[0]);

  const events = useMemo(
    () => SCHEDULE_ITEMS.filter((item) => item.day === selectedDay),
    [selectedDay]
  );

  const renderEvent = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.cardTime}>{item.time}</Text>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>
      <Text style={styles.cardLocation}>📍 {item.location}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Programação da Semana</Text>
        <Text style={styles.headerSubtitle}>
          Selecione um dia para ver as atividades disponíveis.
        </Text>
      </View>

      <View style={styles.daySelector}>
        {DAY_OPTIONS.map((day) => {
          const isActive = selectedDay === day;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayChip, isActive && styles.dayChipActive]}
              onPress={() => setSelectedDay(day)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.dayChipText, isActive && styles.dayChipTextActive]}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        contentContainerStyle={
          events.length === 0 ? styles.emptyListContainer : styles.listContainer
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Não há atividades cadastradas para este dia ainda.
          </Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1321',
    paddingHorizontal: 24,
  },
  header: {
    paddingVertical: 24,
    gap: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f9f9f9',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#cdd0d5',
    lineHeight: 22,
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  dayChipActive: {
    backgroundColor: '#f6aa1c',
    borderColor: '#f6aa1c',
  },
  dayChipText: {
    color: '#d8dee9',
    fontWeight: '500',
  },
  dayChipTextActive: {
    color: '#0d1321',
  },
  listContainer: {
    paddingBottom: 24,
    gap: 16,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1d2333',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  cardTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f6aa1c',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9f9f9',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#cdd0d5',
    marginBottom: 12,
    lineHeight: 20,
  },
  cardLocation: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9aa0ac',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#cdd0d5',
    paddingHorizontal: 24,
  },
});
