import React, { useMemo } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Stop } from 'react-native-svg';
import { getMilestoneTierId } from '../utils/taskUtils';

// A silhueta e o tamanho sao iguais em todas as patentes: o que muda e o metal
// e, a partir da centesima conclusao, uma marca a mais por degrau (um anel,
// depois dois, depois um eco de contorno, depois dois ecos). Quem esta olhando
// o card de longe le a cor; quem abre o detalhe le os aneis.
//
// Qual patente vale em cada marco esta em `getMilestoneTierId`, junto das
// regras de marco, porque e regra e nao desenho.

// Estrela de 8 pontas: 16 vertices alternando raio 24 e 18, de 22,5 em 22,5
// graus. As pontas sao arredondadas pelo strokeLinejoin, nao pela geometria.
const STAR_POINTS =
  '0,-24 6.89,-16.63 16.97,-16.97 16.63,-6.89 24,0 16.63,6.89 16.97,16.97 ' +
  '6.89,16.63 0,24 -6.89,16.63 -16.97,16.97 -16.63,6.89 -24,0 -16.63,-6.89 ' +
  '-16.97,-16.97 -6.89,-16.63';

// Faisca de 4 pontas, centralizada, metade do tamanho da estrela.
const SPARK_PATH =
  'M0,-11 C.9,-3.7 3.7,-.9 11,0 C3.7,.9 .9,3.7 0,11 ' +
  'C-.9,3.7 -3.7,.9 -11,0 C-3.7,-.9 -.9,-3.7 0,-11 Z';

// Fibras do papelao, so na primeira patente.
const FIBER_PATH = 'M-15,-8 L15,-8 M-16,0 L16,0 M-15,8 L15,8';

// A caixa e maior que a estrela para caber os ecos das ultimas patentes. Todas
// usam a mesma caixa, entao a estrela tem sempre o mesmo tamanho na tela.
const VIEW_BOX = '-31 -31 62 62';

// O corte seco no meio do gradiente (branco puro seguido do tom mais escuro) e
// o que faz a superficie ser lida como metal. O papelao nao tem esse corte, por
// isso ele parece fosco. `label` e a cor do texto que acompanha o selo sobre
// fundo claro, escurecida quando o contorno sozinho nao alcanca 4,5:1.
const TIER_THEMES = {
  cardboard: {
    gradient: { x1: '10%', y1: '0%', x2: '35%', y2: '100%' },
    stops: [
      ['0', '#E6CEA8'],
      ['0.34', '#CDAB7D'],
      ['0.52', '#DCBE94'],
      ['0.7', '#BC9463'],
      ['1', '#A6804C'],
    ],
    stroke: '#8A6944',
    spark: '#F6EBD8',
    label: '#8A6944',
    fibers: '#B08D5F',
    rings: [],
    echoes: [],
  },
  bronze: {
    gradient: { x1: '10%', y1: '0%', x2: '30%', y2: '100%' },
    stops: [
      ['0', '#F4DCC0'],
      ['0.3', '#B87A44'],
      ['0.48', '#FFF1DF'],
      ['0.54', '#6E3F1C'],
      ['0.8', '#D9A472'],
      ['1', '#4A2810'],
    ],
    stroke: '#5A3316',
    spark: '#FFF6EA',
    label: '#5A3316',
    rings: [],
    echoes: [],
  },
  silver: {
    gradient: { x1: '8%', y1: '0%', x2: '32%', y2: '100%' },
    stops: [
      ['0', '#FFFFFF'],
      ['0.26', '#C3CEDB'],
      ['0.46', '#FDFEFF'],
      ['0.53', '#8C99A8'],
      ['0.78', '#E4EBF2'],
      ['1', '#6E7D8D'],
    ],
    stroke: '#6B7A89',
    spark: '#FFFFFF',
    label: '#5C6874',
    // Anel tenue: a 24px ele quase some, e e essa a intencao — separa prata de
    // bronze sem competir com a faisca.
    rings: [{ r: 15.5, width: 1.1, color: '#8B98A6', opacity: 0.7 }],
    echoes: [],
  },
  steel: {
    gradient: { x1: '10%', y1: '0%', x2: '30%', y2: '100%' },
    stops: [
      ['0', '#DFF3FF'],
      ['0.3', '#5FB0E8'],
      ['0.48', '#FFFFFF'],
      ['0.54', '#1F6FAE'],
      ['0.8', '#8FCDF2'],
      ['1', '#14507F'],
    ],
    stroke: '#1F6FAE',
    spark: '#FFFFFF',
    label: '#1F6FAE',
    rings: [{ r: 15.5, width: 1.4, color: '#FFFFFF', opacity: 0.8 }],
    echoes: [],
  },
  violet: {
    gradient: { x1: '10%', y1: '0%', x2: '30%', y2: '100%' },
    stops: [
      ['0', '#EAE3FF'],
      ['0.3', '#7B5FE0'],
      ['0.48', '#FFFFFF'],
      ['0.54', '#3B27B8'],
      ['0.8', '#AB93F2'],
      ['1', '#241670'],
    ],
    stroke: '#2B1A8A',
    spark: '#FFFFFF',
    label: '#2B1A8A',
    rings: [
      { r: 15.5, width: 1.4, color: '#FFFFFF', opacity: 0.8 },
      { r: 19.5, width: 1.0, color: '#FFFFFF', opacity: 0.5 },
    ],
    echoes: [],
  },
  obsidian: {
    gradient: { x1: '10%', y1: '0%', x2: '30%', y2: '100%' },
    stops: [
      ['0', '#DDE4EE'],
      ['0.3', '#66727F'],
      ['0.48', '#FFFFFF'],
      ['0.54', '#232B34'],
      ['0.8', '#9EAAB8'],
      ['1', '#11161C'],
    ],
    stroke: '#11161C',
    spark: '#FFFFFF',
    label: '#11161C',
    rings: [{ r: 15.5, width: 1.4, color: '#FFFFFF', opacity: 0.8 }],
    echoes: [{ scale: 1.13, width: 1.2, color: '#7A8794', opacity: 0.85 }],
  },
  iridescent: {
    gradient: { x1: '5%', y1: '0%', x2: '90%', y2: '100%' },
    stops: [
      ['0', '#9EE7FF'],
      ['0.22', '#B7A8F7'],
      ['0.42', '#FFFFFF'],
      ['0.5', '#FBB6DF'],
      ['0.72', '#A9F0DA'],
      ['1', '#6FA8E8'],
    ],
    stroke: '#5B6BA8',
    spark: '#FFFFFF',
    label: '#5B6BA8',
    rings: [{ r: 15.5, width: 1.4, color: '#FFFFFF', opacity: 0.8 }],
    echoes: [
      { scale: 1.13, width: 1.2, color: '#A7B6E0', opacity: 0.9 },
      { scale: 1.24, width: 1.0, color: '#C9D5F0', opacity: 0.65 },
    ],
  },
};

