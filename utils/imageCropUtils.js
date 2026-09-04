const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const getCoverDimensions = (sourceWidth, sourceHeight, frameSize) => {
  const safeWidth = Math.max(1, Number(sourceWidth) || 1);
  const safeHeight = Math.max(1, Number(sourceHeight) || 1);
  const safeFrameSize = Math.max(1, Number(frameSize) || 1);
  const scale = Math.max(safeFrameSize / safeWidth, safeFrameSize / safeHeight);

  return {
    width: safeWidth * scale,
    height: safeHeight * scale,
  };
};

const clampCropTransform = ({
  scale,
  translateX,
  translateY,
  imageWidth,
  imageHeight,
  frameSize,
}) => {
  const nextScale = clamp(Number(scale) || MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
  const maxTranslateX = Math.max(0, (imageWidth * nextScale - frameSize) / 2);
  const maxTranslateY = Math.max(0, (imageHeight * nextScale - frameSize) / 2);

  return {
    scale: nextScale,
    translateX: clamp(Number(translateX) || 0, -maxTranslateX, maxTranslateX),
    translateY: clamp(Number(translateY) || 0, -maxTranslateY, maxTranslateY),
  };
};

const getSquareCropRect = ({
  sourceWidth,
  sourceHeight,
  imageWidth,
  imageHeight,
  frameSize,
  scale,
  translateX,
  translateY,
}) => {
  const displayedWidth = imageWidth * scale;
  const displayedHeight = imageHeight * scale;
  const cropWidth = (frameSize / displayedWidth) * sourceWidth;
  const cropHeight = (frameSize / displayedHeight) * sourceHeight;
  const cropSize = Math.max(
    1,
    Math.min(sourceWidth, sourceHeight, Math.round(Math.min(cropWidth, cropHeight)))
  );
  const rawOriginX =
    ((displayedWidth - frameSize) / 2 - translateX) * (sourceWidth / displayedWidth);
  const rawOriginY =
    ((displayedHeight - frameSize) / 2 - translateY) * (sourceHeight / displayedHeight);

  return {
    originX: Math.round(clamp(rawOriginX, 0, sourceWidth - cropSize)),
    originY: Math.round(clamp(rawOriginY, 0, sourceHeight - cropSize)),
    width: cropSize,
    height: cropSize,
  };
};

export {
  MAX_ZOOM,
  MIN_ZOOM,
  clampCropTransform,
  getCoverDimensions,
  getSquareCropRect,
};
