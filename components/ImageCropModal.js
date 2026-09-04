import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { getPickedImageExtension } from '../utils/imageUtils';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampCropTransform,
  getCoverDimensions,
  getSquareCropRect,
} from '../utils/imageCropUtils';

const ZOOM_STEP = 0.3;
const SLIDER_THUMB_SIZE = 18;

const getTouchCenter = (touches) => {
  if (!touches || touches.length < 2) {
    return null;
  }
  const [first, second] = touches;
  return {
    pageX: (first.pageX + second.pageX) / 2,
    pageY: (first.pageY + second.pageY) / 2,
    localX: (first.locationX + second.locationX) / 2,
    localY: (first.locationY + second.locationY) / 2,
  };
};

const getTouchDistance = (touches) => {
  if (!touches || touches.length < 2) {
    return null;
  }
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
};

const getOutputFormat = (asset) => {
  const extension = getPickedImageExtension(asset);
  if (extension === 'png') {
    return { format: SaveFormat.PNG, mimeType: 'image/png', extension: 'png' };
  }
  if (extension === 'webp') {
    return { format: SaveFormat.WEBP, mimeType: 'image/webp', extension: 'webp' };
  }
  return { format: SaveFormat.JPEG, mimeType: 'image/jpeg', extension: 'jpg' };
};

