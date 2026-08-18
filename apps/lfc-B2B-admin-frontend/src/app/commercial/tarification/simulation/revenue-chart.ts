import type { EChartsOption } from 'echarts';

import type { CurvePoint } from './revenue-model';

/**
 * **Les options ECharts de la simulation** — deux graphes, et pas un.
 *
 * Le premier montre le chiffre par scénario ; le second, l'ÉCART au prix fixe.
 * Deux courbes de CA presque parallèles ne laissent pas voir un écart de quelques
 * pour cent : c'est l'écart qu'on lit, donc c'est l'écart qu'on trace, avec sa
 * propre échelle et un zéro franc.
 *
 * L'axe des volumes est **numérique** et non catégoriel : la courbe est linéaire
 * par morceaux et les points sont échantillonnés serrés autour des seuils. Un axe
 * de catégories les espacerait régulièrement et ferait glisser les marches là où
 * elles ne sont pas.
 */

/** Jeu Okabe-Ito : séparable sous les trois formes de daltonisme. */
export const SCENARIO_TONES = ['#0072b2', '#d55e00', '#009e73', '#cc79a7'] as const;

export interface RevenueSeries {
  readonly id: string;
  readonly label: string;
  /** L'indice de teinte suit le SCÉNARIO, pas son rang d'affichage. */
  readonly tone: number;
  readonly points: readonly CurvePoint[];
}

function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const euros = (cents: number): number => Math.round(cents / 100);

const asPairs = (points: readonly CurvePoint[]): [number, number][] =>
  points.map((point) => [point.volume, euros(point.revenueCents)]);

/** La teinte d'un scénario — bornée au jeu, jamais indéfinie. */
function toneColor(tone: number): string {
  return SCENARIO_TONES[tone % SCENARIO_TONES.length] ?? SCENARIO_TONES[0];
}

function volumeAxis(muted: string, grid: string): NonNullable<EChartsOption['xAxis']> {
  return {
    type: 'value',
    name: 'volume',
    nameLocation: 'end',
    nameTextStyle: { color: muted, fontSize: 10 },
    min: 1,
    axisLabel: {
      color: muted,
      fontSize: 10,
      formatter: (value: number) => value.toLocaleString('fr-FR'),
    },
    axisLine: { lineStyle: { color: grid } },
    axisTick: { show: false },
    splitLine: { show: false },
  };
}

/** Le trait vertical du volume promis, posé sur la série qui le porte. */
function promisedLine(targetVolume: number, muted: string): Record<string, unknown> {
  return {
    silent: true,
    symbol: 'none',
    label: { formatter: 'volume promis', color: muted, fontSize: 10, position: 'insideEndTop' },
    lineStyle: { color: muted, type: 'dashed', width: 1 },
    data: [{ xAxis: targetVolume }],
  };
}

/** Graphe 1 — le chiffre encaissé, un trait par scénario, **un seul axe**. */
export function revenueCurvesOption(
  series: readonly RevenueSeries[],
  targetVolume: number,
): EChartsOption {
  const muted = themeColor('--fold-color-text-muted', '#64748b');
  const grid = themeColor('--fold-color-border', '#e2e8f0');
  return {
    grid: { left: 8, right: 20, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      valueFormatter: (value) => `${Number(value).toLocaleString('fr-FR')} €`,
    },
    legend: {
      show: true,
      top: 0,
      itemHeight: 8,
      itemWidth: 14,
      textStyle: { color: muted, fontSize: 11 },
    },
    xAxis: volumeAxis(muted, grid),
    yAxis: {
      type: 'value',
      axisLabel: {
        color: muted,
        fontSize: 10,
        formatter: (value: number) => `${Math.round(value / 1000).toLocaleString('fr-FR')} k€`,
      },
      splitLine: { lineStyle: { color: grid, type: 'dashed' } },
    },
    series: series.map((serie, index) => ({
      name: serie.label,
      type: 'line' as const,
      data: asPairs(serie.points),
      // Pas de lissage : la courbe EST anguleuse, et arrondir les marches
      // effacerait précisément ce qu'on vient regarder.
      smooth: false,
      symbol: 'none',
      lineStyle: {
        color: toneColor(serie.tone),
        width: serie.id === 'fixe' ? 2 : 2.5,
        type: serie.id === 'fixe' ? ('dashed' as const) : ('solid' as const),
      },
      itemStyle: { color: toneColor(serie.tone) },
      ...(index === 0 ? { markLine: promisedLine(targetVolume, muted) } : {}),
    })),
  };
}

/** Graphe 2 — l'écart au prix fixe, avec un zéro franc et son aire remplie. */
export function revenueGapOption(
  gap: readonly CurvePoint[],
  targetVolume: number,
  tone: number,
): EChartsOption {
  const muted = themeColor('--fold-color-text-muted', '#64748b');
  const grid = themeColor('--fold-color-border', '#e2e8f0');
  const color = toneColor(tone);
  return {
    grid: { left: 8, right: 20, top: 20, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => `${Number(value).toLocaleString('fr-FR')} €`,
    },
    legend: { show: false },
    xAxis: volumeAxis(muted, grid),
    yAxis: {
      type: 'value',
      axisLabel: {
        color: muted,
        fontSize: 10,
        formatter: (value: number) => `${Number(value).toLocaleString('fr-FR')} €`,
      },
      splitLine: { lineStyle: { color: grid, type: 'dashed' } },
    },
    series: [
      {
        name: 'Écart au prix fixe',
        type: 'line',
        data: asPairs(gap),
        smooth: false,
        symbol: 'none',
        lineStyle: { color, width: 2 },
        // `auto` remplit jusqu'au zéro dès que l'axe le traverse : au-dessus du
        // volume promis l'écart devient négatif, et l'aire doit changer de côté.
        areaStyle: { color, opacity: 0.14, origin: 'auto' },
        markLine: promisedLine(targetVolume, muted),
      },
    ],
  };
}
