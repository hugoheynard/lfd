import type { BarSeriesOption, EChartsOption } from 'echarts';

import type { OrderMixBucket } from './order-mix';

/**
 * Le commandé d'une période en **barres empilées**, croisant régime et origine.
 *
 * Deux encodages, deux dimensions :
 *
 * - la **teinte** dit le régime — azur pour ce qui est porté au compte, ambre
 *   pour ce qui est réglé à la commande. Bleu contre orange est la paire la plus
 *   sûre en vision des couleurs déficiente, et c'est la seule distinction que la
 *   comptabilité regarde ;
 * - la **hachure** dit le récurrent. Elle traverse les deux teintes, si bien que
 *   la part des paniers récurrents se lit sur toute la barre — alors qu'un
 *   troisième segment aurait fait une barre plus haute que le total.
 *
 * Le ton clair/foncé double la hachure : elle seule suffirait à l'écran, pas à
 * l'impression ni sous forte luminosité.
 */

/** Au compte — la teinte azur de l'application (cf. l'override `info` dans `styles.scss`). */
const ACCOUNT_RECURRING = '#075985';
const ACCOUNT_ONE_OFF = '#38bdf8';

/** À la commande — l'ambre, l'autre pôle de la paire bleu/orange. */
const PER_ORDER_RECURRING = '#92400e';
const PER_ORDER_ONE_OFF = '#f59e0b';

/**
 * Hachure diagonale claire : le récurrent, lisible sur les deux teintes.
 *
 * Une **fonction** et non une constante : ECharts veut des tableaux mutables et
 * se réserve le droit de les toucher — deux séries partageant le même objet
 * partageraient ce qu'il en fait.
 */
type Decal = NonNullable<NonNullable<BarSeriesOption['itemStyle']>['decal']>;

function recurringDecal(): Decal {
  return {
    symbol: 'rect',
    dashArrayX: [1, 0],
    dashArrayY: [3, 4],
    rotation: -Math.PI / 4,
    color: 'rgba(255, 255, 255, 0.55)',
  };
}

/** Valeur d'un token fold, avec repli — SSR-safe. */
function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Un segment de la pile. Les euros, pas les centimes : l'axe se lit en euros. */
function segment(
  name: string,
  color: string,
  values: readonly number[],
  options: { readonly decal: boolean; readonly top: boolean },
  surface: string,
): BarSeriesOption {
  return {
    type: 'bar',
    name,
    stack: 'commande',
    data: [...values],
    barMaxWidth: 34,
    itemStyle: {
      color,
      // Un filet à la couleur du fond sépare les segments : sans lui, deux tons
      // voisins se touchent et la pile se lit comme un seul bloc.
      borderColor: surface,
      borderWidth: 1,
      borderRadius: options.top ? [3, 3, 0, 0] : 0,
      ...(options.decal ? { decal: recurringDecal() } : {}),
    },
  };
}

/** L'option ECharts du graphe de mix. Fonction pure — les couleurs de thème mises à part. */
export function orderMixOption(mix: readonly OrderMixBucket[]): EChartsOption {
  const surface = themeColor('--fold-color-surface-card', '#ffffff');
  const euros = (cents: readonly number[]): number[] => cents.map((c) => Math.round(c / 100));

  return {
    grid: { left: 4, right: 12, top: 40, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value) => `${Number(value).toLocaleString('fr-FR')} €`,
    },
    legend: { top: 0 },
    xAxis: { type: 'category', data: mix.map((bucket) => bucket.label) },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => `${value.toLocaleString('fr-FR')} €` },
    },
    // L'ordre de la pile est celui de la lecture : au compte en bas (le socle
    // facturé), à la commande au-dessus ; et dans chaque régime, le récurrent
    // d'abord — c'est le plancher, ce sur quoi le client revient sans qu'on
    // demande.
    series: [
      segment(
        'Au compte · récurrent',
        ACCOUNT_RECURRING,
        euros(mix.map((bucket) => bucket.accountRecurringCents)),
        { decal: true, top: false },
        surface,
      ),
      segment(
        'Au compte',
        ACCOUNT_ONE_OFF,
        euros(mix.map((bucket) => bucket.accountOneOffCents)),
        { decal: false, top: false },
        surface,
      ),
      segment(
        'À la commande · récurrent',
        PER_ORDER_RECURRING,
        euros(mix.map((bucket) => bucket.perOrderRecurringCents)),
        { decal: true, top: false },
        surface,
      ),
      segment(
        'À la commande',
        PER_ORDER_ONE_OFF,
        euros(mix.map((bucket) => bucket.perOrderOneOffCents)),
        { decal: false, top: true },
        surface,
      ),
    ],
  };
}
