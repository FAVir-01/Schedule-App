import React from 'react';
import { ImageBackground, Text } from 'react-native';
import { format } from 'date-fns';
import { getMonthImageSource, getMonthReducedMotionColor } from '../constants/months';
import { getDateLocale } from '../constants/i18n';
import { styles } from '../styles/appStyles';

// --- COMPONENTE DA FAIXA DO TOPO ---
const StickyMonthHeader = ({
  date,
  customImages,
  language,
  animateImage = false,
  reduceMotion = false,
}) => {
  if (!date) return null;

  const monthIndex = date.getMonth();
  const imageSource = getMonthImageSource(monthIndex, customImages, {
    animate: animateImage,
    reduceMotion,
  });
  const reducedMotionColor = getMonthReducedMotionColor(monthIndex);

  return (
    <ImageBackground
      source={imageSource}
      style={[styles.stickyHeader, { backgroundColor: reducedMotionColor }]}
      imageStyle={{ resizeMode: 'cover' }}
    >
      {/* Overlay removido aqui */}
      <Text style={styles.stickyHeaderText}>
        {format(date, 'MMMM', { locale: getDateLocale(language) })}
      </Text>
    </ImageBackground>
  );
};

export default StickyMonthHeader;
