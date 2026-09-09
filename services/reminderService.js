import * as Notifications from 'expo-notifications';
import { NOTIFICATIONS_SUPPORTED, REMINDER_OFFSETS } from '../constants/app';
import { getTaskOccurrencesForDate, shouldTaskAppearOnDate } from '../domain/taskSchedule';
import { normalizeDateValue } from '../utils/dateUtils';
import { scheduledReminderContentMatches } from '../utils/notificationUtils';
import { toMinutes } from '../utils/timeUtils';
import { getTimeConfigurations, hasGroupedTaskTimes } from '../utils/taskTimeUtils';

const REMINDER_QUEUE_SIZE = 8;
const REMINDER_QUEUE_REPLENISH_AT = 4;
const REMINDER_LOOKAHEAD_DAYS = 3660;
const TASK_ID_DATA_KEY = 'scheduleAppTaskId';
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const uniqueIds = (values) => [
  ...new Set(values.filter((value) => typeof value === 'string' && value.trim())),
];

const sameIds = (left, right) => {
  const normalizedLeft = uniqueIds(left).sort();
  const normalizedRight = uniqueIds(right).sort();
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
};

const isPermissionGranted = (response) => {
  const iosStatus = response?.ios?.status;
  const iosAuthorization = Notifications.IosAuthorizationStatus ?? {};
  return Boolean(
    response?.granted ||
      response?.status === 'granted' ||
      iosStatus === (iosAuthorization.AUTHORIZED ?? 2) ||
      iosStatus === (iosAuthorization.PROVISIONAL ?? 3) ||
      iosStatus === (iosAuthorization.EPHEMERAL ?? 4)
  );
};

const getReminderBaseTime = (time) => {
  if (!time?.specified) {
    return null;
  }
  if (time.mode === 'period') {
    return time.period?.start ?? null;
  }
  return time.point ?? null;
};

const isValidTime = (time) =>
  Number.isFinite(time?.hour) &&
  Number.isFinite(time?.minute) &&
  time.hour >= 1 &&
  time.hour <= 12 &&
  time.minute >= 0 &&
  time.minute <= 59 &&
  (time.meridiem === 'AM' || time.meridiem === 'PM');

const isValidDate = (date) =>
  date instanceof Date && !Number.isNaN(date.getTime());

const getOccurrenceSortValue = (occurrence) => {
  const baseTime = getReminderBaseTime(occurrence?.time);
  return isValidTime(baseTime) ? toMinutes(baseTime) : Number.MAX_SAFE_INTEGER;
};

const buildReminderDateTime = (date, timeValue, offsetMinutes) => {
  if (!date || !isValidTime(timeValue) || typeof offsetMinutes !== 'number') {
    return null;
  }
  const reminderDate = new Date(date);
  reminderDate.setHours(0, 0, 0, 0);
  reminderDate.setMinutes(toMinutes(timeValue) + offsetMinutes);
  return reminderDate;
};

const getUpcomingReminderDates = (
  task,
  now = new Date(),
  maxCount = REMINDER_QUEUE_SIZE
) => {
  const offsetMinutes = REMINDER_OFFSETS[task?.reminder] ?? null;
  const startDate = normalizeDateValue(task?.date ?? task?.dateKey);

  if (offsetMinutes === null || !isValidDate(startDate)) {
    return [];
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const initialDate = startDate > today ? startDate : today;
  const reminderDates = [];

  for (
    let offset = 0;
    offset <= REMINDER_LOOKAHEAD_DAYS && reminderDates.length < maxCount;
    offset += 1
  ) {
    const candidateDate = new Date(initialDate);
    candidateDate.setDate(candidateDate.getDate() + offset);
    if (!shouldTaskAppearOnDate(task, candidateDate)) {
      continue;
    }
    // Um dia com duas ocorrências rende dois lembretes: um antes da aula das
    // 07:20 e outro antes da das 15:20. Em ordem cronológica, porque a fila é
    // consumida do primeiro para o último e a ordem dos grupos no editor é a do
    // usuário, não a do relógio.
    const occurrences = getTaskOccurrencesForDate(task, candidateDate)
      .slice()
      .sort((left, right) => getOccurrenceSortValue(left) - getOccurrenceSortValue(right));
    for (const occurrence of occurrences) {
      if (reminderDates.length >= maxCount) {
        break;
      }
      const baseTime = getReminderBaseTime(occurrence.time);
      if (!isValidTime(baseTime)) {
        continue;
      }
      const reminderDate = buildReminderDateTime(candidateDate, baseTime, offsetMinutes);
      if (reminderDate && reminderDate > now) {
        reminderDates.push(reminderDate);
      }
    }
  }

  return reminderDates;
};

const normalizeCollection = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value instanceof Set) {
    return Array.from(value);
  }
  return [];
};

