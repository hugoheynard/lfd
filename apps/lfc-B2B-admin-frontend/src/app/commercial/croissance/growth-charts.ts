import type {
  AccountConcentration,
  AcquisitionMetricsView,
  AcquisitionMixPoint,
  AcquisitionPoint,
  AdoptionZoneView,
  CohortRow,
  FunnelStep,
  LifecycleFlow,
  MarketSectorsView,
  MarketVolumeView,
  OrderMetricsView,
  SectorRevenueView,
  RecoveryReactionByWeek,
  RecoveryReactionStat,
  RecoveryTrendPoint,
  TemperatureFlowPoint,
  TerminationRecovery,
  TerminationStatsView,
  VelocityMetric,
  ZonePenetrationTrend,
} from '@lfd/contracts';
import type { EChartsOption } from 'echarts';

import { CHURN_COLORS, CHURN_GLOBAL_COLOR } from './churn-palette';
import { bucketAxis, bucketSectorRevenue, foldDaily, type SectorGrain } from './sector-grain';

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

/** Valeur résolue d'un token de thème fold (SSR-safe), avec repli — clair/sombre. */
function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** « 2026-08-17 » → « 17/08 ». */
function weekLabel(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/**
 * **Entrées et sorties du parc** : le flux d'acquisition (inscriptions, 1res commandes,
 * leads saisis) ET le **churn** (résiliations confirmées) sur un même axe de comptage,
 * à la granularité choisie. Les entrées portent une aire discrète, la sortie reste une
 * ligne rouge nette : on compare d'un coup d'œil ce qui entre et ce qui sort.
 */
export function acquisitionFluxOption(
  view: AcquisitionMetricsView,
  grain: SectorGrain = 'week',
): EChartsOption {
  const axis = bucketAxis(view.days, grain);
  const area = (color: string): { color: string; opacity: number } => ({ color, opacity: 0.12 });
  const fold = (values: readonly number[]): number[] => foldDaily(axis, values);
  return {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: [...axis.labels], boundaryGap: false },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      line('Inscriptions', fold(view.registrations), PALETTE.blue, area(PALETTE.blue)),
      line('1res commandes', fold(view.firstOrders), PALETTE.green, area(PALETTE.green)),
      line('Leads saisis', fold(view.leads), PALETTE.violet, area(PALETTE.violet)),
      {
        name: 'Résiliations',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: fold(view.terminations),
        lineStyle: { color: PALETTE.red, width: 2 },
        itemStyle: { color: PALETTE.red },
      },
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
 * **Adoption et churn par territoire** : **deux barres horizontales par zone** —
 * **Adoption** (vert) = pénétration = sociétés actives / acteurs visés (part de marché
 * conquise, instantané cumulé) ; **Churn** (rouge) = résiliées / (actives + résiliées)
 * = part de la base onboardée qui est repartie (BORNÉ 0–100 %). Bases différentes
 * (l'adoption se rapporte au marché, le churn à la base onboardée), donc pas empilables.
 * L'étiquette d'adoption porte le taux + le delta de période (« 12 % · +3 pts »).
 */
/** Tri par territoire : par adoption ou par churn, ↑ ou ↓. */
export type AdoptionSort = 'adoption-desc' | 'adoption-asc' | 'churn-desc' | 'churn-asc';

export function adoptionOption(
  zones: readonly AdoptionZoneView[],
  sort: AdoptionSort = 'adoption-desc',
): EChartsOption {
  const key = sort.startsWith('churn')
    ? (z: AdoptionZoneView): number => z.lostRate
    : (z: AdoptionZoneView): number => z.penetration;
  const asc = [...zones].sort((a, b) => key(a) - key(b));
  // yAxis catégorie : data[0] en bas. `-desc` = plus fort en HAUT → data ascendante.
  const rows = sort.endsWith('desc') ? asc : [...asc].reverse();
  // Teintes sémantiques du thème : adoption = succès, churn = alerte (légende alignée).
  const success = themeColor('--fold-color-success', '#1a9e6a');
  const alert = themeColor('--fold-color-danger', '#dc2626');
  const muted = themeColor('--fold-color-text-muted', PALETTE.slate);
  const text = themeColor('--fold-color-text', '#1f2937');
  const adoption = rows.map((z) => ({
    value: pct(z.penetration),
    itemStyle: { color: success, borderRadius: [0, 4, 4, 0] },
    label: {
      show: true,
      position: 'right' as const,
      formatter: `${pct(z.penetration)} %${z.deltaPts > 0 ? ` · +${round1(z.deltaPts)} pts` : ''}`,
    },
  }));
  // Garde petit effectif : sous ce seuil de base onboardée, un taux n'a pas de valeur
  // statistique → barre atténuée + `n` affiché pour signaler que c'est du bruit.
  const MIN_BASE = 10;
  const churn = rows.map((z) => {
    const onboarded = z.activated + z.lost;
    const thin = onboarded < MIN_BASE;
    return {
      value: pct(z.lostRate),
      itemStyle: { color: alert, opacity: thin ? 0.35 : 1, borderRadius: [0, 4, 4, 0] },
      label: {
        show: z.lost > 0,
        position: 'right' as const,
        color: muted,
        formatter: `${pct(z.lostRate)} %${thin ? ` · n=${onboarded}` : ''}`,
      },
    };
  });
  return {
    grid: { left: 8, right: 108, top: 8, bottom: 32, containLabel: true },
    legend: {
      bottom: 0,
      textStyle: { color: PALETTE.slate },
      data: [
        { name: 'Adoption', itemStyle: { color: success } },
        { name: 'Churn', itemStyle: { color: alert } },
      ],
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params): string => {
        const first = Array.isArray(params) ? params[0] : params;
        const z = rows[toIndex(first)];
        return z === undefined
          ? ''
          : `${z.codePostal} ${z.ville}<br/>Adoption ${pct(z.penetration)} % (${z.activated}/${z.addressable} visés)<br/>Churn ${pct(z.lostRate)} % (${z.lost}/${z.activated + z.lost} onboardées)`;
      },
    },
    xAxis: { type: 'value', name: '%', min: 0, max: 100 },
    yAxis: [
      {
        type: 'category',
        data: rows.map((z) => `${z.codePostal}${z.ville === '' ? '' : ' ' + z.ville}`),
        axisLabel: { color: text },
      },
      // Second axe à DROITE : le pool disponible (acteurs visés) en bout de ligne.
      {
        type: 'category',
        position: 'right',
        data: rows.map((z) => `${z.addressable} visés`),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 11 },
      },
    ],
    series: [
      { name: 'Adoption', type: 'bar', barGap: '10%', data: adoption },
      { name: 'Churn', type: 'bar', data: churn },
    ],
  };
}

/**
 * **Taux de rattrapage** des tentatives de résiliation : **Global** en tête puis **par
 * catégorie** (mêmes teintes que le sunburst — la couleur suit la catégorie). Une
 * tentative rattrapée = un compte sauvé. Sous chaque barre de taux, **deux barres
 * fines** décomposent le rattrapage par **canal** : `auto` (plateforme, incentive
 * automatique) et `commercial` (sauvé à la main) — chacune part des tentatives, si
 * bien que leur somme fait le taux au-dessus. L'étiquette porte le taux + le détail.
 */
export function terminationRecoveryOption(view: TerminationStatsView): EChartsOption {
  const rows = [view.recovery, ...view.recoveryByReason].reverse(); // Global en HAUT.
  return {
    grid: { left: 8, right: 104, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v): string => `${Number(v)} %`,
    },
    xAxis: { type: 'value', name: '%', min: 0, max: 100 },
    yAxis: { type: 'category', data: rows.map((r) => r.label) },
    series: [
      recoverySeries('Rattrapage', rows, 15, 1, (r) => pct(r.rate), (r) =>
        r.attempts > 0 ? `${pct(r.rate)} % · ${r.recovered}/${r.attempts}` : '',
        true,
      ),
      recoverySeries('Auto (plateforme)', rows, 6, 0.4, (r) =>
        channelPct(r.recoveredAuto, r.attempts), (r) =>
        r.recoveredAuto > 0 ? `auto ${r.recoveredAuto}` : '',
      ),
      recoverySeries('Commercial', rows, 6, 0.82, (r) =>
        channelPct(r.recoveredSales, r.attempts), (r) =>
        r.recoveredSales > 0 ? `comm. ${r.recoveredSales}` : '',
      ),
    ],
  };
}

