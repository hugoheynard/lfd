import type { AcquisitionPoint, CohortRow, FunnelStep, MomentumDistribution } from '@lfd/contracts';
import type { EChartsOption } from 'echarts';

/**
 * **Constructeurs d'options ECharts** (purs) du dashboard de croissance. Séparés de
 * la page : ils prennent la vue backend et rendent une option prête à afficher. La
 * palette est semantique (acquisition/momentum/frictions) et lisible clair/sombre.
 */

const PALETTE = {
  blue: '#3b82f6',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#8b5cf6',
  slate: '#64748b',
};

/** « 2026-08-17 » → « 17/08 ». */
function weekLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/** Courbe d'acquisition : inscriptions / 1res commandes / leads par semaine (aires empilables). */
export function acquisitionOption(points: readonly AcquisitionPoint[]): EChartsOption {
  const weeks = points.map((p) => weekLabel(p.weekStart));
  const area = (color: string): { color: string; opacity: number } => ({ color, opacity: 0.12 });
  return {
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: weeks, boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      line(
        'Inscriptions',
        points.map((p) => p.registrations),
        PALETTE.blue,
        area(PALETTE.blue),
      ),
      line(
        '1res commandes',
        points.map((p) => p.firstOrders),
        PALETTE.green,
        area(PALETTE.green),
      ),
      line(
        'Leads saisis',
        points.map((p) => p.leadsCaptured),
        PALETTE.violet,
        area(PALETTE.violet),
      ),
    ],
  };
}

function line(
  name: string,
  data: readonly number[],
  color: string,
  areaStyle: { color: string; opacity: number },
): Record<string, unknown> {
  return {
    name,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 6,
    data: [...data],
    itemStyle: { color },
    lineStyle: { color, width: 2 },
    areaStyle,
  };
}

/** Distribution du momentum des prospects hot (barres horizontales colorées). */
export function momentumOption(dist: MomentumDistribution): EChartsOption {
  const rows = [
    { label: 'Accélère', value: dist.accelerating, color: PALETTE.green },
    { label: 'Stable', value: dist.stable, color: PALETTE.blue },
    { label: 'Refroidit', value: dist.cooling, color: PALETTE.amber },
    { label: 'Dormant', value: dist.dormant, color: PALETTE.slate },
  ];
  return {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: rows.map((r) => r.label), inverse: true },
    series: [
      {
        type: 'bar',
        barWidth: '55%',
        data: rows.map((r) => ({ value: r.value, itemStyle: { color: r.color, borderRadius: 4 } })),
        label: { show: true, position: 'right' },
      },
    ],
  };
}

/** Entonnoir (cold ou activation) à partir de marches décroissantes. */
export function funnelOption(steps: readonly FunnelStep[], color: string): EChartsOption {
  const max = steps.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  return {
    tooltip: { trigger: 'item', formatter: '{b} : {c}' },
    series: [
      {
        type: 'funnel',
        min: 0,
        max,
        minSize: '18%',
        gap: 2,
        label: { show: true, position: 'inside', formatter: '{b}\n{c}', color: '#fff' },
        itemStyle: { color, borderWidth: 0 },
        data: steps.map((s, i) => ({
          name: s.label,
          value: s.count,
          itemStyle: { opacity: 1 - i * (0.6 / Math.max(1, steps.length - 1)) },
        })),
      },
    ],
  };
}

/** Heatmap de rétention par cohorte : x = semaine +k, y = cohorte, valeur = %. */
export function cohortHeatmapOption(cohorts: readonly CohortRow[]): EChartsOption {
  const rows = [...cohorts].reverse();
  const maxSpan = rows.reduce((m, c) => Math.max(m, c.retention.length), 0);
  const xLabels = Array.from({ length: maxSpan }, (_, k) => `S+${k}`);
  const data: [number, number, number][] = [];
  rows.forEach((cohort, y) => {
    cohort.retention.forEach((r, x) => data.push([x, y, Math.round(r * 100)]));
  });
  return {
    tooltip: { position: 'top', formatter: '{c}%' },
    grid: { left: 80, right: 16, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: xLabels, splitArea: { show: true } },
    yAxis: {
      type: 'category',
      data: rows.map((c) => weekLabel(c.cohortWeek)),
      splitArea: { show: true },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#eef2ff', PALETTE.violet, '#4c1d95'] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: true, formatter: '{@[2]}' },
      },
    ],
  };
}