const getNativeRecurringTriggers = (task, now = new Date()) => {
  const repeat = task?.repeat;
  const offsetMinutes = REMINDER_OFFSETS[task?.reminder] ?? null;
  const baseTime = getReminderBaseTime(task?.time);
  const startDate = normalizeDateValue(task?.date ?? task?.dateKey);

  if (
    hasGroupedTaskTimes(task?.time) ||
    !repeat?.enabled ||
    repeat?.option === 'off' ||
    repeat?.endDate ||
    Number.parseInt(repeat?.interval, 10) !== 1 ||
    offsetMinutes === null ||
    !isValidTime(baseTime) ||
    !isValidDate(startDate)
  ) {
    return null;
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (startDate > today) {
    return null;
  }

  const totalMinutes = toMinutes(baseTime) + offsetMinutes;
  const dayShift = Math.floor(totalMinutes / (24 * 60));
  const minuteOfDay = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const frequency = repeat.frequency ?? repeat.option ?? 'daily';
  const triggerTypes = Notifications.SchedulableTriggerInputTypes ?? {};

  if (frequency === 'daily' || frequency === 'interval') {
    return [{ type: triggerTypes.DAILY ?? 'daily', hour, minute }];
  }

  if (frequency === 'weekly' || frequency === 'weekdays' || frequency === 'weekend') {
    let weekdays = normalizeCollection(repeat.weekdays);
    if (frequency === 'weekdays') {
      weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
    } else if (frequency === 'weekend') {
      weekdays = ['sat', 'sun'];
    } else if (weekdays.length === 0) {
      weekdays = [WEEKDAY_KEYS[startDate.getDay()]];
    }

    const weekdayNumbers = [
      ...new Set(
        weekdays
          .map((weekday) => WEEKDAY_KEYS.indexOf(weekday))
          .filter((weekday) => weekday >= 0)
          .map((weekday) => ((weekday + dayShift + 7) % 7) + 1)
      ),
    ];

    return weekdayNumbers.map((weekday) => ({
      type: triggerTypes.WEEKLY ?? 'weekly',
      weekday,
      hour,
      minute,
    }));
  }

  if (frequency === 'monthly' && dayShift === 0) {
    let monthDays = normalizeCollection(repeat.monthDays);
    if (monthDays.length === 0) {
      monthDays = [startDate.getDate()];
    }
    const days = [
      ...new Set(
        monthDays
          .map((day) => Number.parseInt(day, 10))
          .filter((day) => day >= 1 && day <= 31)
      ),
    ];
    if (days.length > REMINDER_QUEUE_SIZE) {
      return null;
    }
    return days.map((day) => ({
      type: triggerTypes.MONTHLY ?? 'monthly',
      day,
      hour,
      minute,
    }));
  }

  return null;
};

const recurringTriggerCoversDate = (trigger, date) => {
  if (!trigger || !date) {
    return false;
  }
  if (trigger.hour !== date.getHours() || trigger.minute !== date.getMinutes()) {
    return false;
  }
  const triggerTypes = Notifications.SchedulableTriggerInputTypes ?? {};
  if (trigger.type === (triggerTypes.DAILY ?? 'daily')) {
    return true;
  }
  if (trigger.type === (triggerTypes.WEEKLY ?? 'weekly')) {
    return trigger.weekday === date.getDay() + 1;
  }
  if (trigger.type === (triggerTypes.MONTHLY ?? 'monthly')) {
    return trigger.day === date.getDate();
  }
  return false;
};

export const hasTaskReminder = (task) =>
  REMINDER_OFFSETS[task?.reminder] != null;

export const getTaskNotificationIds = (taskOrIds) => {
  if (Array.isArray(taskOrIds)) {
    return uniqueIds(taskOrIds);
  }
  if (typeof taskOrIds === 'string') {
    return uniqueIds([taskOrIds]);
  }
  return uniqueIds([
    ...(Array.isArray(taskOrIds?.notificationIds) ? taskOrIds.notificationIds : []),
    taskOrIds?.notificationId,
  ]);
};

export const getTaskReminderFingerprint = (task) => {
  const normalizedDate = normalizeDateValue(task?.date);
  return JSON.stringify({
    id: task?.id ?? null,
    archived: task?.archived === true,
    date:
      task?.dateKey ??
      (isValidDate(normalizedDate) ? normalizedDate.toISOString() : null),
    reminder: task?.reminder ?? 'none',
    time: task?.time ?? null,
    repeat: task?.repeat ?? null,
  });
};

export const getTaskReminderPlan = (task, now = new Date()) => {
  if (task?.archived === true || !hasTaskReminder(task)) {
    return { status: 'disabled', mode: null, triggers: [] };
  }
  if (
    getTimeConfigurations(task?.time).length === 0 ||
    getTimeConfigurations(task?.time).some(
      (configuration) => !isValidTime(getReminderBaseTime(configuration))
    )
  ) {
    return { status: 'invalid-time', mode: null, triggers: [] };
  }

  const recurringTriggers = getNativeRecurringTriggers(task, now);
  if (recurringTriggers?.length) {
    const firstUpcomingDate = getUpcomingReminderDates(task, now, 1)[0] ?? null;
    const firstOccurrenceIsCovered = recurringTriggers.some((trigger) =>
      recurringTriggerCoversDate(trigger, firstUpcomingDate)
    );
    const dateType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
    return {
      status: 'ready',
      mode: 'recurring',
      triggers:
        firstUpcomingDate && !firstOccurrenceIsCovered
          ? [...recurringTriggers, { type: dateType, date: firstUpcomingDate }]
          : recurringTriggers,
    };
  }

  const dateType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
  const reminderDates = getUpcomingReminderDates(task, now);
  if (reminderDates.length === 0) {
    return { status: 'no-upcoming', mode: null, triggers: [] };
  }
  return {
    status: 'ready',
    mode: 'queued',
    triggers: reminderDates.map((date) => ({ type: dateType, date })),
  };
};

export const requestReminderPermission = async ({ requestIfNeeded = true } = {}) => {
  if (!NOTIFICATIONS_SUPPORTED) {
    return { status: 'unsupported' };
  }
  try {
    const currentPermission = await Notifications.getPermissionsAsync();
    if (isPermissionGranted(currentPermission)) {
      return { status: 'granted' };
    }
    if (!requestIfNeeded) {
      return { status: 'permission-denied' };
    }
    const requestedPermission = await Notifications.requestPermissionsAsync();
    return {
      status: isPermissionGranted(requestedPermission) ? 'granted' : 'permission-denied',
    };
  } catch (error) {
    return { status: 'error', error };
  }
};

const schedulePlan = async (task, plan, content) => {
  const notificationIds = [];
  try {
    for (const trigger of plan.triggers) {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          ...content,
          sound: true,
          data: {
            ...(content?.data ?? {}),
            [TASK_ID_DATA_KEY]: `${task.id}`,
          },
        },
        trigger: { ...trigger, channelId: 'default' },
      });
      notificationIds.push(notificationId);
    }
    return {
      status: 'scheduled',
      mode: plan.mode,
      notificationIds,
      notificationId: notificationIds[0] ?? null,
      fingerprint: getTaskReminderFingerprint(task),
    };
  } catch (error) {
    await cancelTaskReminders(notificationIds);
    return {
      status: 'error',
      mode: null,
      notificationIds: [],
      notificationId: null,
      fingerprint: getTaskReminderFingerprint(task),
      error,
    };
  }
};

