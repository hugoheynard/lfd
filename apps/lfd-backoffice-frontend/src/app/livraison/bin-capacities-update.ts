import type { BinCapacitiesView, BinCapacityView } from '@lfd/contracts';

/**
 * La grille des contenances après l'écriture d'UNE case, sans la relire :
 * relire remplacerait les lignes sous le curseur au moment où l'on passe à la
 * case suivante. `units` à `null` retire la contenance de la case.
 */
export function withCapacity(
  view: BinCapacitiesView,
  binTypeId: string,
  sku: string,
  units: number | null,
): BinCapacitiesView {
  const others = view.capacities.filter((cell) => cell.binTypeId !== binTypeId || cell.sku !== sku);
  const capacities: readonly BinCapacityView[] =
    units === null ? others : [...others, { binTypeId, sku, units }];
  return { ...view, capacities };
}
