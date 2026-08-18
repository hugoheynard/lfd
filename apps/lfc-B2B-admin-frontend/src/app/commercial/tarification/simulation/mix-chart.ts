import type { EChartsOption } from 'echarts';

import type { CategoryMix } from './mercuriale-mix';

/**
 * **La forme suit la donnée, et c'est une règle, pas un goût.**
 *
 * Sans palier dans la grille, chaque prix est plat : la part de chaque rayon ne
 * dépend plus du volume. Une aire empilée dessinerait alors des bandes
 * rigoureusement parallèles — un graphique qui bouge dans le temps pour dire que
 * rien ne bouge. Le camembert dit la même chose en un coup d'œil, honnêtement.
 *
 * Dès qu'un palier existe, la part **dérive** : le rayon qui porte le palier
 * devient relativement moins cher à mesure que le plan grossit. Là, l'aire est le
 * seul tracé qui le montre.
 */

/** Jeu Okabe-Ito étendu — huit teintes séparables, et pas une de plus. */
const CATEGORY_TONES = [
  '#0072b2',
  '#d55e00',
  '#009e73',
  '#cc79a7',
  '#56b4e9',
  '#e69f00',
  '#6a3d9a',
  '#8c8c8c',
] as const;

// Au-delà du jeu, la teinte neutre — mais `foldExtras` a déjà fondu la queue en
// « Autres », de sorte que ce repli ne devrait jamais servir.
function toneAt(index: number): string {
  return CATEGORY_TONES[index] ?? CATEGORY_TONES[7];
}

function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const euros = (cents: number): number => Math.round(cents / 100);

/** L'aire empilée **en part du total** : ce qui se lit ici est un partage, pas un montant. */
export function mixAreaOption(mix: CategoryMix): EChartsOption {
  const muted = themeColor('--fold-color-text-muted', '#64748b');
  const grid = themeColor('--fold-color-border', '#e2e8f0');
  const totals = mix.ratios.map((_, index) =>
    mix.categories.reduce((sum, category) => sum + (category.revenueByRatio[index] ?? 0), 0),
  );
  return {
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (value) => `${Number(value).toFixed(1)} %` },
    legend: {
      show: true,
      top: 0,
      itemHeight: 8,
      itemWidth: 14,
      textStyle: { color: muted, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: mix.ratios.map((ratio) => `${String(Math.round(ratio * 100))} %`),
      axisLabel: { color: muted, fontSize: 10, interval: 3 },
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: muted, fontSize: 10, formatter: '{value} %' },
      splitLine: { lineStyle: { color: grid, type: 'dashed' } },
    },
    series: mix.categories.map((category, index) => ({
      name: category.name,
      type: 'line' as const,
      stack: 'part',
      // Une part est bornée : l'empilement se fait sur des pourcentages calculés
      // ici, et non laissé à un `stack` de montants qu'il faudrait relire.
      data: category.revenueByRatio.map((cents, position) => {
        const total = totals[position] ?? 0;
        return total === 0 ? 0 : Number(((cents / total) * 100).toFixed(2));
      }),
      smooth: false,
      symbol: 'none',
      lineStyle: { width: 1, color: toneAt(index) },
      areaStyle: { color: toneAt(index), opacity: 0.85 },
      itemStyle: { color: toneAt(index) },
    })),
  };
}

/** Le camembert du plan tenu : un partage figé, parce qu'il ne bouge pas. */
export function mixPieOption(mix: CategoryMix): EChartsOption {
  const muted = themeColor('--fold-color-text-muted', '#64748b');
  const surface = themeColor('--fold-color-surface-card', '#ffffff');
  const atPlan = mix.ratios.indexOf(1);
  return {
    tooltip: {
      trigger: 'item',
      valueFormatter: (value) => `${Number(value).toLocaleString('fr-FR')} €`,
    },
    legend: {
      show: true,
      bottom: 0,
      itemHeight: 8,
      itemWidth: 14,
      textStyle: { color: muted, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        // Un anneau plutôt qu'un disque : l'œil compare mieux des arcs que des
        // angles pleins, et le centre sert à écrire le total.
        radius: ['48%', '72%'],
        center: ['50%', '45%'],
        itemStyle: { borderColor: surface, borderWidth: 2 },
        label: { color: muted, fontSize: 11, formatter: '{b} · {d} %' },
        labelLine: { length: 8, length2: 8 },
        data: mix.categories.map((category, index) => ({
          name: category.name,
          value: euros(atPlan === -1 ? 0 : (category.revenueByRatio[atPlan] ?? 0)),
          itemStyle: { color: toneAt(index) },
        })),
      },
    ],
  };
}