/** Couleur de catégorie du churn (global = teinte neutre), partagée avec le sunburst. */
function recoveryColor(r: TerminationRecovery): string {
  return r.reason === 'all' ? CHURN_GLOBAL_COLOR : CHURN_COLORS[r.reason];
}

/** Part d'un canal de rattrapage sur les tentatives, en % entier. */
function channelPct(count: number, attempts: number): number {
  return attempts === 0 ? 0 : Math.round((count / attempts) * 100);
}

/**
 * Une série de barres de rattrapage : couleur par **catégorie**, largeur + opacité
 * portant le **canal** (barre épaisse = taux ; fines = auto/commercial). L'étiquette
 * (canal + n) porte l'encodage secondaire pour ne pas distinguer par la couleur seule.
 */
/** En deçà, un taux de rattrapage est du bruit statistique — on le grise. */
const MIN_RECOVERY_ATTEMPTS = 5;

function recoverySeries(
  name: string,
  rows: readonly TerminationRecovery[],
  barWidth: number,
  opacity: number,
  valueOf: (r: TerminationRecovery) => number,
  labelOf: (r: TerminationRecovery) => string,
  /** Seule la barre de taux porte l'avertissement « n trop faible ». */
  primary = false,
): Record<string, unknown> {
  return {
    name,
    type: 'bar',
    barGap: '30%',
    barCategoryGap: '42%',
    barWidth,
    data: rows.map((r) => {
      // Effectif trop faible = bruit, pas signal : un 100 % sur 1 tentative n'est pas
      // un succès. On grise la barre et on affiche son « n » (même règle que l'adoption).
      const thin = r.attempts < MIN_RECOVERY_ATTEMPTS;
      return {
        value: valueOf(r),
        itemStyle: {
          color: thin ? PALETTE.slate : recoveryColor(r),
          opacity: thin ? opacity * 0.45 : opacity,
          borderRadius: [0, 3, 3, 0],
        },
        label: {
          show: true,
          position: 'right' as const,
          fontSize: 10,
          color: PALETTE.slate,
          formatter: thin ? (primary ? `n=${r.attempts} · trop peu` : '') : labelOf(r),
        },
      };
    }),
  };
}

