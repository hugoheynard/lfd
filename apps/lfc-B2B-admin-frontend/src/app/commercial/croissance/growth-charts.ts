import type {
  AccountConcentration,
  AcquisitionMixPoint,
  AcquisitionPoint,
  AdoptionZoneView,
  CohortRow,
  FunnelStep,
  LifecycleFlow,
  PenetrationTrendPoint,
  TemperatureFlowPoint,
  VelocityMetric,
  ZonePenetrationTrend,
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

/**
 * **Acquisition composée — flux devant, stock derrière** : les courbes d'acquisition
 * hebdo (inscriptions / 1res commandes / leads, axe primaire en nombre) et, en toile
 * de fond, la **part de marché cumulée** (axe secondaire en %, auto-échelle). On lit
 * d'un trait l'action (acquisitions de la semaine) et son effet (la part qui monte).
 * Sans `trend`, seul le flux est tracé.
 */
export function acquisitionOption(
  points: readonly AcquisitionPoint[],
  trend?: readonly PenetrationTrendPoint[],
): EChartsOption {
  const weeks = points.map((p) => weekLabel(p.weekStart));
  const area = (color: string): { color: string; opacity: number } => ({ color, opacity: 0.12 });
  const hasTrend = trend !== undefined && trend.length > 0;
  const penByWeek = new Map((trend ?? []).map((t) => [t.weekStart, t.penetration * 100]));
  const flux = [
    line('Inscriptions', points.map((p) => p.registrations), PALETTE.blue, area(PALETTE.blue)),
    line('1res commandes', points.map((p) => p.firstOrders), PALETTE.green, area(PALETTE.green)),
    line('Leads saisis', points.map((p) => p.leadsCaptured), PALETTE.violet, area(PALETTE.violet)),
  ];
  return {
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: weeks, boundaryGap: false },
    yAxis: hasTrend
      ? [
          { type: 'value', minInterval: 1 },
          {
            type: 'value',
            position: 'right',
            axisLabel: { formatter: '{value} %', color: PALETTE.slate },
            splitLine: { show: false },
          },
        ]
      : { type: 'value', minInterval: 1 },
    // La bande « part de marché » est poussée en PREMIER → dessinée derrière les courbes.
    series: hasTrend
      ? [marketShareBand(points.map((p) => penByWeek.get(p.weekStart) ?? null)), ...flux]
      : flux,
  };
}