export const scheduleTaskReminders = async (
  task,
  { requestPermission = false, content = {} } = {}
) => {
  const plan = getTaskReminderPlan(task);
  if (plan.status !== 'ready') {
    return {
      status: plan.status,
      mode: null,
      notificationIds: [],
      notificationId: null,
      fingerprint: getTaskReminderFingerprint(task),
    };
  }
  if (!NOTIFICATIONS_SUPPORTED) {
    return {
      status: 'unsupported',
      mode: null,
      notificationIds: [],
      notificationId: null,
      fingerprint: getTaskReminderFingerprint(task),
    };
  }

  const permission = await requestReminderPermission({
    requestIfNeeded: requestPermission,
  });
  if (permission.status !== 'granted') {
    return {
      status: permission.status,
      mode: null,
      notificationIds: [],
      notificationId: null,
      fingerprint: getTaskReminderFingerprint(task),
      error: permission.error,
    };
  }

  return schedulePlan(task, plan, content);
};

const getPendingRequestsForTask = (pendingRequests, task) => {
  const storedIds = new Set(getTaskNotificationIds(task));
  return pendingRequests.filter(
    (request) =>
      storedIds.has(request.identifier) ||
      `${request.content?.data?.[TASK_ID_DATA_KEY] ?? ''}` === `${task.id}`
  );
};