/**
 * **Vélocité de rattrapage** (§ rétention) : le taux de rattrapage **semaine par
 * semaine** (ligne neutre, taille du point ∝ nombre de tentatives = fiabilité) et le
 * **taux cumulé** (ligne verte pointillée) qui lisse la trajectoire. La pente répond
 * à « réagit-on de mieux en mieux au churn ? » : qui monte = réaction plus efficace.
 * Un seul axe en % (pas de double échelle) ; le volume passe dans la taille + tooltip.
 */
export function recoveryTrendOption(points: readonly RecoveryTrendPoint[]): EChartsOption {
  const weeks = points.map((p) => weekLabel(p.weekStart));
  const cumulative = cumulativeRates(points);
  const weekly: Record<string, unknown> = {
    name: 'Taux hebdomadaire',
    type: 'line',
    data: points.map((p) => pct(p.rate)),
    symbolSize: (_v: unknown, params: unknown): number => 8 + 2.4 * (points[toIndex(params)]?.attempts ?? 0),
    lineStyle: { color: CHURN_GLOBAL_COLOR, width: 2 },
    itemStyle: { color: CHURN_GLOBAL_COLOR },
  };
  const trend: Record<string, unknown> = {
    name: 'Taux cumulé',
    type: 'line',
    smooth: true,
    symbol: 'none',
    data: cumulative.map((r) => pct(r)),
    lineStyle: { color: PALETTE.green, width: 2, type: 'dashed' },
    itemStyle: { color: PALETTE.green },
  };
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: {
      trigger: 'axis',
      formatter: (params): string => recoveryTrendTooltip(points, cumulative, params),
    },
    xAxis: { type: 'category', data: weeks, boundaryGap: false },
    yAxis: { type: 'value', name: '%', min: 0, max: 100, axisLabel: { formatter: '{value} %' } },
    series: [weekly, trend],
  };
}