/** Aire de fond « part de marché » (axe secondaire %), volontairement discrète. */
function marketShareBand(data: readonly (number | null)[]): Record<string, unknown> {
  return {
    name: 'Part de marché',
    type: 'line',
    yAxisIndex: 1,
    smooth: true,
    symbol: 'none',
    z: 1,
    data: [...data],
    lineStyle: { color: PALETTE.slate, width: 1, type: 'dashed', opacity: 0.6 },
    areaStyle: { color: PALETTE.slate, opacity: 0.1 },
    itemStyle: { color: PALETTE.slate },
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
 * **Momentum du vivier** : la part de prospects par chaleur, semaine après semaine, en
 * **aires empilées** (base à 0). L'épaisseur d'une bande = sa **part** ; l'enveloppe du
 * haut = le **volume total** du vivier. La bande chaude est en bas de la pile pour
 * garder une base plate honnête. Dégradé de chaleur : chauds (rouge), tièdes (ambre),
 * froids (bleu). Chaque point = le stock debout à la clôture de la semaine. La direction
 * *par bande* (qui se réchauffe / refroidit) se lit sur le diagramme de transferts.
 */
export function temperatureFlowOption(points: readonly TemperatureFlowPoint[]): EChartsOption {
  const weeks = points.map((p) => weekLabel(p.weekStart));
  const band = (name: string, data: readonly number[], color: string): Record<string, unknown> => ({
    name,
    type: 'line',
    stack: 'vivier',
    smooth: true,
    symbol: 'none',
    data: [...data],
    itemStyle: { color },
    lineStyle: { color, width: 1 },
    areaStyle: { color, opacity: 0.55 },
  });
  return {
    legend: {
      top: 0,
      data: ['Chauds', 'Tièdes', 'Froids'],
      textStyle: { color: PALETTE.slate },
    },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: weeks, boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    // Ordre de pile : chauds en bas (base plate honnête) → tièdes → froids.
    series: [
      band(
        'Chauds',
        points.map((p) => p.hot),
        PALETTE.red,
      ),
      band(
        'Tièdes',
        points.map((p) => p.mid),
        PALETTE.amber,
      ),
      band(
        'Froids',
        points.map((p) => p.cold),
        PALETTE.blue,
      ),
    ],
  };
}

/** Couleur d'un état de chaleur (les nœuds du diagramme de transferts en héritent). */
const TEMP_COLOR: Record<string, string> = {
  new: PALETTE.violet,
  cold: PALETTE.blue,
  mid: PALETTE.amber,
  hot: PALETTE.red,
  converted: PALETTE.green,
  lost: PALETTE.slate,
};

/**
 * **Transferts entre bandes** (Sankey) : l'état de chaque prospect au **début** de la
 * période (colonne « avant », à gauche) vers son état à la **fin** (« après », à
 * droite). Un ruban « Tiède → Chaud » = les personnes qui se sont réchauffées ; « Chaud
 * → Froid » celles qui ont refroidi ; plus les entrées (Nouveau) et sorties
 * (Converti / Perdu). Largeur du ruban = nombre de personnes.
 */
export function temperatureTransitionsOption(flow: LifecycleFlow): EChartsOption {
  const labelByKey = new Map(flow.nodes.map((n) => [n.key, n.label]));
  const nameOf = (key: string): string =>
    `${labelByKey.get(key) ?? key}${key.startsWith('from_') ? ' ·avant' : ' ·après'}`;
  const colorOf = (key: string): string => TEMP_COLOR[key.replace(/^(from_|to_)/, '')] ?? PALETTE.slate;
  return {
    tooltip: { trigger: 'item', formatter: '{b} : {c}' },
    series: [
      {
        type: 'sankey',
        emphasis: { focus: 'adjacency' },
        nodeGap: 12,
        data: flow.nodes.map((n) => ({
          name: nameOf(n.key),
          itemStyle: { color: colorOf(n.key), borderColor: 'transparent' },
        })),
        links: flow.links.map((l) => ({
          source: nameOf(l.source),
          target: nameOf(l.target),
          value: l.value,
        })),
        lineStyle: { color: 'gradient', opacity: 0.35 },
        label: { color: 'inherit' },
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

/**
 * **Mode d'acquisition** — donut product-led vs sales-led **sur toute la période**
 * (somme des semaines). La part product-led = l'auto-découverte (self-service sans
 * démarchage), un indicateur de la qualité du référencement. Le centre affiche cette
 * part en %.
 */
export function acquisitionMixDonutOption(points: readonly AcquisitionMixPoint[]): EChartsOption {
  const product = points.reduce((sum, p) => sum + p.productLed, 0);
  const sales = points.reduce((sum, p) => sum + p.salesLed, 0);
  const total = product + sales;
  const productPct = total === 0 ? 0 : Math.round((product / total) * 100);
  return {
    tooltip: { trigger: 'item', formatter: '{b} : {c} ({d} %)' },
    legend: { bottom: 0, textStyle: { color: PALETTE.slate } },
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'center',
          formatter: `${productPct} %\nproduct-led`,
          color: PALETTE.slate,
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 20,
        },
        labelLine: { show: false },
        data: [
          { value: product, name: 'Product-led', itemStyle: { color: PALETTE.green } },
          { value: sales, name: 'Sales-led', itemStyle: { color: PALETTE.amber } },
        ],
      },
    ],
  };
}

/**
 * **Vélocité par zone** (§2.4) : la part de marché **dans le temps**, une courbe par
 * territoire. La **pente** = la vitesse de conquête : une droite qui monte = traction,
 * qui s'aplatit = saturation. Là où l'adoption ci-dessus donne l'instantané, celle-ci
 * montre la trajectoire. On ne trace que les zones ayant au moins une activation.
 */
export function zoneVelocityOption(zones: readonly ZonePenetrationTrend[]): EChartsOption {
  const active = zones.filter((z) => z.points.some((p) => p.penetration > 0));
  const weeks = (active[0]?.points ?? []).map((p) => weekLabel(p.weekStart));
  const colors = [PALETTE.blue, PALETTE.green, PALETTE.amber, PALETTE.violet, PALETTE.red];
  return {
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'axis', valueFormatter: (v): string => `${round1(Number(v))} %` },
    xAxis: { type: 'category', data: weeks, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { formatter: '{value} %' } },
    series: active.map((zone, i): Record<string, unknown> => {
      const color = colors[i % colors.length];
      return {
        name: zone.ville !== '' ? zone.ville : zone.codePostal,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: zone.points.map((p) => round1(p.penetration * 100)),
        lineStyle: { color, width: 2 },
        itemStyle: { color },
      };
    }),
  };
}

/**
 * **Adoption par territoire** : une barre horizontale **empilée sur base 100 %** par
 * zone — le segment plein = **conquis** (pénétration), le segment atténué = **reste à
 * prendre** (marge de progression). On lit la part de marché ET le potentiel restant.
 * L'étiquette porte le taux **et** le delta de la période (« 12 % · +3 pts ») ; le
 * conquis est vert s'il a progressé, bleu sinon. `direction` classe les zones.
 */
export function adoptionOption(
  zones: readonly AdoptionZoneView[],
  direction: 'desc' | 'asc' = 'desc',
): EChartsOption {
  const asc = [...zones].sort((a, b) => a.penetration - b.penetration);
  // yAxis catégorie : data[0] en bas. Desc = plus forte pénétration en HAUT → data ascendante.
  const rows = direction === 'desc' ? asc : [...asc].reverse();
  const conquis = rows.map((z) => ({
    value: pct(z.penetration),
    itemStyle: { color: z.deltaPts > 0 ? PALETTE.green : PALETTE.blue, borderRadius: [4, 0, 0, 4] },
    label: {
      show: true,
      position: 'right' as const,
      formatter: `${pct(z.penetration)} %${z.deltaPts > 0 ? ` · +${round1(z.deltaPts)} pts` : ''}`,
    },
  }));
  return {
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params): string => {
        const first = Array.isArray(params) ? params[0] : params;
        const z = rows[toIndex(first)];
        return z === undefined
          ? ''
          : `${z.codePostal} ${z.ville}<br/>${z.activated}/${z.addressable} activées · ${pct(z.penetration)} %`;
      },
    },
    xAxis: { type: 'value', name: '%', min: 0, max: 100 },
    yAxis: {
      type: 'category',
      data: rows.map((z) => `${z.codePostal}${z.ville === '' ? '' : ' ' + z.ville}`),
    },
    series: [
      { name: 'Conquis', type: 'bar', stack: 'part', barWidth: '55%', data: conquis },
      {
        name: 'Reste à prendre',
        type: 'bar',
        stack: 'part',
        barWidth: '55%',
        data: rows.map((z) => 100 - pct(z.penetration)),
        itemStyle: { color: PALETTE.slate, opacity: 0.15, borderRadius: [0, 4, 4, 0] },
      },
    ],
  };
}

/** Pourcentage entier lisible d'un ratio 0..1. */
function pct(ratio: number): number {
  return Math.round(ratio * 100);
}

/** Arrondi à une décimale (points de pourcentage). */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Index de data d'un param de tooltip ECharts (typé large), 0 par défaut. */
function toIndex(param: unknown): number {
  if (typeof param === 'object' && param !== null) {
    const idx = (param as Record<string, unknown>)['dataIndex'];
    return typeof idx === 'number' ? idx : 0;
  }
  return 0;
}

/** Libellé du niveau de concentration (Gini) pour l'annotation. */
export function concentrationSummary(c: AccountConcentration): string {
  const top = Math.round(c.topDecileShare * 100);
  return `Top 10 % des comptes = ${top} % du volume · Gini ${c.gini.toFixed(2)}`;
}
