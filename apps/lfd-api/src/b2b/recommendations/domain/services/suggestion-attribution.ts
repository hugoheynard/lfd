/**
 * **L'attribution des commandes aux suggestions** (RS6,
 * `suggestions-du-staff.md` §8.2) — pure, sans horloge ni base.
 *
 * Les compteurs d'audience sont anonymes : aucun ne dit QUI a ajouté. Une
 * commande ne se relie donc pas à un ajout, et l'attribution est une
 * ESTIMATION, faite case par case — un jour métier × un article :
 *
 * 1. le plafond est le plus petit de deux nombres : les ajouts depuis des
 *    suggestions ce jour-là, et la quantité commandée ce jour-là ; un jour
 *    sans ajout n'attribue rien, un jour sans commande non plus ;
 * 2. quand plusieurs prétendants ont fait ajouter le même article le même
 *    jour et que le plafond ne suffit pas à tous, il se partage au prorata de
 *    leurs ajouts, au plus fort reste (entiers, rien ne se crée ni ne se
 *    perd). Un prétendant est une règle du staff OU un genre du calculé
 *    (Hugo, 2026-10-18) : les deux entrent dans le MÊME partage, pour qu'une
 *    pièce ne soit jamais comptée deux fois — les chiffres des règles du
 *    staff baissent quand le calculé a aussi fait ajouter l'article ;
 * 3. le chiffre d'affaires d'une part vaut cette quantité au prix HT moyen
 *    payé ce jour-là pour l'article — total HT des lignes ÷ quantité —,
 *    arrondi au centime une fois par part.
 *
 * Tout est entier : des pièces et des centimes.
 */

/**
 * Les ajouts d'un article par un prétendant, un jour (compteur
 * `suggestion_added`). `claimant` est opaque ici : l'id d'une règle du staff,
 * ou la clé d'un genre du calculé — deux prétendants distincts ne partagent
 * pas de clé, c'est à l'appelant de le garantir.
 */
export interface SuggestionDayAdds {
  readonly claimant: string;
  readonly day: string;
  readonly sku: string;
  readonly added: number;
}

/** Ce que les commandes passées un jour disent d'un article. */
export interface SkuDaySales {
  readonly day: string;
  readonly sku: string;
  readonly quantity: number;
  /** Somme des totaux HT des lignes, en centimes. */
  readonly revenueCents: number;
}

/** Ce qu'un prétendant a apporté, estimé. */
export interface SuggestionAttribution {
  readonly orderedEstimate: number;
  readonly revenueEstimateCents: number;
}

/** Une case (jour × article) et ses prétendants. */
interface Cell {
  readonly sales: SkuDaySales | undefined;
  readonly adds: SuggestionDayAdds[];
}

const cellKey = (day: string, sku: string): string => `${day}|${sku}`;

/** Les parts de chaque prétendant, par prétendant. Un prétendant sans ajout n'y figure pas. */
export function attributeOrders(
  adds: readonly SuggestionDayAdds[],
  sales: readonly SkuDaySales[],
): ReadonlyMap<string, SuggestionAttribution> {
  const salesOf = new Map(sales.map((row) => [cellKey(row.day, row.sku), row]));
  const cells = new Map<string, Cell>();
  for (const row of adds) {
    if (row.added <= 0) {
      continue;
    }
    const key = cellKey(row.day, row.sku);
    const cell = cells.get(key) ?? { sales: salesOf.get(key), adds: [] };
    cell.adds.push(row);
    cells.set(key, cell);
  }
  const totals = new Map<string, { orderedEstimate: number; revenueEstimateCents: number }>();
  for (const cell of cells.values()) {
    for (const [claimant, quantity] of shareCell(cell)) {
      const total = totals.get(claimant) ?? { orderedEstimate: 0, revenueEstimateCents: 0 };
      total.orderedEstimate += quantity;
      total.revenueEstimateCents += revenueOf(quantity, cell.sales);
      totals.set(claimant, total);
    }
  }
  return totals;
}

/** Le plafond d'une case, partagé entre ses prétendants. */
function shareCell(cell: Cell): ReadonlyMap<string, number> {
  const ordered = cell.sales?.quantity ?? 0;
  const byClaimant = new Map<string, number>();
  for (const row of cell.adds) {
    byClaimant.set(row.claimant, (byClaimant.get(row.claimant) ?? 0) + row.added);
  }
  const added = [...byClaimant.values()].reduce((sum, count) => sum + count, 0);
  if (added <= ordered) {
    return byClaimant;
  }
  return largestRemainder(byClaimant, added, ordered);
}

/**
 * Partage `cap` (< `added`) au prorata des ajouts : la part entière d'abord,
 * puis une pièce de plus aux plus forts restes — à égalité, la clé la plus
 * petite, pour qu'une même base rende toujours les mêmes chiffres.
 */
function largestRemainder(
  byClaimant: ReadonlyMap<string, number>,
  added: number,
  cap: number,
): ReadonlyMap<string, number> {
  const shares = [...byClaimant].map(([claimant, count]) => ({
    claimant,
    quantity: Math.floor((count * cap) / added),
    remainder: (count * cap) % added,
  }));
  let left = cap - shares.reduce((sum, share) => sum + share.quantity, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.claimant.localeCompare(b.claimant),
  );
  for (const share of byRemainder) {
    if (left === 0) {
      break;
    }
    share.quantity += 1;
    left -= 1;
  }
  return new Map(shares.map((share) => [share.claimant, share.quantity]));
}

/** `quantity` au prix HT moyen du jour, arrondi au centime le plus proche (moitié vers le haut). */
function revenueOf(quantity: number, sales: SkuDaySales | undefined): number {
  if (sales === undefined || quantity === 0 || sales.quantity === 0) {
    return 0;
  }
  return Math.floor((2 * quantity * sales.revenueCents + sales.quantity) / (2 * sales.quantity));
}

/** Ajoutées ÷ affichées en points de base (1 % = 100), arrondi ; `null` sans affichage. */
export function addRateBasisPoints(added: number, shown: number): number | null {
  const BASIS_POINTS = 10_000;
  if (shown === 0) {
    return null;
  }
  return Math.floor((2 * added * BASIS_POINTS + shown) / (2 * shown));
}