/** Taux de rattrapage **cumulé** semaine par semaine (lisse la trajectoire). */
function cumulativeRates(points: readonly RecoveryTrendPoint[]): number[] {
  let attempts = 0;
  let recovered = 0;
  return points.map((p) => {
    attempts += p.attempts;
    recovered += p.recovered;
    return attempts > 0 ? recovered / attempts : 0;
  });
}

/** Tooltip vélocité : semaine, taux hebdo (rattrapées/tentatives) et taux cumulé. */
function recoveryTrendTooltip(
  points: readonly RecoveryTrendPoint[],
  cumulative: readonly number[],
  params: unknown,
): string {
  const first = Array.isArray(params) ? params[0] : params;
  const i = toIndex(first);
  const p = points[i];
  if (p === undefined) {
    return '';
  }
  return `Sem. ${weekLabel(p.weekStart)}<br/>Hebdo ${pct(p.rate)} % (${p.recovered}/${p.attempts})<br/>Cumulé ${pct(cumulative[i] ?? 0)} %`;
}

/**
 * **Délai de réaction au churn par catégorie** (boxplot) : combien de jours entre la
 * déclaration de résiliation et l'action qui l'a rattrapée, **une boîte par motif** —
 * mêmes teintes que le sunburst. Boîte basse = on sauve vite (le tarif se négocie) ;
 * boîte haute = motif long à sauver (la qualité). Les **points rouges** = sauvetages
 * qui ont traîné (outliers hauts). Axe en jours.
 */
export function recoveryReactionOption(stats: readonly RecoveryReactionStat[]): EChartsOption {
  const outliers: Array<[number, number]> = [];
  stats.forEach((s, i) => s.box.outliers.forEach((o) => outliers.push([i, o])));
  const boxes: Record<string, unknown> = {
    type: 'boxplot',
    data: stats.map((s): Record<string, unknown> => {
      const color = CHURN_COLORS[s.reason];
      return {
        value: [s.box.low, s.box.q1, s.box.median, s.box.q3, s.box.high],
        itemStyle: { color: hexToRgba(color, 0.18), borderColor: color, borderWidth: 2 },
      };
    }),
  };
  const outlierPoints: Record<string, unknown> = {
    name: 'Sauvetage qui a traîné',
    type: 'scatter',
    data: outliers,
    symbolSize: 9,
    itemStyle: { color: PALETTE.red },
  };
  return {
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', data: stats.map((s) => s.label) },
    yAxis: { type: 'value', name: 'jours', min: 0 },
    series: [boxes, outlierPoints],
  };
}

/**
 * **Délai de réaction hebdo × catégorie** : l'axe X = les semaines, et pour chaque
 * semaine les catégories sont **groupées** côte à côte (une boîte par motif, teinte du
 * sunburst). On lit à la fois la vitesse *par motif* et son évolution semaine après
 * semaine (les boîtes qui descendent = on réagit plus vite). Axe en jours.
 */
export function recoveryReactionWeeklyOption(byWeek: RecoveryReactionByWeek): EChartsOption {
  const weeks = byWeek.weeks.map((w) => weekLabel(w));
  const series: Record<string, unknown>[] = byWeek.series.map((s): Record<string, unknown> => {
    const color = CHURN_COLORS[s.reason];
    return {
      name: s.label,
      type: 'boxplot',
      itemStyle: { color: hexToRgba(color, 0.18), borderColor: color, borderWidth: 2 },
      data: s.cells.map((c) =>
        c.box === null ? '-' : [c.box.low, c.box.q1, c.box.median, c.box.q3, c.box.high],
      ),
    };
  });
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'category', data: weeks },
    yAxis: { type: 'value', name: 'jours', min: 0 },
    series,
  };
}

