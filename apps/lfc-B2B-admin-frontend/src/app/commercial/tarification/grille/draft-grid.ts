import type { TemplateLinePayload } from '@lfd/contracts';

import { centsOf } from './price-field';

/** Les paliers saisis pour un article — en chaînes, cf. `price-field`. */
export interface DraftTier {
  readonly minQuantity: string;
  readonly unitPrice: string;
}

/** La grille en cours de saisie : par SKU. Absent = article non tarifé. */
export type DraftGrid = ReadonlyMap<string, readonly DraftTier[]>;

/**
 * **Les transformations de la grille**, pures et hors du composant.
 *
 * Chacune rend une NOUVELLE carte plutôt que de muter : c'est ce qui permet au
 * signal de la page de se comparer, et donc à la grille `OnPush` de ne
 * redessiner que lorsqu'elle a changé.
 */
export function withTiers(grid: DraftGrid, sku: string, tiers: readonly DraftTier[]): DraftGrid {
  const next = new Map(grid);
  next.set(sku, tiers);
  return next;
}

export function without(grid: DraftGrid, sku: string): DraftGrid {
  const next = new Map(grid);
  next.delete(sku);
  return next;
}

export function tiersOf(grid: DraftGrid, sku: string): readonly DraftTier[] {
  return grid.get(sku) ?? [];
}

/** Le prix d'entrée saisi pour un article, en centimes. `null` si illisible. */
export function entryOf(grid: DraftGrid, sku: string): number | null {
  const first = tiersOf(grid, sku)[0];
  return first === undefined ? null : centsOf(first.unitPrice);
}

/**
 * **La grille → ce qui part au serveur.**
 *
 * Un palier **entièrement vide** s'oublie : c'est l'ajout qu'on n'a pas rempli.
 * Un palier **à moitié rempli** fait tomber sa ligne — c'est une faute de frappe,
 * et zéro est un prix réel ici : le compléter d'office poserait un prix que
 * personne n'a voulu, chez un client.
 *
 * Les autres refus (grille qui monte, doublons de seuil) restent au **serveur** :
 * ils valent aussi pour un import et un rattrapage, pas seulement pour cet écran.
 */
export function toLines(grid: DraftGrid): readonly TemplateLinePayload[] {
  return [...grid].flatMap(([sku, tiers]) => {
    const built = tiers.flatMap((tier) => {
      if (tier.minQuantity.trim() === '' && tier.unitPrice.trim() === '') {
        return [];
      }
      const minQuantity = Number.parseInt(tier.minQuantity, 10);
      const unitPriceCents = centsOf(tier.unitPrice);
      if (Number.isNaN(minQuantity) || minQuantity <= 0 || unitPriceCents === null) {
        return [null];
      }
      return [{ minQuantity, unitPriceCents }];
    });
    return built.length === 0 || built.some((tier) => tier === null)
      ? []
      : [{ sku, tiers: built.filter((tier) => tier !== null) }];
  });
}
