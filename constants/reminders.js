const REMINDER_OPTIONS = [
  { key: 'none', label: 'No reminder' },
  { key: 'at_time', label: 'At time of event', offsetMinutes: 0 },
  { key: '5m', label: '5 minutes early', offsetMinutes: -5 },
  { key: '15m', label: '15 minutes early', offsetMinutes: -15 },
  { key: '30m', label: '30 minutes early', offsetMinutes: -30 },
  { key: '1h', label: '1 hour early', offsetMinutes: -60 },
];

export { REMINDER_OPTIONS };
