// Aba Discover — esvaziada de propósito.
//
// O conteúdo antigo (catálogo de rotinas prontas) foi removido junto com
// `constants/taskTemplates.js` e a metade de `utils/templateUtils.js` que o
// alimentava. O que sobrou do assunto template é só a migração de dados das
// tarefas já gravadas no aparelho, que roda no boot e não tem nada a ver com
// esta tela.
//
// O que entra aqui ainda não foi decidido.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { translations } from '../constants/i18n';

export default function DiscoverScreen({ language = 'en' }) {
  const t = (translations[language] ?? translations.en).discover;

  return (
    <SafeAreaView style={localStyles.screen} edges={['top']}>
      <View style={localStyles.empty}>
        <Text style={localStyles.title}>{t.title}</Text>
        <Text style={localStyles.description}>{t.description}</Text>
      </View>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#59636f',
    textAlign: 'center',
  },
});
