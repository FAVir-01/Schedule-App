// Regressão do componente e dos adaptadores reais do react-native-svg.
// Não simula o desenho Android: verifica os valores enviados a ele.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const root = path.resolve(__dirname, '..');
const originalJsLoader = require.extensions['.js'];
require.extensions['.js'] = (module, filename) => {
  const local = filename.startsWith(root) && !filename.includes(`${path.sep}node_modules${path.sep}`);
  const easing = /react-native[/\\]Libraries[/\\]Animated[/\\](Easing|bezier)\.js$/.test(filename);
  if (!local && !easing) return originalJsLoader(module, filename);
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-flow-strip-types', '@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx'],
  });
  module._compile(result.code, filename);
};
const Easing = require('react-native/Libraries/Animated/Easing').default;

class Value {
  constructor(value) { this.value = value; }
  setValue(value) { this.value = value; }
  interpolate(config) {
    return { config, clock: this, read: () => {
      const { inputRange: x, outputRange: y, easing } = config;
      const time = Math.max(x[0], Math.min(x[x.length - 1], this.value));
      let index = 0;
      while (index < x.length - 2 && time > x[index + 1]) index += 1;
      const progress = (time - x[index]) / (x[index + 1] - x[index]);
      return y[index] + (y[index + 1] - y[index]) * easing(progress);
    } };
  }
}
const listeners = new Set();
const animations = [];
const native = {
  View: 'View',
  StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
  Easing,
  Touchable: { Mixin: { touchableGetInitialState: () => ({}) } },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: { OS: 'android' },
  processColor: (color) => color,
  AppState: {
    currentState: 'active',
    addEventListener: (_, callback) => {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
  },
  Animated: {
    Value,
    View: 'AnimatedView',
    createAnimatedComponent: (Component) => ({ animated: Component }),
    timing: (clock, config) => {
      const animation = { clock, config, running: false,
        start() { this.running = true; }, stop() { this.running = false; } };
      animations.push(animation);
      return animation;
    },
  },
};
let harness;
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const react = {
  ...React,
  useRef: (value) => {
    const index = harness.cursor++;
    return harness.hooks[index] ||= { current: value };
  },
  useId: () => 'streak-test',
  useMemo: (fn, deps) => {
    const index = harness.cursor++;
    if (!equalDeps(harness.hooks[index]?.deps, deps)) harness.hooks[index] = { deps, value: fn() };
    return harness.hooks[index].value;
  },
  useEffect: (fn, deps) => {
    const index = harness.cursor++;
    if (equalDeps(harness.hooks[index]?.deps, deps)) return;
    const previous = harness.hooks[index];
    harness.pending.push(() => {
      previous?.cleanup?.();
      harness.hooks[index] = { deps, cleanup: fn() };
    });
  },
};
const originalLoad = Module._load;
let svg;
Module._load = (request, parent, isMain) => {
  if (request === 'react') return react;
  if (request === 'react-native') return native;
  if (request === 'react-native-svg') return svg;
  if (request.includes('/fabric/') || request.startsWith('../fabric/')) return () => null;
  return originalLoad(request, parent, isMain);
};
const SvgGroup = require('react-native-svg/lib/commonjs/elements/G').default;
const SvgText = require('react-native-svg/lib/commonjs/elements/Text').default;
svg = { __esModule: true, default: 'Svg', G: SvgGroup, Text: SvgText };
for (const name of ['Circle', 'ClipPath', 'Defs', 'LinearGradient', 'Rect', 'Stop']) svg[name] = name;
const StreakRing = require('../components/StreakRing').default;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const all = (node, predicate) => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate));
  return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
};
const render = (props) => {
  harness.cursor = 0;
  harness.pending = [];
  const tree = StreakRing(props);
  harness.pending.forEach((fn) => fn());
  return tree;
};
const newHarness = () => { harness = { cursor: 0, hooks: [], pending: [] }; };
const cleanup = () => harness.hooks.forEach((hook) => hook.cleanup?.());
const icon = React.createElement('Photo');

// Reproduz a falha anterior usando o adaptador da versão instalada: y era
// aplicado como posição E matriz, além de apagar fonte e âncora horizontal.
let sent;
const oldText = new SvgText({});
oldText.root = { setNativeProps: (props) => { sent = props; } };
oldText.setNativeProps({ y: 8 });
assert.equal(sent.matrix[5], 8);
assert.deepEqual(sent.y, [8]);
assert.deepEqual(sent.font, {});
assert.deepEqual(sent.x, []);
console.log('Reproduzido: Text.y duplicava o deslocamento e apagava fonte/âncora.');