/** `#rrggbb` → `rgba(r,g,b,a)` (fond translucide d'une boîte). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * **Marché vs volume** dans le temps, **indexé base 100** (même axe, pas de double
 * échelle) : la taille du marché visé (≈ plate) et le CA cumulé. L'écart entre les
 * deux courbes = la performance commerciale à marché donné. Le tooltip donne le CA €.
 */
export function marketVolumeOption(view: MarketVolumeView): EChartsOption {
  const pts = view.points;
  const weeks = pts.map((p) => weekLabel(p.weekStart));
  // Base robuste : la MOYENNE des 4 premières périodes non nulles, pas la 1re valeur.
  // En station, la 1re semaine de la fenêtre peut être une inter-saison à quasi zéro —
  // l'indice partirait alors de rien et toutes les lectures exploseraient.
  const baseVol = robustBase(pts.map((p) => p.volumeCents));
  const baseMkt = pts[0]?.marketActors ?? 0;
  const index = (v: number, base: number): number => (base > 0 ? Math.round((v / base) * 100) : 100);
  const euros = (cents: number): string =>
    (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: {
      trigger: 'axis',
      formatter: (params): string => {
        const arr = Array.isArray(params) ? params : [params];
        const p = pts[toIndex(arr[0])];
        return p === undefined
          ? ''
          : `${weekLabel(p.weekStart)}<br/>Marché ${p.marketActors} acteurs<br/>CA ${euros(p.volumeCents)}`;
      },
    },
    xAxis: { type: 'category', data: weeks, boundaryGap: false },
    yAxis: { type: 'value', name: 'indice (base 100)' },
    series: [
      {
        name: 'Marché (acteurs visés)',
        type: 'line',
        symbol: 'none',
        data: pts.map((p) => index(p.marketActors, baseMkt)),
        lineStyle: { color: PALETTE.slate, width: 2, type: 'dashed' },
        itemStyle: { color: PALETTE.slate },
      },
      {
        name: 'Volume (CA de la semaine)',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: pts.map((p) => index(p.volumeCents, baseVol)),
        lineStyle: { color: PALETTE.blue, width: 2 },
        areaStyle: { color: PALETTE.blue, opacity: 0.12 },
        itemStyle: { color: PALETTE.blue },
      },
    ],
  };
}

/** Palette catégorielle des secteurs NAF (validée CVD), assignée dans l'ordre. */
const SECTOR_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];

/**
 * **Mix des clients par territoire** : pour chaque zone, deux barres empilées à 100 %
 * par **secteur NAF** — Adoption (nos actives) et Churn (nos résiliées) — pour lire
 * *quels types de clients* on gagne vs on perd. Le tooltip rapporte le compte et la
 * **pénétration du secteur** (`actives ÷ pool NAF`) pour tenir compte du pool.
 */
export function sectorMixOption(view: MarketSectorsView): EChartsOption {
  const zones = view.zones;
  const sectors = (zones[0]?.sectors ?? []).map((s) => ({ code: s.code, label: s.label }));
  const yLabels = zones.map((z) => `${z.codePostal}${z.ville === '' ? '' : ' ' + z.ville}`);
  const series: Record<string, unknown>[] = [];
  sectors.forEach((sec, i) => {
    const color = SECTOR_PALETTE[i % SECTOR_PALETTE.length] ?? PALETTE.slate;
    series.push(sectorSeries(sec.code, sec.label, zones, color, 'adoption'));
    series.push(sectorSeries(sec.code, sec.label, zones, color, 'churn'));
  });
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'item', formatter: sectorTooltip },
    xAxis: { type: 'value', name: '% du mix', min: 0, max: 100 },
    yAxis: { type: 'category', data: yLabels },
    series,
  };
}