export const cancelTaskReminders = async (taskOrIds) => {
  if (!NOTIFICATIONS_SUPPORTED) {
    return;
  }

  let notificationIds = getTaskNotificationIds(taskOrIds);
  if (taskOrIds && !Array.isArray(taskOrIds) && typeof taskOrIds === 'object' && taskOrIds.id) {
    try {
      const pendingRequests = await Notifications.getAllScheduledNotificationsAsync();
      notificationIds = uniqueIds([
        ...notificationIds,
        ...getPendingRequestsForTask(pendingRequests, taskOrIds).map(
          (request) => request.identifier
        ),
      ]);
    } catch (error) {
      console.warn('Failed to inspect scheduled notifications before cancellation', error);
    }
  }

  await Promise.all(
    notificationIds.map(async (notificationId) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch (error) {
        console.warn('Failed to cancel notification', error);
      }
    })
  );
};

export const reconcileTaskReminderSchedules = async (
  tasks,
  { getContent = () => ({}) } = {}
) => {
  if (!NOTIFICATIONS_SUPPORTED || !Array.isArray(tasks)) {
    return { updates: [], errors: [] };
  }

  const permission = await requestReminderPermission({ requestIfNeeded: false });
  if (permission.status !== 'granted') {
    return { updates: [], errors: [], status: permission.status };
  }

  let pendingRequests;
  try {
    pendingRequests = await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    return { updates: [], errors: [{ error }], status: 'error' };
  }

  const updates = [];
  const errors = [];
  const currentTaskIds = new Set(tasks.map((task) => `${task.id}`));
  const orphanedNotificationIds = pendingRequests
    .filter((request) => {
      const taskId = request.content?.data?.[TASK_ID_DATA_KEY];
      return taskId != null && !currentTaskIds.has(`${taskId}`);
    })
    .map((request) => request.identifier);
  if (orphanedNotificationIds.length) {
    await cancelTaskReminders(orphanedNotificationIds);
  }

  for (const task of tasks) {
    const plan = getTaskReminderPlan(task);
    const expectedContent = getContent(task);
    const associatedRequests = getPendingRequestsForTask(pendingRequests, task);
    const associatedIds = uniqueIds(
      associatedRequests.map((request) => request.identifier)
    );
    const storedIds = getTaskNotificationIds(task);

    if (plan.status !== 'ready') {
      if (associatedIds.length || storedIds.length) {
        await cancelTaskReminders(uniqueIds([...associatedIds, ...storedIds]));
        updates.push({
          taskId: task.id,
          fingerprint: getTaskReminderFingerprint(task),
          notificationIds: [],
          notificationId: null,
          notificationScheduleMode: null,
        });
      }
      continue;
    }

    const expectedCount = plan.triggers.length;
    const queueMinimum = Math.min(REMINDER_QUEUE_REPLENISH_AT, expectedCount);
    const scheduledContentIsCurrent = associatedRequests.every((request) =>
      scheduledReminderContentMatches(request.content, expectedContent)
    );
    const scheduleIsHealthy =
      task.notificationScheduleMode === plan.mode &&
      scheduledContentIsCurrent &&
      (plan.mode === 'recurring'
        ? associatedIds.length === expectedCount
        : associatedIds.length >= queueMinimum);

    if (scheduleIsHealthy) {
      if (!sameIds(associatedIds, storedIds)) {
        updates.push({
          taskId: task.id,
          fingerprint: getTaskReminderFingerprint(task),
          notificationIds: associatedIds,
          notificationId: associatedIds[0] ?? null,
          notificationScheduleMode: plan.mode,
        });
      }
      continue;
    }

    await cancelTaskReminders(uniqueIds([...associatedIds, ...storedIds]));
    const result = await schedulePlan(task, plan, expectedContent);
    if (result.status === 'scheduled') {
      updates.push({
        taskId: task.id,
        fingerprint: result.fingerprint,
        notificationIds: result.notificationIds,
        notificationId: result.notificationId,
        notificationScheduleMode: result.mode,
      });
    } else {
      errors.push({ taskId: task.id, error: result.error });
      updates.push({
        taskId: task.id,
        fingerprint: getTaskReminderFingerprint(task),
        notificationIds: [],
        notificationId: null,
        notificationScheduleMode: null,
      });
    }
  }

  return { updates, errors, status: errors.length ? 'partial-error' : 'ok' };
};