for (const to of [1, 3, 7, 34, 1000]) {
  newHarness();
  const props = { play: 1, from: to - 1, to, contour: true, children: icon };
  const idle = render({ ...props, play: null });
  const tree = render(props);
  const animation = animations[animations.length - 1];
  const clock = animation.clock;
  assert.equal(animation.config.useNativeDriver, false);
  assert.equal(animation.config.isInteraction, false);
  assert.equal(listeners.size, 1);
  assert.equal(idle.props.children[1].type, tree.props.children[1].type);
  assert.equal(tree.props.children[1].props.children, icon);
  assert.equal(tree.props.children.length, 3);
  const texts = all(tree, (node) => node.type === SvgText);
  assert.equal(texts.length, 4);
  texts.forEach(({ props: text }) => {
    assert.equal(typeof text.y, 'number');
    assert.equal(text.fontWeight, '800');
    assert.equal(text.textAnchor, 'middle');
  });
  const groups = all(tree, (node) => node.type?.animated === SvgGroup);
  const rollGroups = groups.filter((node) => node.props.translateY);
  assert.equal(rollGroups.length, 2);
  const number = all(tree, (node) => node.type === 'AnimatedView')[0];
  const numberMotion = number.props.style[1];
  for (const [ms, opacity, y] of [[676, 0, 4], [988, 1, 0], [2184, 1, 0], [2600, 0, -3]]) {
    clock.setValue(ms);
    close(numberMotion.opacity.read(), opacity);
    close(numberMotion.transform[0].translateY.read(), y);
  }
  const clips = all(tree, (node) => node.type === 'ClipPath');
  assert.deepEqual(clips.map((node) => node.props.children.props.height), [15, 19]);
  for (const ms of [0, 1200, 1250, 1410, 1620, 2000]) {
    clock.setValue(ms);
    const y = rollGroups[0].props.translateY.read();
    assert.ok(y >= -15 && y <= 0);
    if (ms <= 1200) close(y, 0);
    if (ms >= 1620) close(y, -15);
    const group = new SvgGroup({});
    group.root = { setNativeProps: (props) => { sent = props; } };
    group.setNativeProps({ translateY: y });
    close(sent.matrix[5], y);
    assert.equal(sent.y, undefined);
    assert.equal(sent.font, undefined);
  }
  const rings = groups.filter((node) => node.props.rotation?.read);
  assert.equal(rings.length, to >= 7 ? 3 : 0);
  rings.forEach((node, index) => {
    const delay = index * 100;
    clock.setValue(delay + 240);
    close(node.props.opacity.read(), 1);
    clock.setValue(delay + 2064);
    close(node.props.opacity.read(), 1);
    clock.setValue(delay + 1008);
    const angle = node.props.rotation.read();
    close(angle, to >= 34 && index === 1 ? -370 : 190);
    const circle = node.props.children.props;
    close(circle.strokeDashoffset.read() / circle.strokeDasharray[0], -0.26);
    const group = new SvgGroup({});
    group.root = { setNativeProps: (props) => { sent = props; } };
    group.setNativeProps({ rotation: angle, opacity: 1 });
    close(sent.matrix[0], Math.cos(angle * Math.PI / 180));
    close(sent.matrix[1], Math.sin(angle * Math.PI / 180));
    clock.setValue(delay + 2400);
    close(node.props.opacity.read(), 0);
    const direction = to >= 34 && index === 1 ? -1 : 1;
    let previousAngle = -90;
    for (let ms = 0; ms <= 2600; ms += 16) {
      clock.setValue(ms);
      const angle = node.props.rotation.read();
      assert.ok((angle - previousAngle) * direction >= -1e-6);
      const offset = circle.strokeDashoffset.read() / circle.strokeDasharray[0];
      assert.ok(offset >= -0.996 - 1e-6 && offset <= -0.26 + 1e-6);
      previousAngle = angle;
    }
  });
  const countBeforeRender = animations.length;
  render(props); // rerender incidental não reinicia.
  assert.equal(animations.length, countBeforeRender);
  render({ ...props, play: 2 }); // replay cancela o anterior e volta ao início.
  assert.equal(animation.running, false);
  assert.equal(clock.value, 0);
  listeners.forEach((fn) => fn('background'));
  assert.equal(clock.value, to >= 3 && to < 7 ? 2900 : 2600);
  assert.equal(animations[animations.length - 1].running, false);
  render({ ...props, play: null });
  assert.equal(listeners.size, 0);
  cleanup();
  assert.equal(listeners.size, 0);
}
console.log('Streak OK: marcos A/B, matriz nativa, rolo 15px, imagem estável, replay e cancelamento.');
