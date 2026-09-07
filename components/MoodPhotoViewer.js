import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { styles } from '../styles/appStyles';
import PinchToZoomImage from './PinchToZoomImage';

// Visualizador das fotos do dia: a foto tocada abre em tela cheia e as outras
// ficam a um arrastar de distância. Com o dedo parado o toque fecha; com dois
// dedos a PinchToZoomImage segura o gesto e o carrossel não rouba a pinça.
function MoodPhotoViewer({
  photos,
  initialIndex = 0,
  visible,
  onClose,
  closeLabel,
  positionLabel,
}) {
  const { width } = useWindowDimensions();
  const list = Array.isArray(photos) ? photos : [];
  const [index, setIndex] = useState(initialIndex);
  const listRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setIndex(Math.min(Math.max(initialIndex, 0), Math.max(list.length - 1, 0)));
    }
  }, [initialIndex, list.length, visible]);

  const handleMomentumEnd = useCallback(
    (event) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      setIndex(Math.min(Math.max(page, 0), Math.max(list.length - 1, 0)));
    },
    [list.length, width]
  );

  if (!visible || !list.length) {
    return null;
  }

  const currentLabel = `${positionLabel ?? ''}`
    .replace('{index}', String(index + 1))
    .replace('{count}', String(list.length));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.reportPhotoViewerOverlay}>
        <Pressable
          style={styles.reportPhotoViewerBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <FlatList
          ref={listRef}
          data={list}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(uri) => uri}
          initialScrollIndex={Math.min(initialIndex, list.length - 1)}
          getItemLayout={(_, itemIndex) => ({
            length: width,
            offset: width * itemIndex,
            index: itemIndex,
          })}
          onMomentumScrollEnd={handleMomentumEnd}
          renderItem={({ item }) => (
            <View style={[styles.moodPhotoViewerPage, { width }]}>
              <PinchToZoomImage
                source={{ uri: item }}
                style={styles.reportPhotoViewerImage}
                resizeMode="contain"
                onPress={onClose}
                accessibilityLabel={closeLabel}
              />
            </View>
          )}
        />
        {list.length > 1 ? (
          <View style={styles.moodPhotoViewerCounter} pointerEvents="none">
            <Text style={styles.moodPhotoViewerCounterText} accessibilityLabel={currentLabel}>
              {`${index + 1}/${list.length}`}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export default MoodPhotoViewer;
