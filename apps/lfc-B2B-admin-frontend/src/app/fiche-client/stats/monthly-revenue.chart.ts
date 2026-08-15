import type { EChartsOption } from 'echarts';

import type { MonthlyRevenue } from './monthly-revenue';

const BAR = '#3b82f6';

/** Valeur d'un token fold, avec repli — SSR-safe (cf. `revenue-pace.chart`). */
function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Le chiffre mensuel en **barres**, pas en courbe : une courbe relie des mois,
 * donc suggère une continuité entre deux commandes qui n'existe pas. Des barres
 * disent ce qui est vrai — douze quantités indépendantes, dont certaines nulles.
 */
export function monthlyRevenueOption(months: readonly MonthlyRevenue[]): EChartsOption {
  const text = themeColor('--fold-color-text-muted', '#64748b');
  const grid = themeColor('--fold-color-border-subtle', '#e2e8f0');

  return {
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => `${Number(value).toLocaleString('fr-FR')} €`,
    },
    xAxis: {
      type: 'category',
      data: months.map((month) => month.label),
      axisLabel: { color: text, fontSize: 11 },
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: text, fontSize: 11, formatter: (value: number) => `${value} €` },
      splitLine: { lineStyle: { color: grid } },
    },
    series: [
      {
        type: 'bar',
        name: 'Commandé',
        data: months.map((month) => Math.round(month.totalCents / 100)),
        itemStyle: { color: BAR, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
    ],
  };
}
