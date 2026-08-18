import type { PricingCategoryView } from '@lfd/contracts';

import { floorCentsOf } from '../grille/mercuriale-row';

/** Où le bloc de simulation s'insère, et avec quelles données d'article. */
export interface SimulationSlot {
  readonly categoryId: string;
  /** Le rang de l'article dans son rayon — les lignes suivantes se décalent d'un cran. */
  readonly index: number;
  /** La rangée du bloc lui-même : juste sous sa ligne. */
  readonly gridRow: number;
  readonly sku: string;
  readonly name: string;
  readonly catalogCents: number;
  readonly floorCents: number | null;
}

/**
 * **L'article simulé, retrouvé dans le tableau.**
 *
 * Hors du composant parce que c'est une recherche, pas un rendu — et parce que
 * le décalage des lignes qui suivent est la seule chose qui puisse casser
 * silencieusement la grille : un rang faux ne jette pas, il superpose deux
 * articles dans la même rangée.
 */
export function locateSimulation(
  categories: readonly PricingCategoryView[],
  sku: string | null,
): SimulationSlot | null {
  if (sku === null) {
    return null;
  }
  for (const category of categories) {
    const index = category.items.findIndex((item) => item.sku === sku);
    const item = category.items[index];
    if (item === undefined) {
      continue;
    }
    return {
      categoryId: category.id,
      index,
      gridRow: index + 2,
      sku,
      name: item.name,
      catalogCents: item.canonicalCents,
      floorCents: floorCentsOf(item.effectiveFloor, item.canonicalCents),
    };
  }
  return null;
}

/**
 * La rangée d'une ligne, **le bloc de simulation compris**.
 *
 * Le bloc occupe une rangée entière : tout ce qui le suit dans le même rayon
 * descend d'un cran. Sans ce décalage, la grille placerait la ligne suivante
 * SOUS le bloc et par-dessus la suivante encore.
 */
export function gridRowOf(slot: SimulationSlot | null, categoryId: string, index: number): number {
  const shifts = slot !== null && slot.categoryId === categoryId && index > slot.index;
  return index + 1 + (shifts ? 1 : 0);
}
