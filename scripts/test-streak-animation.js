// Regressão do anel da sequência. Não simula o desenho Android: verifica os
// valores que o componente entrega ao react-native-svg em cada instante.
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

// requestAnimationFrame falso: os quadros só avançam quando o teste manda.
const frames = new Map();
let frameId = 0;
let frameNow = 0;
globalThis.requestAnimationFrame = (callback) => {
  frameId += 1;
  frames.set(frameId, callback);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const tick = (ms) => {
  frameNow += ms;
  const pending = [...frames.entries()];
  frames.clear();
  pending.forEach(([, callback]) => callback(frameNow));
};

const listeners = new Set();
const native = {
  View: 'View',
  StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
  Easing,
  Platform: { OS: 'android' },
  AppState: {
    currentState: 'active',
    addEventListener: (_, callback) => {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
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
  useState: (initial) => {
    const index = harness.cursor++;
    const hook = harness.hooks[index] ||= { value: initial };
    hook.set ||= (next) => { hook.value = typeof next === 'function' ? next(hook.value) : next; };
    return [hook.value, hook.set];
  },
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
Module._load = (request, parent, isMain) => {
  if (request === 'react') return react;
  if (request === 'react-native') return native;
  if (request === 'react-native-svg') return svg;
  return originalLoad(request, parent, isMain);
};
const svg = { __esModule: true, default: 'Svg' };
for (const name of ['Circle', 'ClipPath', 'Defs', 'G', 'LinearGradient', 'Rect', 'Stop', 'Text']) svg[name] = name;
const StreakRing = require('../components/StreakRing').default;
const { STREAK_EASINGS } = require('../components/StreakRing');
const { createStreakClock, interpolateTrack, STREAK_MAX_FRAME_STEP } = require('../utils/streakAnimation');

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
const timeHook = () => harness.hooks.find((hook) => hook.set); // o useState do relógio
const icon = React.createElement('Photo');

// Relógio: um quadro atrasado 200ms avança no máximo dois quadros — a
// animação pausa em vez de saltar para alcançar o relógio de parede.
{
  const clock = { value: 0, setValue(value) { this.value = value; } };
  let ended = 0;
  const runner = createStreakClock(clock, 1000, { onEnd: () => { ended += 1; } });
  runner.start();
  assert.equal(clock.value, 0);
  tick(0);
  tick(16);
  assert.equal(clock.value, 16);
  tick(200);
  assert.equal(clock.value, 16 + STREAK_MAX_FRAME_STEP);
  assert.equal(runner.running, true);
  runner.cancel();
  assert.equal(runner.running, false);
  assert.equal(frames.size, 0);
  runner.start();
  assert.equal(clock.value, 0);
  tick(0);
  tick(5000);
  assert.equal(clock.value, STREAK_MAX_FRAME_STEP);
  for (let i = 0; i < 40; i += 1) tick(34);
  assert.equal(clock.value, 1000);
  assert.equal(ended, 1);
  assert.equal(runner.running, false);
}
console.log('Relogio OK: pausa no engasgo, cancela e termina no fim.');

// Interpolação: easing por trecho, como o Animated.interpolate.
{
  const track = { inputRange: [0, 100, 300], outputRange: [0, 10, -10], easing: 'linear' };
  close(interpolateTrack(track, -5, STREAK_EASINGS), 0);
  close(interpolateTrack(track, 50, STREAK_EASINGS), 5);
  close(interpolateTrack(track, 200, STREAK_EASINGS), 0);
  close(interpolateTrack(track, 999, STREAK_EASINGS), -10);
  const eased = { ...track, easing: 'easeInOut' };
  close(interpolateTrack(eased, 50, STREAK_EASINGS), 5); // simétrico no meio
  assert.ok(interpolateTrack(eased, 20, STREAK_EASINGS) < 2); // acelera
}

for (const to of [1, 3, 7, 34, 1000]) {
  newHarness();
  const props = { play: 1, from: to - 1, to, contour: true, children: icon };
  const idle = render({ ...props, play: null });
  assert.equal(all(idle, (node) => node.type === 'Svg').length, 0);
  let tree = render(props);
  assert.equal(frames.size, 1); // o relógio está rodando
  assert.equal(listeners.size, 1);
  assert.equal(tree.props.children[1].type, idle.props.children.type);
  assert.equal(tree.props.children[1].props.children, icon);

  // Sem Animated em lugar nenhum: todo valor entregue ao SVG é concreto.
  const seek = (ms) => {
    timeHook().set(ms);
    tree = render(props);
    all(tree, (node) => typeof node.type === 'string').forEach((node) => {
      Object.entries(node.props).forEach(([key, value]) => {
        if (key === 'children' || key === 'style') return;
        assert.ok(value == null || typeof value !== 'object' || Array.isArray(value), `${node.type}.${key} nao e concreto`);
      });
    });
    return tree;
  };

  const texts = all(seek(0), (node) => node.type === 'Text');
  assert.equal(texts.length, 4);
  texts.forEach(({ props: text }) => {
    assert.equal(typeof text.y, 'number');
    assert.equal(text.fontWeight, '800');
    assert.equal(text.textAnchor, 'middle');
  });
  const groups = all(tree, (node) => node.type === 'G');
  // Opacity de grupo usa uma camada bitmap defeituosa no Android ao voltar
  // de 1 para valores fracionários; a transparência deve pertencer à tinta.
  groups.forEach((node) => assert.equal(node.props.opacity, undefined));

  const numberView = (node) => all(node, (item) => item.type === 'View' && item.props.style?.[1]?.transform)[0];
  for (const [ms, opacity, y] of [[676, 0, 4], [988, 1, 0], [2184, 1, 0], [2600, 0, -3]]) {
    const motion = numberView(seek(ms)).props.style[1];
    close(motion.opacity, opacity);
    close(motion.transform[0].translateY, y);
  }
  const clips = all(tree, (node) => node.type === 'ClipPath');
  assert.deepEqual(clips.map((node) => node.props.children.props.height), [15, 19]);
  for (const ms of [0, 1200, 1250, 1410, 1620, 2000]) {
    const rolls = all(seek(ms), (node) => node.type === 'G' && node.props.translateY != null);
    assert.equal(rolls.length, 2);
    const y = rolls[0].props.translateY;
    assert.ok(y >= -15 && y <= 0);
    if (ms <= 1200) close(y, 0);
    if (ms >= 1620) close(y, -15);
    const rows = all(rolls[0], (node) => node.type === 'G' && node.props.fillOpacity != null);
    assert.equal(rows.length, 2);
    rows.forEach((row) => assert.equal(row.props.fillOpacity, row.props.strokeOpacity));
    if (ms < 1200) assert.deepEqual(rows.map((row) => row.props.fillOpacity), [1, 0]);
    if (ms >= 1620) assert.deepEqual(rows.map((row) => row.props.fillOpacity), [0, 1]);
  }

  const ringsAt = (ms) => all(seek(ms), (node) => node.type === 'G' && typeof node.props.rotation === 'number' && node.props.rotation !== -90)
    .concat(all(tree, (node) => node.type === 'G' && node.props.rotation === -90 && to >= 7));
  const blazeRings = (ms) => all(seek(ms), (node) => node.type === 'Svg' && node.props.viewBox === '-33 -33 66 66')[0]?.props.children ?? [];
  assert.equal(blazeRings(0).length, to >= 7 ? 3 : 0);
  if (to >= 7) {
    blazeRings(0).forEach((node, index) => {
      const delay = index * 100;
      const circleAt = (ms) => blazeRings(ms)[index].props.children.props;
      const groupAt = (ms) => blazeRings(ms)[index].props;
      close(circleAt(delay + 240).strokeOpacity, 1);
      close(circleAt(delay + 2064).strokeOpacity, 1);
      const peak = circleAt(delay + 1008);
      close(groupAt(delay + 1008).rotation, to >= 34 && index === 1 ? -370 : 190);
      close(peak.strokeDashoffset / peak.strokeDasharray[0], -0.26);
      close(circleAt(delay + 2400).strokeOpacity, 0);
      const direction = to >= 34 && index === 1 ? -1 : 1;
      let previousAngle = -90;
      for (let ms = 0; ms <= 2600; ms += 16) {
        const angle = groupAt(ms).rotation;
        assert.ok((angle - previousAngle) * direction >= -1e-6);
        const circle = circleAt(ms);
        const offset = circle.strokeDashoffset / circle.strokeDasharray[0];
        assert.ok(offset >= -0.996 - 1e-6 && offset <= -0.26 + 1e-6);
        previousAngle = angle;
      }
    });
    const contourAt = (ms) => all(seek(ms), (node) => node.type === 'Circle' && node.props.r === 23)[0];
    close(contourAt(240).props.opacity, 1);
    close(contourAt(2400).props.opacity, 0);
  }
  if (to >= 3 && to < 7) {
    const ringCircles = (ms) => all(seek(ms), (node) => node.type === 'Circle' && node.props.r === 21.8);
    assert.equal(ringCircles(0).length, 2);
    close(ringCircles(870)[1].props.strokeDashoffset, 0);
    close(ringCircles(232)[1].props.strokeOpacity, 1);
    close(ringCircles(2900)[1].props.strokeOpacity, 0);
  }
  void ringsAt;

  // O relógio de verdade alimenta o mesmo estado.
  timeHook().set(0);
  tick(0);
  tick(16);
  assert.equal(timeHook().value, 16);
  const frameBeforeRender = [...frames.keys()][0];
  render(props); // rerender incidental não reinicia.
  assert.equal([...frames.keys()][0], frameBeforeRender);
  render({ ...props, play: 2 }); // replay cancela o anterior e volta ao início.
  assert.equal(frames.size, 1);
  assert.notEqual([...frames.keys()][0], frameBeforeRender);
  assert.equal(timeHook().value, 0);
  listeners.forEach((fn) => fn('background'));
  assert.equal(timeHook().value, to >= 3 && to < 7 ? 2900 : 2600);
  assert.equal(frames.size, 0);
  render({ ...props, play: null });
  assert.equal(listeners.size, 0);
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(frames.size, 0);
}
console.log('Streak OK: valores concretos por quadro, marcos A/B, rolo 15px, imagem estavel, replay e cancelamento.');