function ImageCropModal({
  visible,
  asset,
  onCancel,
  onConfirm,
  onError,
  strings = {},
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const frameSize = Math.max(
    180,
    Math.min(windowWidth - 32, windowHeight - 310, 420)
  );
  const [sourceSize, setSourceSize] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(0);
  const scaleValue = useRef(new Animated.Value(MIN_ZOOM)).current;
  const translateXValue = useRef(new Animated.Value(0)).current;
  const translateYValue = useRef(new Animated.Value(0)).current;
  const transformRef = useRef({
    scale: MIN_ZOOM,
    translateX: 0,
    translateY: 0,
  });
  const gestureRef = useRef({ mode: null });

  useEffect(() => {
    if (!asset?.uri) {
      setSourceSize(null);
      return undefined;
    }
    const assetWidth = Number(asset.width);
    const assetHeight = Number(asset.height);
    if (assetWidth > 0 && assetHeight > 0) {
      setSourceSize({ width: assetWidth, height: assetHeight });
      return undefined;
    }

    let active = true;
    Image.getSize(
      asset.uri,
      (width, height) => {
        if (active) {
          setSourceSize({ width, height });
        }
      },
      (error) => {
        if (active) {
          onError?.(error);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [asset?.height, asset?.uri, asset?.width, onError]);

  const imageDimensions = useMemo(
    () =>
      sourceSize
        ? getCoverDimensions(sourceSize.width, sourceSize.height, frameSize)
        : { width: frameSize, height: frameSize },
    [frameSize, sourceSize]
  );

  const commitTransform = useCallback(
    (nextTransform) => {
      const clamped = clampCropTransform({
        ...nextTransform,
        imageWidth: imageDimensions.width,
        imageHeight: imageDimensions.height,
        frameSize,
      });
      transformRef.current = clamped;
      scaleValue.setValue(clamped.scale);
      translateXValue.setValue(clamped.translateX);
      translateYValue.setValue(clamped.translateY);
      return clamped;
    },
    [frameSize, imageDimensions.height, imageDimensions.width, scaleValue, translateXValue, translateYValue]
  );

  const resetTransform = useCallback(() => {
    commitTransform({ scale: MIN_ZOOM, translateX: 0, translateY: 0 });
  }, [commitTransform]);

  useEffect(() => {
    setIsProcessing(false);
    resetTransform();
  }, [asset?.uri, frameSize, resetTransform]);

  const setZoom = useCallback(
    (nextScale) => {
      const current = transformRef.current;
      const boundedScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
      const ratio = boundedScale / current.scale;
      commitTransform({
        scale: boundedScale,
        translateX: current.translateX * ratio,
        translateY: current.translateY * ratio,
      });
    },
    [commitTransform]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isProcessing,
        onMoveShouldSetPanResponder: () => !isProcessing,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          const center = getTouchCenter(touches);
          const distance = getTouchDistance(touches);
          const current = transformRef.current;

          if (center && distance) {
            gestureRef.current = {
              mode: 'pinch',
              startDistance: distance,
              startScale: current.scale,
              startTranslateX: current.translateX,
              startTranslateY: current.translateY,
              startPageX: center.pageX,
              startPageY: center.pageY,
              focalX: center.localX - frameSize / 2,
              focalY: center.localY - frameSize / 2,
            };
            return;
          }

          const touch = touches?.[0];
          gestureRef.current = {
            mode: 'pan',
            startTranslateX: current.translateX,
            startTranslateY: current.translateY,
            startPageX: touch?.pageX ?? event.nativeEvent.pageX,
            startPageY: touch?.pageY ?? event.nativeEvent.pageY,
          };
        },
        onPanResponderMove: (event) => {
          const touches = event.nativeEvent.touches;
          const center = getTouchCenter(touches);
          const distance = getTouchDistance(touches);
          const current = transformRef.current;

          if (center && distance) {
            if (gestureRef.current.mode !== 'pinch') {
              gestureRef.current = {
                mode: 'pinch',
                startDistance: distance,
                startScale: current.scale,
                startTranslateX: current.translateX,
                startTranslateY: current.translateY,
                startPageX: center.pageX,
                startPageY: center.pageY,
                focalX: center.localX - frameSize / 2,
                focalY: center.localY - frameSize / 2,
              };
              return;
            }

            const gesture = gestureRef.current;
            const nextScale = Math.min(
              MAX_ZOOM,
              Math.max(MIN_ZOOM, gesture.startScale * (distance / gesture.startDistance))
            );
            const scaleRatio = nextScale / gesture.startScale;
            commitTransform({
              scale: nextScale,
              translateX:
                gesture.startTranslateX +
                (center.pageX - gesture.startPageX) +
                (1 - scaleRatio) * (gesture.focalX - gesture.startTranslateX),
              translateY:
                gesture.startTranslateY +
                (center.pageY - gesture.startPageY) +
                (1 - scaleRatio) * (gesture.focalY - gesture.startTranslateY),
            });
            return;
          }

          const touch = touches?.[0];
          if (!touch) {
            return;
          }
          if (gestureRef.current.mode !== 'pan') {
            gestureRef.current = {
              mode: 'pan',
              startTranslateX: current.translateX,
              startTranslateY: current.translateY,
              startPageX: touch.pageX,
              startPageY: touch.pageY,
            };
            return;
          }
          const gesture = gestureRef.current;
          commitTransform({
            scale: current.scale,
            translateX: gesture.startTranslateX + touch.pageX - gesture.startPageX,
            translateY: gesture.startTranslateY + touch.pageY - gesture.startPageY,
          });
        },
        onPanResponderRelease: () => {
          gestureRef.current = { mode: null };
        },
        onPanResponderTerminate: () => {
          gestureRef.current = { mode: null };
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [commitTransform, frameSize, isProcessing]
  );

  const handleSliderPress = useCallback(
    (event) => {
      if (!sliderWidth || isProcessing) {
        return;
      }
      const progress = Math.min(1, Math.max(0, event.nativeEvent.locationX / sliderWidth));
      setZoom(MIN_ZOOM + progress * (MAX_ZOOM - MIN_ZOOM));
    },
    [isProcessing, setZoom, sliderWidth]
  );

  const handleApply = useCallback(async () => {
    if (!asset?.uri || !sourceSize || isProcessing) {
      return;
    }
    try {
      setIsProcessing(true);
      const crop = getSquareCropRect({
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        imageWidth: imageDimensions.width,
        imageHeight: imageDimensions.height,
        frameSize,
        ...transformRef.current,
      });
      const output = getOutputFormat(asset);
      const result = await manipulateAsync(asset.uri, [{ crop }], {
        compress: 1,
        format: output.format,
      });
      await onConfirm?.({
        ...asset,
        uri: result.uri,
        width: result.width,
        height: result.height,
        fileName: `cropped.${output.extension}`,
        mimeType: output.mimeType,
        fileSize: undefined,
      });
    } catch (error) {
      onError?.(error);
    } finally {
      setIsProcessing(false);
    }
  }, [asset, frameSize, imageDimensions.height, imageDimensions.width, isProcessing, onConfirm, onError, sourceSize]);

  const title = strings.cropTitle ?? 'Adjust image';
  const hint = strings.cropHint ?? 'Drag to reposition and pinch to zoom';
  const cancelLabel = strings.cropCancel ?? 'Cancel';
  const applyLabel = strings.cropApply ?? 'Apply';
  const resetLabel = strings.cropReset ?? 'Reset';
  const zoomOutLabel = strings.cropZoomOut ?? 'Zoom out';
  const zoomInLabel = strings.cropZoomIn ?? 'Zoom in';
  const sliderTravel = Math.max(0, sliderWidth - SLIDER_THUMB_SIZE);
  const sliderTranslate = scaleValue.interpolate({
    inputRange: [MIN_ZOOM, MAX_ZOOM],
    outputRange: [0, sliderTravel],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      animationType="fade"
      presentationStyle="fullScreen"
      visible={Boolean(visible && asset?.uri)}
      onRequestClose={() => {
        if (!isProcessing) {
          onCancel?.();
        }
      }}
    >
      <SafeAreaView style={cropStyles.container}>
        <View style={cropStyles.header}>
          <Pressable
            style={cropStyles.headerSide}
            onPress={onCancel}
            disabled={isProcessing}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            <Text style={cropStyles.cancelText}>{cancelLabel}</Text>
          </Pressable>
          <Text style={cropStyles.title}>{title}</Text>
          <Pressable
            style={[cropStyles.applyButton, isProcessing && cropStyles.applyButtonDisabled]}
            onPress={handleApply}
            disabled={isProcessing || !sourceSize}
            accessibilityRole="button"
            accessibilityLabel={applyLabel}
            accessibilityState={{ busy: isProcessing, disabled: isProcessing || !sourceSize }}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={cropStyles.applyText}>{applyLabel}</Text>
            )}
          </Pressable>
        </View>

        <View style={cropStyles.content}>
          <Text style={cropStyles.hint}>{hint}</Text>
          <View
            style={[cropStyles.frame, { width: frameSize, height: frameSize }]}
            {...panResponder.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel={hint}
          >
            {sourceSize ? (
              <Animated.Image
                source={{ uri: asset?.uri }}
                style={{
                  position: 'absolute',
                  left: (frameSize - imageDimensions.width) / 2,
                  top: (frameSize - imageDimensions.height) / 2,
                  width: imageDimensions.width,
                  height: imageDimensions.height,
                  transform: [
                    { translateX: translateXValue },
                    { translateY: translateYValue },
                    { scale: scaleValue },
                  ],
                }}
                resizeMode="cover"
              />
            ) : (
              <ActivityIndicator size="large" color="#FFFFFF" />
            )}
            <View pointerEvents="none" style={[cropStyles.gridLine, cropStyles.gridVerticalOne]} />
            <View pointerEvents="none" style={[cropStyles.gridLine, cropStyles.gridVerticalTwo]} />
            <View pointerEvents="none" style={[cropStyles.gridLine, cropStyles.gridHorizontalOne]} />
            <View pointerEvents="none" style={[cropStyles.gridLine, cropStyles.gridHorizontalTwo]} />
            <View pointerEvents="none" style={cropStyles.frameBorder} />
          </View>

          <View style={cropStyles.zoomControls}>
            <Pressable
              style={cropStyles.zoomButton}
              onPress={() => setZoom(transformRef.current.scale - ZOOM_STEP)}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={zoomOutLabel}
            >
              <Ionicons name="remove" size={20} color="#E7E5EF" />
            </Pressable>
            <Pressable
              style={cropStyles.sliderTouchArea}
              onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
              onPress={handleSliderPress}
              disabled={isProcessing}
              accessibilityRole="adjustable"
              accessibilityLabel={strings.cropZoom ?? 'Zoom'}
              accessibilityValue={{
                min: MIN_ZOOM,
                max: MAX_ZOOM,
                now: Math.round(transformRef.current.scale),
              }}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'increment') {
                  setZoom(transformRef.current.scale + ZOOM_STEP);
                } else if (event.nativeEvent.actionName === 'decrement') {
                  setZoom(transformRef.current.scale - ZOOM_STEP);
                }
              }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            >
              <View style={cropStyles.sliderTrack} />
              <Animated.View
                pointerEvents="none"
                style={[cropStyles.sliderThumb, { transform: [{ translateX: sliderTranslate }] }]}
              />
            </Pressable>
            <Pressable
              style={cropStyles.zoomButton}
              onPress={() => setZoom(transformRef.current.scale + ZOOM_STEP)}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel={zoomInLabel}
            >
              <Ionicons name="add" size={20} color="#E7E5EF" />
            </Pressable>
          </View>

          <Pressable
            style={cropStyles.resetButton}
            onPress={resetTransform}
            disabled={isProcessing}
            accessibilityRole="button"
            accessibilityLabel={resetLabel}
          >
            <Ionicons name="refresh-outline" size={17} color="#C9C5D8" />
            <Text style={cropStyles.resetText}>{resetLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const cropStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#17151D',
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#37333F',
  },
  headerSide: {
    minWidth: 74,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelText: {
    color: '#C9C5D8',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  applyButton: {
    minWidth: 74,
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#6C5CE7',
  },
  applyButtonDisabled: {
    opacity: 0.65,
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 22,
  },
  hint: {
    color: '#AAA5B7',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
  },
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#0A090D',
  },
  frameBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 22,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridVerticalOne: {
    left: '33.333%',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridVerticalTwo: {
    left: '66.666%',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridHorizontalOne: {
    top: '33.333%',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  gridHorizontalTwo: {
    top: '66.666%',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  zoomControls: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  zoomButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#292631',
  },
  sliderTouchArea: {
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    marginHorizontal: SLIDER_THUMB_SIZE / 2,
    borderRadius: 2,
    backgroundColor: '#4B4655',
  },
  sliderThumb: {
    position: 'absolute',
    left: 0,
    width: SLIDER_THUMB_SIZE,
    height: SLIDER_THUMB_SIZE,
    borderRadius: SLIDER_THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#6C5CE7',
  },
  resetButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  resetText: {
    color: '#C9C5D8',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default ImageCropModal;
