// Modal de primeira execucao. Morava dentro do DiscoverScreen, mas nunca foi
// da aba Discover: quem renderiza e o App, e o estado dele vive nas
// configuracoes do usuario (onboardingCompleted).
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translations } from '../constants/i18n';

export default function FirstRunOnboarding({
  visible,
  language = 'en',
  onCreateTask,
  onSkip,
}) {
  const t = (translations[language] ?? translations.en).discover.onboarding;

  if (!visible) {
    return null;
  }

  const steps = [
    { icon: 'checkmark-circle-outline', title: t.planTitle, description: t.planDescription },
    { icon: 'trending-up-outline', title: t.progressTitle, description: t.progressDescription },
    { icon: 'lock-closed-outline', title: t.privateTitle, description: t.privateDescription },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onSkip}
      statusBarTranslucent
    >
      <View style={localStyles.onboardingBackdrop} accessibilityViewIsModal>
        <ScrollView
          style={localStyles.onboardingCard}
          contentContainerStyle={localStyles.onboardingCardContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={localStyles.onboardingIcon}>
            <Ionicons name="sparkles-outline" size={30} color="#3c2ba7" />
          </View>
          <Text style={localStyles.onboardingEyebrow}>{t.eyebrow}</Text>
          <Text style={localStyles.onboardingTitle}>{t.title}</Text>
          <Text style={localStyles.onboardingDescription}>{t.description}</Text>

          <View style={localStyles.onboardingSteps}>
            {steps.map((step) => (
              <View key={step.title} style={localStyles.onboardingStep}>
                <View style={localStyles.onboardingStepIcon}>
                  <Ionicons name={step.icon} size={20} color="#3c2ba7" />
                </View>
                <View style={localStyles.onboardingStepText}>
                  <Text style={localStyles.onboardingStepTitle}>{step.title}</Text>
                  <Text style={localStyles.onboardingStepDescription}>{step.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            style={localStyles.primaryButton}
            onPress={onCreateTask}
            accessibilityRole="button"
          >
            <Text style={localStyles.primaryButtonText}>{t.createMyOwn}</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </Pressable>
          <Pressable
            style={localStyles.skipButton}
            onPress={onSkip}
            accessibilityRole="button"
          >
            <Text style={localStyles.skipButtonText}>{t.notNow}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  onboardingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(25, 24, 43, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  onboardingCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    borderRadius: 28,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 18,
  },
  onboardingCardContent: {
    paddingHorizontal: 21,
    paddingTop: 24,
    paddingBottom: 18,
  },
  onboardingIcon: {
    width: 54,
    height: 54,
    borderRadius: 19,
    backgroundColor: '#eeebff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingEyebrow: {
    marginTop: 15,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#7468c3',
  },
  onboardingTitle: {
    marginTop: 5,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '800',
    color: '#1b1d2e',
  },
  onboardingDescription: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#666b7e',
  },
  onboardingSteps: {
    marginTop: 18,
    marginBottom: 18,
    gap: 12,
  },
  onboardingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  onboardingStepIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: '#f2f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingStepText: {
    flex: 1,
  },
  onboardingStepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#292c40',
  },
  onboardingStepDescription: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: '#74798c',
  },
  primaryButton: {
    minHeight: 49,
    borderRadius: 16,
    paddingHorizontal: 17,
    backgroundColor: '#3c2ba7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  secondaryButton: {
    minHeight: 44,
    marginTop: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#d9d8e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3c2ba7',
  },
  skipButton: {
    minHeight: 36,
    marginTop: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7c8091',
  },
});
