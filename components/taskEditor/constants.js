import { Platform } from 'react-native';

// Listas dos seletores de roda. Ficam fora dos componentes para não serem
// recriadas a cada render.
export const HOUR_VALUES = Array.from({ length: 12 }, (_, index) => index + 1);
export const HOUR_VALUES_24 = Array.from({ length: 24 }, (_, index) => index);
export const MINUTE_VALUES = Array.from({ length: 60 }, (_, index) => index);
export const MERIDIEM_VALUES = ['AM', 'PM'];
export const INTERVAL_VALUES = Array.from({ length: 99 }, (_, index) => index + 1);

// Altura de um item do seletor de roda. Compartilhada com os estilos porque a
// janela de selecao e a rolagem por snap dependem do mesmo numero.
export const WHEEL_ITEM_HEIGHT = 48;

export const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

export const to24Hour = ({ hour, meridiem }) => (meridiem === 'PM' ? (hour % 12) + 12 : hour % 12);