/** Une série secteur pour un empilement (adoption/churn) : part du mix + compte + pénétration. */
function sectorSeries(
  code: string,
  label: string,
  zones: MarketSectorsView['zones'],
  color: string,
  stack: 'adoption' | 'churn',
): Record<string, unknown> {
  return {
    name: label,
    type: 'bar',
    stack,
    barMaxWidth: 26,
    itemStyle: { color, opacity: stack === 'churn' ? 0.5 : 1 },
    data: zones.map((z) => {
      const s = z.sectors.find((x) => x.code === code);
      const total = z.sectors.reduce((sum, x) => sum + (stack === 'churn' ? x.terminated : x.active), 0);
      const n = stack === 'churn' ? (s?.terminated ?? 0) : (s?.active ?? 0);
      const pen = s !== undefined && s.pool > 0 ? Math.round((s.active / s.pool) * 100) : 0;
      return { value: total > 0 ? Math.round((n / total) * 100) : 0, n, pen, kind: stack };
    }),
  };
}

/** Tooltip d'un segment de mix : secteur, part, compte, et pénétration du secteur. */
function sectorTooltip(param: unknown): string {
  if (typeof param !== 'object' || param === null) {
    return '';
  }
  const p = param as Record<string, unknown>;
  const d = (typeof p['data'] === 'object' && p['data'] !== null ? p['data'] : {}) as Record<
    string,
    unknown
  >;
  const kind = d['kind'] === 'churn' ? 'Perdu' : 'Gagné';
  const n = typeof d['n'] === 'number' ? d['n'] : 0;
  const value = typeof d['value'] === 'number' ? d['value'] : 0;
  const pen = typeof d['pen'] === 'number' ? d['pen'] : 0;
  return `${String(p['seriesName'])} · ${kind}<br/>${value} % du mix · ${n} sociétés<br/>pénétration secteur ${pen} %`;
}

/**
 * **CA par secteur NAF dans le temps** : aires empilées (une par secteur, teinte du
 * mix secteurs). L'enveloppe du haut = le CA total ; l'épaisseur d'une bande = la
 * contribution du secteur. On voit quels types de clients portent la croissance du CA.
 */
export function sectorRevenueOption(view: SectorRevenueView, grain: SectorGrain = 'week'): EChartsOption {
  const bucketed = bucketSectorRevenue(view, grain);
  const series: Record<string, unknown>[] = bucketed.series.map((s, i) => ({
    name: s.label,
    type: 'line',
    stack: 'ca',
    smooth: true,
    symbol: 'none',
    lineStyle: { width: 1 },
    areaStyle: { opacity: 0.6 },
    itemStyle: { color: SECTOR_PALETTE[i % SECTOR_PALETTE.length] ?? PALETTE.slate },
    data: s.values.map((cents) => Math.round(cents / 100)),
  }));
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v): string => `${Number(v).toLocaleString('fr-FR')} €`,
    },
    xAxis: { type: 'category', data: [...bucketed.labels], boundaryGap: false },
    yAxis: { type: 'value', name: '€' },
    series,
  };
}

/**
 * Base d'indexation **robuste** : moyenne des `take` premières valeurs non nulles.
 * Indexer sur la toute première valeur est fragile en saisonnier (une inter-saison à
 * quasi zéro ferait exploser tout l'indice). Renvoie 0 si la série est vide.
 */
function robustBase(values: readonly number[], take = 4): number {
  const seed = values.filter((v) => v > 0).slice(0, take);
  return seed.length === 0 ? 0 : seed.reduce((s, v) => s + v, 0) / seed.length;
}

/** Montant euros entier depuis des centimes, formaté fr-FR. */
function eurosLabel(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

/**
 * **Chiffre d'affaires dans le temps** : aire simple du CA (TTC) par période, à la
 * granularité choisie. La donnée de tête de l'onglet Volume / CA — le niveau et la
 * tendance du CA encaissé.
 */
export function revenueTrendOption(view: OrderMetricsView, grain: SectorGrain = 'week'): EChartsOption {
  const axis = bucketAxis(view.days, grain);
  const ca = foldDaily(axis, view.caCents).map((c) => Math.round(c / 100));
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v): string => `${Number(v).toLocaleString('fr-FR')} €` },
    xAxis: { type: 'category', data: [...axis.labels], boundaryGap: false },
    yAxis: { type: 'value', name: '€' },
    series: [
      {
        name: 'CA (TTC)',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: ca,
        lineStyle: { color: PALETTE.blue, width: 2 },
        areaStyle: { color: PALETTE.blue, opacity: 0.15 },
        itemStyle: { color: PALETTE.blue },
      },
    ],
  };
}