export const getMilestoneSealTheme = (milestone) => {
  const tierId = getMilestoneTierId(milestone);
  return tierId ? TIER_THEMES[tierId] : null;
};

let gradientSequence = 0;

// `milestone` e o numero do marco (10, 50, 100...). Abaixo de 10 nao ha selo.
// 24px e o tamanho do card; no detalhe use 46 ou mais, que e onde os aneis e os
// ecos ficam legiveis.
export default function MilestoneSeal({ milestone, size = 24, style }) {
  // Um id por instancia: o react-native-svg resolve `url(#id)` de forma global
  // e varios cards na mesma lista herdariam o primeiro gradiente montado.
  const gradientId = useMemo(() => {
    gradientSequence += 1;
    return `milestone-seal-${gradientSequence}`;
  }, []);
  const theme = getMilestoneSealTheme(milestone);

  if (!theme) {
    return null;
  }

  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} style={style}>
      <Defs>
        <LinearGradient id={gradientId} {...theme.gradient}>
          {theme.stops.map(([offset, color]) => (
            <Stop key={offset} offset={offset} stopColor={color} />
          ))}
        </LinearGradient>
      </Defs>

      {/* Ecos: repetem a silhueta para fora, so nas duas ultimas patentes. A
          espessura e dividida pela escala do grupo, senao o contorno engrossaria
          junto e os ecos pesariam mais que a propria estrela. */}
      {theme.echoes.map((echo) => (
        <G key={`echo-${echo.scale}`} scale={echo.scale}>
          <Polygon
            points={STAR_POINTS}
            fill="none"
            stroke={echo.color}
            strokeWidth={echo.width / echo.scale}
            strokeLinejoin="round"
            opacity={echo.opacity}
          />
        </G>
      ))}

      <Polygon
        points={STAR_POINTS}
        fill={`url(#${gradientId})`}
        stroke={theme.stroke}
        strokeWidth={3}
        strokeLinejoin="round"
      />

      {/* `fill` precisa ser explicito: o padrao do SVG e preto, e as fibras
          virariam uma mancha por cima da estrela. */}
      {theme.fibers ? (
        <Path
          d={FIBER_PATH}
          fill="none"
          stroke={theme.fibers}
          strokeWidth={1}
          opacity={0.5}
        />
      ) : null}

      {theme.rings.map((ring) => (
        <Circle
          key={`ring-${ring.r}`}
          cx={0}
          cy={0}
          r={ring.r}
          fill="none"
          stroke={ring.color}
          strokeWidth={ring.width}
          opacity={ring.opacity}
        />
      ))}

      <Path d={SPARK_PATH} fill={theme.spark} />
    </Svg>
  );
}
