import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { styles } from '../styles/appStyles';

// Grade de miniaturas que aceita reordenar arrastando. Cada quadrado é
// posicionado à mão (não pelo layout) para que a troca de lugar seja uma
// animação, e não um salto: quem sai do caminho desliza para a vaga vizinha.
const TILE_SIZE = 96;
const TILE_GAP = 10;
// Segurar antes de arrastar deixa a rolagem da folha livre no toque comum.
const LONG_PRESS_DELAY = 220;
// Folga generosa: o dedo sempre treme um pouco durante a espera, e cancelar
// por causa disso obrigava a recomeçar o gesto.
const MOVE_TOLERANCE = 14;

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 240,
  mass: 0.7,
  overshootClamping: true,
  useNativeDriver: true,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getSlot = (index, columns) => ({
  x: (index % Math.max(columns, 1)) * (TILE_SIZE + TILE_GAP),
  y: Math.floor(index / Math.max(columns, 1)) * (TILE_SIZE + TILE_GAP),
});

const isSameOrder = (left, right) =>
  left.length === right.length && left.every((uri, index) => uri === right[index]);

function PhotoTile({
  uri,
  position,
  isDragging,
  disabled,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRemove,
  removeLabel,
  reorderHint,
}) {
  const timerRef = useRef(null);
  const draggingRef = useRef(false);
  // Onde o dedo estava quando a foto foi pega: o arrasto conta a partir dali,
  // e não do toque, senão a miniatura pula o tremido da espera.
  const anchorRef = useRef({ dx: 0, dy: 0 });

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: () => {
          draggingRef.current = false;
          anchorRef.current = { dx: 0, dy: 0 };
          clearTimer();
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            draggingRef.current = true;
            onDragStart(uri);
          }, LONG_PRESS_DELAY);
        },
        onPanResponderMove: (event, gesture) => {
          if (!draggingRef.current) {
            // Moveu antes de o toque virar arrasto: era rolagem, não reordenar.
            if (
              Math.abs(gesture.dx) > MOVE_TOLERANCE ||
              Math.abs(gesture.dy) > MOVE_TOLERANCE
            ) {
              clearTimer();
            }
            anchorRef.current = { dx: gesture.dx, dy: gesture.dy };
            return;
          }
          onDragMove(
            uri,
            gesture.dx - anchorRef.current.dx,
            gesture.dy - anchorRef.current.dy
          );
        },
        onPanResponderRelease: () => {
          clearTimer();
          if (draggingRef.current) {
            draggingRef.current = false;
            onDragEnd(uri);
          }
        },
        onPanResponderTerminate: () => {
          clearTimer();
          if (draggingRef.current) {
            draggingRef.current = false;
            onDragEnd(uri);
          }
        },
        // Enquanto não virou arrasto, a folha pode rolar normalmente. Depois
        // que vira, quem para de rolar é a própria folha (scrollEnabled), o
        // que impede o ScrollView nativo de tomar o gesto no meio do caminho.
        onPanResponderTerminationRequest: () => !draggingRef.current,
        onShouldBlockNativeResponder: () => false,
      }),
    [clearTimer, disabled, onDragEnd, onDragMove, onDragStart, uri]
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.reflectionPhotoTile,
        { transform: position.getTranslateTransform() },
        isDragging && styles.reflectionPhotoTileDragging,
      ]}
      accessibilityHint={reorderHint}
    >
      <Image source={{ uri }} style={styles.reflectionPhoto} />
      <Pressable
        style={styles.reflectionPhotoRemove}
        onPress={() => onRemove?.(uri)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
      >
        <Ionicons name="close" size={16} color="#ffffff" />
      </Pressable>
    </Animated.View>
  );
}

