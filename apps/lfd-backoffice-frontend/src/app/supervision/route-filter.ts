import type { LogisticsCategory } from '../shared/logistics-colors/logistics-category';

/**
 * **Le filtre d'acheminement des colonnes Colisage et Retrait** (Hugo,
 * 2026-11-01) : une option par acheminement — « Retrait <site> », « Livraison »
 * —, plusieurs cochables à la fois. Rien de coché = tout : il n'y a pas
 * d'option « Tous » factice.
 *
 * La clé d'une option est le LIBELLÉ du badge d'acheminement que porte la
 * carte (`fulfillmentModeOf`) : l'option et le badge disent la même chose, et
 * deux retraits au même site sous deux clientèles tombent dans la même option.
 */
export interface RouteOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
  /** La catégorie de la première commande de l'option — le rendu du badge dans le menu. */
  readonly category: LogisticsCategory;
}

/** Les acheminements présents, par ordre alphabétique, avec leur compte. */
export function routeOptions<T>(
  items: readonly T[],
  modeOf: (item: T) => LogisticsCategory,
): readonly RouteOption[] {
  const byLabel = new Map<string, { category: LogisticsCategory; count: number }>();
  for (const item of items) {
    const category = modeOf(item);
    const seen = byLabel.get(category.label);
    byLabel.set(category.label, {
      category: seen?.category ?? category,
      count: (seen?.count ?? 0) + 1,
    });
  }
  return [...byLabel]
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([label, { category, count }]) => ({ value: label, label, count, category }));
}

/** Les commandes des acheminements cochés ; rien de coché = toutes. */
export function inRoutes<T>(
  items: readonly T[],
  selected: readonly string[],
  modeOf: (item: T) => LogisticsCategory,
): readonly T[] {
  if (selected.length === 0) {
    return items;
  }
  const wanted = new Set(selected);
  return items.filter((item) => wanted.has(modeOf(item).label));
}
