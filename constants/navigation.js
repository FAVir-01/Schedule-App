const LEFT_TABS = [
  {
    key: 'today',
    label: 'Today',
    icon: 'time-outline',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    icon: 'calendar-clear-outline',
  },
];

const RIGHT_TABS = [
  {
    key: 'discover',
    label: 'Discover',
    icon: 'compass-outline',
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: 'person-outline',
  },
];

const NAV_BAR_THEMES = {
  today: {
    buttonStyle: 'dark',
  },
  calendar: {
    buttonStyle: 'dark',
  },
  discover: {
    buttonStyle: 'dark',
  },
  profile: {
    buttonStyle: 'dark',
  },
};

const DEFAULT_NAV_BAR_THEME = NAV_BAR_THEMES.calendar;

const getNavigationBarThemeForTab = (tabKey) => NAV_BAR_THEMES[tabKey] ?? DEFAULT_NAV_BAR_THEME;

export {
  DEFAULT_NAV_BAR_THEME,
  LEFT_TABS,
  NAV_BAR_THEMES,
  RIGHT_TABS,
  getNavigationBarThemeForTab,
};