function DraggablePhotoGrid({
  photos,
  onReorder,
  onRemove,
  onAdd,
  onDragStateChange,
  canAdd = true,
  isBusy = false,
  addLabel,
  removeLabel,
  reorderHint,
}) {
  const [columns, setColumns] = useState(3);
  const [order, setOrder] = useState(photos);
  const [draggingUri, setDraggingUri] = useState(null);
  const positionsRef = useRef(new Map());
  const orderRef = useRef(order);
  const columnsRef = useRef(columns);
  const draggingRef = useRef(null);

  orderRef.current = order;
  columnsRef.current = columns;

  // A lista de fora só volta a mandar quando ninguém está arrastando.
  useEffect(() => {
    if (draggingUri) {
      return;
    }
    setOrder((current) => (isSameOrder(current, photos) ? current : photos));
  }, [draggingUri, photos]);

  const ensurePosition = useCallback((uri, index) => {
    const positions = positionsRef.current;
    let value = positions.get(uri);
    if (!value) {
      value = new Animated.ValueXY(getSlot(index, columnsRef.current));
      positions.set(uri, value);
    }
    return value;
  }, []);

  // Cada mudança de ordem (ou de largura) reacomoda quem não está na mão.
  useEffect(() => {
    order.forEach((uri, index) => {
      const value = ensurePosition(uri, index);
      if (uri === draggingUri) {
        return;
      }
      Animated.spring(value, {
        ...SPRING_CONFIG,
        toValue: getSlot(index, columns),
      }).start();
    });
    positionsRef.current.forEach((_, uri) => {
      if (!order.includes(uri)) {
        positionsRef.current.delete(uri);
      }
    });
  }, [columns, draggingUri, ensurePosition, order]);

  const handleDragStart = useCallback(
    (uri) => {
      const index = orderRef.current.indexOf(uri);
      if (index < 0) {
        return;
      }
      draggingRef.current = { uri, origin: getSlot(index, columnsRef.current) };
      setDraggingUri(uri);
      onDragStateChange?.(true);
      void Haptics.selectionAsync().catch(() => {});
    },
    [onDragStateChange]
  );

  const handleDragMove = useCallback((uri, dx, dy) => {
    const drag = draggingRef.current;
    if (drag?.uri !== uri) {
      return;
    }
    const x = drag.origin.x + dx;
    const y = drag.origin.y + dy;
    positionsRef.current.get(uri)?.setValue({ x, y });

    const currentColumns = Math.max(columnsRef.current, 1);
    const current = orderRef.current;
    const column = clamp(Math.round(x / (TILE_SIZE + TILE_GAP)), 0, currentColumns - 1);
    const row = Math.max(0, Math.round(y / (TILE_SIZE + TILE_GAP)));
    const target = clamp(row * currentColumns + column, 0, current.length - 1);
    const from = current.indexOf(uri);
    if (from < 0 || target === from) {
      return;
    }
    const next = current.slice();
    next.splice(from, 1);
    next.splice(target, 0, uri);
    orderRef.current = next;
    setOrder(next);
    void Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleDragEnd = useCallback(
    (uri) => {
      const drag = draggingRef.current;
      draggingRef.current = null;
      setDraggingUri(null);
      onDragStateChange?.(false);
      const current = orderRef.current;
      const index = current.indexOf(uri);
      if (index >= 0) {
        Animated.spring(positionsRef.current.get(uri), {
          ...SPRING_CONFIG,
          toValue: getSlot(index, columnsRef.current),
        }).start();
      }
      if (drag && !isSameOrder(current, photos)) {
        onReorder?.(current);
      }
    },
    [onDragStateChange, onReorder, photos]
  );

  const handleLayout = useCallback((event) => {
    const width = event.nativeEvent.layout.width;
    const nextColumns = Math.max(
      1,
      Math.floor((width + TILE_GAP) / (TILE_SIZE + TILE_GAP))
    );
    setColumns((current) => (current === nextColumns ? current : nextColumns));
  }, []);

  const slotCount = order.length + (canAdd ? 1 : 0);
  const rows = Math.max(1, Math.ceil(slotCount / Math.max(columns, 1)));
  const boardHeight = rows * (TILE_SIZE + TILE_GAP) - TILE_GAP;
  const addSlot = getSlot(order.length, columns);

  return (
    <View style={[styles.reflectionPhotoBoard, { height: boardHeight }]} onLayout={handleLayout}>
      {order.map((uri, index) => (
        <PhotoTile
          key={uri}
          uri={uri}
          position={ensurePosition(uri, index)}
          isDragging={uri === draggingUri}
          disabled={isBusy || order.length < 2}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onRemove={onRemove}
          removeLabel={removeLabel}
          reorderHint={order.length > 1 ? reorderHint : undefined}
        />
      ))}
      {canAdd ? (
        <Pressable
          style={[styles.reflectionPhotoAddTile, { left: addSlot.x, top: addSlot.y }]}
          onPress={onAdd}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          accessibilityState={{ busy: isBusy, disabled: isBusy }}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#3c2ba7" />
          ) : (
            <Ionicons name="add" size={24} color="#3c2ba7" />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export default DraggablePhotoGrid;
