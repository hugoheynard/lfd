import type { EChartsOption } from 'echarts';

import type { RevenuePace } from './revenue-pace.model';

/**
 * L'option ECharts de **l'allure du mois** — deux courbes cumulées sur **un seul
 * axe** (deux fois des euros : aucune raison d'en avoir deux, et un double axe
 * ferait mentir la comparaison).
 *
 * Le mois précédent est le **fantôme** : trait fin, gris, sans marqueur. Le mois
 * courant porte l'aire et s'arrête à aujourd'hui — c'est l'écart entre les deux
 * traits, à ce point-là, qui est l'information.
 */

const CURRENT = '#3b82f6';
const PREVIOUS = '#94a3b8';

/** Valeur d'un token fold, avec repli — SSR-safe. */
function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Les quantièmes à tracer : `1`, `2`, … jusqu'au plus long des deux mois. */
function dayAxis(length: number): string[] {
  return Array.from({ length }, (_, index) => `${index + 1}`);
}

export function revenuePaceOption(pace: RevenuePace): EChartsOption {
  const text = themeColor('--fold-color-text-muted', '#64748b');
  const grid = themeColor('--fold-color-border', '#e2e8f0');
  const toEuros = (cents: number): number => Math.round(cents / 100);

  return {
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => `${Number(value).toLocaleString('fr-FR')} €`,
    },
    legend: {
      show: true,
      bottom: 0,
      itemHeight: 8,
      itemWidth: 14,
      textStyle: { color: text, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: dayAxis(pace.length),
      boundaryGap: false,
      axisLabel: { color: text, fontSize: 10, interval: 4 },
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: text,
        fontSize: 10,
        formatter: (value: number) => `${Math.round(value / 1000)} k€`,
      },
      splitLine: { lineStyle: { color: grid, type: 'dashed' } },
    },
    series: [
      {
        name: 'Mois précédent',
        type: 'line',
        data: pace.previous.cumulative.map(toEuros),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: PREVIOUS, width: 2, type: 'dashed' },
        z: 1,
      },
      {
        name: 'Ce mois-ci',
        type: 'line',
        data: pace.current.cumulative.map(toEuros),
        smooth: true,
        // Un seul marqueur, sur aujourd'hui : un point par jour ferait du bruit.
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: false,
        endLabel: { show: false },
        lineStyle: { color: CURRENT, width: 2.5 },
        areaStyle: { color: CURRENT, opacity: 0.12 },
        markPoint: {
          symbol: 'circle',
          symbolSize: 9,
          itemStyle: { color: CURRENT, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: [{ type: 'max', name: "Aujourd'hui" }],
        },
        z: 2,
      },
    ],
  };
}
