import React from 'react';
import { ImageBackground, Text } from 'react-native';
import { format } from 'date-fns';
import { getMonthImageSource } from '../constants/months';
import { getDateLocale } from '../constants/i18n';
import { styles } from '../styles/appStyles';

// --- COMPONENTE DA FAIXA DO TOPO ---
const StickyMonthHeader = ({ date, customImages, language }) => {
  if (!date) return null;

  const monthIndex = date.getMonth();
  const imageSource = getMonthImageSource(monthIndex, customImages);

  return (
    <ImageBackground
      source={imageSource}
      style={styles.stickyHeader}
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
