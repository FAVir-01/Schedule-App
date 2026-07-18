const TASK_TEMPLATE_VERSION = 2;

const TASK_TEMPLATE_COLLECTIONS = [
  {
    id: 'morningReset',
    icon: 'sunny-outline',
    accent: '#f59f00',
    background: '#fff7db',
    tasks: [
      {
        id: 'hydrate',
        emoji: '💧',
        color: '#c8ecff',
        tag: 'healthy_lifestyle',
        type: 'default',
      },
      {
        id: 'priorities',
        emoji: '🧭',
        color: '#ddd7ff',
        tag: 'morning_routine',
        type: 'default',
      },
      {
        id: 'stretch',
        emoji: '🧘',
        color: '#d8f3dc',
        tag: 'morning_routine',
        type: 'default',
      },
    ],
  },
  {
    id: 'focusFlow',
    icon: 'flash-outline',
    accent: '#5f3dc4',
    background: '#eeebff',
    tasks: [
      {
        id: 'focusBlock',
        emoji: '🎯',
        color: '#d9d2ff',
        tag: null,
        type: 'quantum',
        quantum: {
          mode: 'timer',
          animation: 'default',
          timer: { hours: 0, minutesPart: 25 },
        },
      },
      {
        id: 'clearSpace',
        emoji: '✨',
        color: '#ffe8cc',
        tag: 'clean_room',
        type: 'default',
      },
      {
        id: 'dailyReview',
        emoji: '📝',
        color: '#d3f9d8',
        tag: null,
        type: 'default',
      },
    ],
  },
  {
    id: 'gentleEvening',
    icon: 'moon-outline',
    accent: '#4263eb',
    background: '#e7f0ff',
    tasks: [
      {
        id: 'walk',
        emoji: '🚶',
        color: '#d8f5e5',
        tag: 'healthy_lifestyle',
        type: 'quantum',
        quantum: {
          mode: 'timer',
          animation: 'default',
          timer: { hours: 0, minutesPart: 20 },
        },
      },
      {
        id: 'reflection',
        emoji: '🌱',
        color: '#e5dbff',
        tag: null,
        type: 'default',
      },
      {
        id: 'prepareSleep',
        emoji: '🌙',
        color: '#dbe4ff',
        tag: 'sleep_better',
        type: 'default',
      },
    ],
  },
];

const getTaskTemplateCollection = (templateId) =>
  TASK_TEMPLATE_COLLECTIONS.find((template) => template.id === templateId) ?? null;

export {
  TASK_TEMPLATE_COLLECTIONS,
  TASK_TEMPLATE_VERSION,
  getTaskTemplateCollection,
};
