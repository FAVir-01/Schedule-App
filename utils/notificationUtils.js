const replaceTitlePlaceholder = (template, title) =>
  `${template ?? ''}`.split('{title}').join(title);

export const buildTaskReminderContent = (
  task,
  notificationTranslations,
  privateContent = true
) => {
  const strings = notificationTranslations ?? {};
  const fallbackBody = strings.reminderFallbackBody ?? '';
  const body = privateContent
    ? strings.privateReminderBody ?? fallbackBody
    : task?.title
      ? replaceTitlePlaceholder(strings.reminderBody, task.title)
      : fallbackBody;

  return {
    title: strings.reminderTitle ?? '',
    body,
  };
};

export const scheduledReminderContentMatches = (scheduledContent, expectedContent) =>
  scheduledContent?.title === expectedContent?.title &&
  scheduledContent?.body === expectedContent?.body;