/**
 * **CA vs nombre de commandes** : deux courbes INDEXÉES base 100 (même axe, pas de
 * double échelle). Le CA qui monte plus vite que le nombre de commandes = **panier
 * moyen** en hausse ; l'écart entre les deux se lit directement. Tooltip = valeurs brutes.
 */
export function caVsOrdersOption(view: OrderMetricsView, grain: SectorGrain = 'week'): EChartsOption {
  const axis = bucketAxis(view.days, grain);
  // CA **marchandises HT** : le TTC bougerait au gré de la TVA et des frais de port
  // sans qu'un euro de marchandise ait changé — le panier moyen serait alors faux.
  const ca = foldDaily(axis, view.caGoodsCents);
  const orders = foldDaily(axis, view.orders);
  const baseCa = robustBase(ca);
  const baseOrders = robustBase(orders);
  const index = (v: number, base: number): number => (base > 0 ? Math.round((v / base) * 100) : 100);
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: {
      trigger: 'axis',
      formatter: (params): string => {
        const arr = Array.isArray(params) ? params : [params];
        const i = toIndex(arr[0]);
        const basket = (orders[i] ?? 0) > 0 ? (ca[i] ?? 0) / (orders[i] ?? 1) : 0;
        return `${axis.labels[i] ?? ''}<br/>CA ${eurosLabel(ca[i] ?? 0)}<br/>${orders[i] ?? 0} commandes<br/>panier moyen ${eurosLabel(basket)}`;
      },
    },
    xAxis: { type: 'category', data: [...axis.labels], boundaryGap: false },
    yAxis: { type: 'value', name: 'indice (base 100)' },
    series: [
      {
        name: 'CA marchandises (HT)',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: ca.map((c) => index(c, baseCa)),
        lineStyle: { color: PALETTE.blue, width: 2 },
        itemStyle: { color: PALETTE.blue },
      },
      {
        name: 'Nombre de commandes',
        type: 'line',
        symbol: 'none',
        data: orders.map((o) => index(o, baseOrders)),
        lineStyle: { color: PALETTE.slate, width: 2, type: 'dashed' },
        itemStyle: { color: PALETTE.slate },
      },
    ],
  };
}

/**
 * **CA par type de commande** : aires empilées € — commandes **uniques** (ponctuelles)
 * vs **récurrentes** (issues d'un abonnement). L'enveloppe = le CA total, l'épaisseur de
 * chaque bande = la part portée par ce type. On lit quel type de commande porte le CA.
 */
export function caByTypeOption(view: OrderMetricsView, grain: SectorGrain = 'week'): EChartsOption {
  const axis = bucketAxis(view.days, grain);
  const oneShot = foldDaily(axis, view.caOneShotCents).map((c) => Math.round(c / 100));
  const recurring = foldDaily(axis, view.caRecurringCents).map((c) => Math.round(c / 100));
  const band = (name: string, color: string, data: number[]): Record<string, unknown> => ({
    name,
    type: 'line',
    stack: 'ca',
    smooth: true,
    symbol: 'none',
    lineStyle: { width: 1, color },
    areaStyle: { color, opacity: 0.55 },
    itemStyle: { color },
    data,
  });
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: PALETTE.slate } },
    tooltip: { trigger: 'axis', valueFormatter: (v): string => `${Number(v).toLocaleString('fr-FR')} €` },
    xAxis: { type: 'category', data: [...axis.labels], boundaryGap: false },
    yAxis: { type: 'value', name: '€' },
    series: [
      band('Commandes uniques', PALETTE.blue, oneShot),
      band('Commandes récurrentes', PALETTE.violet, recurring),
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
