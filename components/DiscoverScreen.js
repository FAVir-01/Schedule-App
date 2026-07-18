import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TASK_TEMPLATE_COLLECTIONS, getTaskTemplateCollection } from '../constants/taskTemplates';
import { translations } from '../constants/i18n';
import {
  getImportedTemplateTaskKeys,
  getTemplateTaskSourceKey,
} from '../utils/templateUtils';

const replaceCount = (template, count) =>
  `${template ?? ''}`.replace('{count}', String(count));

const getSelectedCountLabel = (labels, count) =>
  replaceCount(count === 1 ? labels.selectedOne : labels.selectedMany, count);

export function FirstRunOnboarding({
  visible,
  language = 'en',
  onExploreTemplates,
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
            onPress={onExploreTemplates}
            accessibilityRole="button"
          >
            <Text style={localStyles.primaryButtonText}>{t.exploreTemplates}</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </Pressable>
          <Pressable
            style={localStyles.secondaryButton}
            onPress={onCreateTask}
            accessibilityRole="button"
          >
            <Text style={localStyles.secondaryButtonText}>{t.createMyOwn}</Text>
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

export default function DiscoverScreen({
  language = 'en',
  tasks = [],
  onImportTemplate,
  onCreateTask,
  onViewToday,
}) {
  const t = (translations[language] ?? translations.en).discover;
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const importedTaskKeys = useMemo(() => getImportedTemplateTaskKeys(tasks), [tasks]);
  const selectedTemplate = useMemo(
    () => getTaskTemplateCollection(selectedTemplateId),
    [selectedTemplateId]
  );
  const selectedTemplateText = selectedTemplateId
    ? t.templates[selectedTemplateId]
    : null;

  const isTaskImported = useCallback(
    (templateId, taskId) =>
      importedTaskKeys.has(getTemplateTaskSourceKey(templateId, taskId)),
    [importedTaskKeys]
  );

  const closeTemplate = useCallback(() => {
    setSelectedTemplateId(null);
    setSelectedTaskIds([]);
  }, []);

  const openTemplate = useCallback(
    (templateId) => {
      const template = getTaskTemplateCollection(templateId);
      if (!template) {
        return;
      }
      setSelectedTemplateId(templateId);
      setSelectedTaskIds(
        template.tasks
          .filter((task) => !isTaskImported(templateId, task.id))
          .map((task) => task.id)
      );
    },
    [isTaskImported]
  );

  const toggleTask = useCallback(
    (taskId) => {
      if (!selectedTemplate || isTaskImported(selectedTemplate.id, taskId)) {
        return;
      }
      setSelectedTaskIds((previous) =>
        previous.includes(taskId)
          ? previous.filter((id) => id !== taskId)
          : [...previous, taskId]
      );
    },
    [isTaskImported, selectedTemplate]
  );

  const selectAllAvailable = useCallback(() => {
    if (!selectedTemplate) {
      return;
    }
    setSelectedTaskIds(
      selectedTemplate.tasks
        .filter((task) => !isTaskImported(selectedTemplate.id, task.id))
        .map((task) => task.id)
    );
  }, [isTaskImported, selectedTemplate]);

  const clearSelection = useCallback(() => setSelectedTaskIds([]), []);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    const availableIds = new Set(
      selectedTemplate.tasks
        .filter((task) => !isTaskImported(selectedTemplate.id, task.id))
        .map((task) => task.id)
    );
    setSelectedTaskIds((previous) => previous.filter((taskId) => availableIds.has(taskId)));
  }, [isTaskImported, selectedTemplate]);

  const handleImport = useCallback(() => {
    if (!selectedTemplate || selectedTaskIds.length === 0) {
      return;
    }
    const importedCount = onImportTemplate?.(selectedTemplate.id, selectedTaskIds) ?? 0;
    if (importedCount <= 0) {
      return;
    }
    closeTemplate();
    const successMessage = replaceCount(
      importedCount === 1 ? t.importedOne : t.importedMany,
      importedCount
    );
    AccessibilityInfo.announceForAccessibility(successMessage);
    Alert.alert(t.importedTitle, successMessage, [
      { text: t.keepExploring, style: 'cancel' },
      { text: t.viewToday, onPress: onViewToday },
    ]);
  }, [
    closeTemplate,
    onImportTemplate,
    onViewToday,
    selectedTaskIds,
    selectedTemplate,
    t.importedMany,
    t.importedOne,
    t.importedTitle,
    t.keepExploring,
    t.viewToday,
  ]);

  return (
    <>
      <ScrollView
        style={localStyles.screen}
        contentContainerStyle={localStyles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={localStyles.headerRow}>
          <View style={localStyles.headerIcon}>
            <Ionicons name="compass-outline" size={25} color="#3c2ba7" />
          </View>
          <View style={localStyles.headerText}>
            <Text style={localStyles.eyebrow}>{t.eyebrow}</Text>
            <Text style={localStyles.title}>{t.title}</Text>
          </View>
        </View>
        <Text style={localStyles.description}>{t.description}</Text>

        <View style={localStyles.guidanceCard}>
          <View style={localStyles.guidanceIcon}>
            <Ionicons name="leaf-outline" size={21} color="#2b8a3e" />
          </View>
          <View style={localStyles.guidanceText}>
            <Text style={localStyles.guidanceTitle}>{t.startSmallTitle}</Text>
            <Text style={localStyles.guidanceDescription}>{t.startSmallDescription}</Text>
          </View>
          <Pressable
            onPress={onCreateTask}
            style={localStyles.guidanceAction}
            accessibilityRole="button"
            accessibilityLabel={t.createCustom}
          >
            <Ionicons name="add" size={19} color="#3c2ba7" />
          </Pressable>
        </View>

        <View style={localStyles.sectionHeader}>
          <View>
            <Text style={localStyles.sectionTitle}>{t.collectionsTitle}</Text>
            <Text style={localStyles.sectionDescription}>{t.collectionsDescription}</Text>
          </View>
        </View>

        <View style={localStyles.templateList}>
          {TASK_TEMPLATE_COLLECTIONS.map((template) => {
            const templateText = t.templates[template.id];
            const importedCount = template.tasks.filter((task) =>
              isTaskImported(template.id, task.id)
            ).length;
            const allImported = importedCount === template.tasks.length;
            const statusLabel = allImported
              ? t.allAdded
              : importedCount > 0
                ? replaceCount(t.addedCount, importedCount)
                : replaceCount(t.taskCount, template.tasks.length);

            return (
              <Pressable
                key={template.id}
                style={({ pressed }) => [
                  localStyles.templateCard,
                  pressed && localStyles.templateCardPressed,
                ]}
                onPress={() => openTemplate(template.id)}
                accessibilityRole="button"
                accessibilityLabel={`${templateText.title}. ${templateText.description}. ${statusLabel}`}
              >
                <View style={localStyles.templateTopRow}>
                  <View
                    style={[
                      localStyles.templateIcon,
                      { backgroundColor: template.background },
                    ]}
                  >
                    <Ionicons name={template.icon} size={25} color={template.accent} />
                  </View>
                  <View style={localStyles.templateTitleArea}>
                    <Text style={localStyles.templateTitle}>{templateText.title}</Text>
                    <Text
                      style={[
                        localStyles.templateStatus,
                        allImported && localStyles.templateStatusComplete,
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#8c91a7" />
                </View>
                <Text style={localStyles.templateDescription}>{templateText.description}</Text>
                <View style={localStyles.templateTaskPreview}>
                  {template.tasks.map((task) => (
                    <View key={task.id} style={localStyles.templateTaskChip}>
                      <Text style={localStyles.templateTaskEmoji}>{task.emoji}</Text>
                      <Text style={localStyles.templateTaskChipText} numberOfLines={1}>
                        {templateText.tasks[task.id].title}
                      </Text>
                      {isTaskImported(template.id, task.id) ? (
                        <Ionicons name="checkmark-circle" size={15} color="#2f9e44" />
                      ) : null}
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedTemplate)}
        animationType="slide"
        onRequestClose={closeTemplate}
      >
        <SafeAreaView style={localStyles.previewSafeArea}>
          {selectedTemplate && selectedTemplateText ? (
            <View style={localStyles.previewContainer} accessibilityViewIsModal>
              <View style={localStyles.previewHeader}>
                <View style={localStyles.previewHeaderText}>
                  <Text style={localStyles.previewEyebrow}>{t.previewEyebrow}</Text>
                  <Text style={localStyles.previewTitle}>{selectedTemplateText.title}</Text>
                </View>
                <Pressable
                  onPress={closeTemplate}
                  style={localStyles.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel={t.closePreview}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={22} color="#1f2742" />
                </Pressable>
              </View>
              <Text style={localStyles.previewDescription}>
                {selectedTemplateText.description}
              </Text>

              <View style={localStyles.selectionToolbar}>
                <Text style={localStyles.selectionCount}>
                  {getSelectedCountLabel(t, selectedTaskIds.length)}
                </Text>
                <View style={localStyles.selectionActions}>
                  <Pressable onPress={selectAllAvailable} accessibilityRole="button">
                    <Text style={localStyles.selectionActionText}>{t.selectAll}</Text>
                  </Pressable>
                  <Pressable onPress={clearSelection} accessibilityRole="button">
                    <Text style={localStyles.selectionActionText}>{t.clearSelection}</Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView
                style={localStyles.previewList}
                contentContainerStyle={localStyles.previewListContent}
                showsVerticalScrollIndicator={false}
              >
                {selectedTemplate.tasks.map((task) => {
                  const taskText = selectedTemplateText.tasks[task.id];
                  const imported = isTaskImported(selectedTemplate.id, task.id);
                  const selected = selectedTaskIds.includes(task.id);
                  return (
                    <Pressable
                      key={task.id}
                      style={[
                        localStyles.previewTask,
                        selected && localStyles.previewTaskSelected,
                        imported && localStyles.previewTaskImported,
                      ]}
                      onPress={() => toggleTask(task.id)}
                      disabled={imported}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected || imported, disabled: imported }}
                      accessibilityLabel={`${taskText.title}. ${taskText.description}`}
                    >
                      <View style={[localStyles.previewTaskEmoji, { backgroundColor: task.color }]}> 
                        <Text style={localStyles.previewTaskEmojiText}>{task.emoji}</Text>
                      </View>
                      <View style={localStyles.previewTaskText}>
                        <Text style={localStyles.previewTaskTitle}>{taskText.title}</Text>
                        <Text style={localStyles.previewTaskDescription}>{taskText.description}</Text>
                      </View>
                      <View
                        style={[
                          localStyles.checkbox,
                          (selected || imported) && localStyles.checkboxSelected,
                        ]}
                      >
                        {selected || imported ? (
                          <Ionicons name="checkmark" size={16} color="#ffffff" />
                        ) : null}
                      </View>
                      {imported ? (
                        <Text style={localStyles.addedBadge}>{t.added}</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={localStyles.previewFooter}>
                <Text style={localStyles.previewFootnote}>{t.previewFootnote}</Text>
                <Pressable
                  style={[
                    localStyles.importButton,
                    selectedTaskIds.length === 0 && localStyles.importButtonDisabled,
                  ]}
                  onPress={handleImport}
                  disabled={selectedTaskIds.length === 0}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedTaskIds.length === 0 }}
                >
                  <Ionicons name="add-circle-outline" size={19} color="#ffffff" />
                  <Text style={localStyles.importButtonText}>
                    {replaceCount(
                      selectedTaskIds.length === 1
                        ? t.addSelectedOne
                        : t.addSelectedMany,
                      selectedTaskIds.length
                    )}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const localStyles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
  },
  screenContent: {
    paddingBottom: 108,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eeebff',
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#777d92',
  },
  title: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  description: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#5d6277',
  },
  guidanceCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dcebdc',
    backgroundColor: '#f1faf2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guidanceIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#dff3e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidanceText: {
    flex: 1,
  },
  guidanceTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#243024',
  },
  guidanceDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: '#617061',
  },
  guidanceAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dddfea',
  },
  sectionHeader: {
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1f2235',
  },
  sectionDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#74798d',
  },
  templateList: {
    gap: 12,
  },
  templateCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e5ef',
    shadowColor: '#24243a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  templateCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  templateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateTitleArea: {
    flex: 1,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#202338',
  },
  templateStatus: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '700',
    color: '#858a9e',
  },
  templateStatusComplete: {
    color: '#2f9e44',
  },
  templateDescription: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#676c80',
  },
  templateTaskPreview: {
    marginTop: 13,
    gap: 7,
  },
  templateTaskChip: {
    minHeight: 31,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: '#f7f7fb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  templateTaskEmoji: {
    fontSize: 14,
  },
  templateTaskChipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#4f5468',
  },
  previewSafeArea: {
    flex: 1,
    backgroundColor: '#f6f6fb',
  },
  previewContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  previewHeaderText: {
    flex: 1,
  },
  previewEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#777d92',
  },
  previewTitle: {
    marginTop: 5,
    fontSize: 27,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e3e3ed',
  },
  previewDescription: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 20,
    color: '#64697c',
  },
  selectionToolbar: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectionCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#555a70',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 14,
  },
  selectionActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3c2ba7',
  },
  previewList: {
    flex: 1,
  },
  previewListContent: {
    paddingBottom: 18,
    gap: 10,
  },
  previewTask: {
    position: 'relative',
    minHeight: 86,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#e1e1eb',
    backgroundColor: '#ffffff',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewTaskSelected: {
    borderColor: '#7b6fd0',
    backgroundColor: '#f8f6ff',
  },
  previewTaskImported: {
    opacity: 0.68,
  },
  previewTaskEmoji: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTaskEmojiText: {
    fontSize: 21,
  },
  previewTaskText: {
    flex: 1,
    paddingRight: 2,
  },
  previewTaskTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#24273a',
  },
  previewTaskDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#73788b',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#b5b8c6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3c2ba7',
    borderColor: '#3c2ba7',
  },
  addedBadge: {
    position: 'absolute',
    right: 12,
    bottom: 6,
    fontSize: 9,
    fontWeight: '800',
    color: '#2f9e44',
  },
  previewFooter: {
    borderTopWidth: 1,
    borderTopColor: '#e1e1eb',
    paddingTop: 12,
    paddingBottom: 8,
  },
  previewFootnote: {
    marginBottom: 10,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: '#7b8092',
  },
  importButton: {
    minHeight: 50,
    borderRadius: 17,
    backgroundColor: '#3c2ba7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
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
