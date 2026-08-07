import type {
  AccountConcentration,
  AcquisitionMixPoint,
  AcquisitionPoint,
  CohortRow,
  FunnelStep,
  LifecycleFlow,
  TemperatureFlowPoint,
  VelocityMetric,
} from '@lfd/contracts';
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

/** Mini-courbe (sparkline) des inscriptions — pour le rappel du dashboard. */
export function sparklineOption(points: readonly AcquisitionPoint[]): EChartsOption {
  return {
    grid: { left: 2, right: 2, top: 6, bottom: 2 },
    xAxis: { type: 'category', show: false, data: points.map((p) => p.weekStart) },
    yAxis: { type: 'value', show: false },
    tooltip: { trigger: 'axis' },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: points.map((p) => p.registrations + p.firstOrders),
        lineStyle: { color: PALETTE.blue, width: 2 },
        areaStyle: { color: PALETTE.blue, opacity: 0.15 },
      },
    ],
  };
}

/**
 * **Momentum du vivier** : le flux de prospects par chaleur, semaine après semaine,
 * rendu en `themeRiver` (rubans qui enflent/dégonflent). Dégradé de chaleur : chauds
 * (rouge) → tièdes (ambre) → froids (bleu). Chaque point = le stock debout à la
 * clôture de la semaine, pas un cumul d'événements.
 */
export function temperatureFlowOption(points: readonly TemperatureFlowPoint[]): EChartsOption {
  const bands = [
    { key: 'hot', name: 'Chauds', color: PALETTE.red },
    { key: 'mid', name: 'Tièdes', color: PALETTE.amber },
    { key: 'cold', name: 'Froids', color: PALETTE.blue },
  ] as const;
  const data: [string, number, string][] = [];
  for (const p of points) {
    data.push([p.weekStart, p.hot, 'Chauds']);
    data.push([p.weekStart, p.mid, 'Tièdes']);
    data.push([p.weekStart, p.cold, 'Froids']);
  }
  return {
    color: bands.map((b) => b.color),
    legend: { top: 0, data: [...bands.map((b) => b.name)], textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
    // themeRiver a son propre axe temporel : on neutralise le cartésien du socle.
    xAxis: { show: false },
    yAxis: { show: false },
    singleAxis: {
      type: 'time',
      top: 34,
      bottom: 20,
      axisLabel: { color: PALETTE.slate, formatter: dayMonth },
      axisLine: { lineStyle: { color: PALETTE.slate } },
    },
    series: [
      {
        type: 'themeRiver',
        emphasis: { focus: 'series' },
        label: { show: false },
        data,
      },
    ],
  };
}

/** Horodatage (ms) → « 17/08 » pour l'axe temporel du themeRiver. */
function dayMonth(value: number | string): string {
  const d = new Date(Number(value));
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
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

/** Sankey du cycle de vie : inscrit → commandé → déclaré → activé (les fuites). */
export function lifecycleSankeyOption(flow: LifecycleFlow): EChartsOption {
  const label = new Map(flow.nodes.map((n) => [n.key, n.label]));
  return {
    tooltip: { trigger: 'item', formatter: '{b} : {c}' },
    series: [
      {
        type: 'sankey',
        emphasis: { focus: 'adjacency' },
        nodeGap: 14,
        data: flow.nodes.map((n) => ({ name: n.label })),
        links: flow.links.map((l) => ({
          source: label.get(l.source) ?? l.source,
          target: label.get(l.target) ?? l.target,
          value: l.value,
        })),
        lineStyle: { color: 'gradient', opacity: 0.4 },
        label: { color: 'inherit' },
        itemStyle: { color: PALETTE.blue, borderColor: 'transparent' },
      },
    ],
  };
}

/** Boxplots des délais (jours) : temps → 1re commande / → activation. */
export function velocityBoxplotOption(metrics: readonly VelocityMetric[]): EChartsOption {
  return {
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', data: metrics.map((m) => m.label) },
    yAxis: { type: 'value', name: 'jours' },
    series: [
      {
        type: 'boxplot',
        itemStyle: { color: 'rgba(59,130,246,0.2)', borderColor: PALETTE.blue },
        data: metrics.map((m) => [
          m.quantiles.min,
          m.quantiles.q1,
          m.quantiles.median,
          m.quantiles.q3,
          m.quantiles.max,
        ]),
      },
    ],
  };
}

/** Mix d'acquisition product-led vs sales-led par semaine (aires empilées). */
export function acquisitionMixOption(points: readonly AcquisitionMixPoint[]): EChartsOption {
  const weeks = points.map((p) => weekLabel(p.weekStart));
  const stack = (
    name: string,
    data: readonly number[],
    color: string,
  ): Record<string, unknown> => ({
    name,
    type: 'line',
    stack: 'mix',
    smooth: true,
    symbol: 'none',
    areaStyle: { color, opacity: 0.55 },
    lineStyle: { color, width: 1 },
    itemStyle: { color },
    data: [...data],
  });
  return {
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: weeks, boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      stack(
        'Product-led',
        points.map((p) => p.productLed),
        PALETTE.green,
      ),
      stack(
        'Sales-led',
        points.map((p) => p.salesLed),
        PALETTE.amber,
      ),
    ],
  };
}

/** Libellé du niveau de concentration (Gini) pour l'annotation. */
export function concentrationSummary(c: AccountConcentration): string {
  const top = Math.round(c.topDecileShare * 100);
  return `Top 10 % des comptes = ${top} % du volume · Gini ${c.gini.toFixed(2)}`;
}
