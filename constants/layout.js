import { Dimensions } from 'react-native';

export const SCREEN_WIDTH = Dimensions.get('window').width;
export const CALENDAR_DAY_SIZE = Math.floor(SCREEN_WIDTH / 7);

export const WHEEL_ITEM_HEIGHT = 34;
export const WHEEL_VISIBLE_ITEMS = 3;
