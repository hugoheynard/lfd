/**
 * **L'attribution des commandes aux suggestions décidées** (RS6,
 * `suggestions-du-staff.md` §8.2) — pure, sans horloge ni base.
 *
 * Les compteurs d'audience sont anonymes : aucun ne dit QUI a ajouté. Une
 * commande ne se relie donc pas à un ajout, et l'attribution est une
 * ESTIMATION, faite case par case — un jour métier × un article :
 *
 * 1. le plafond est le plus petit de deux nombres : les ajouts depuis des
 *    suggestions ce jour-là, et la quantité commandée ce jour-là ; un jour
 *    sans ajout n'attribue rien, un jour sans commande non plus ;
 * 2. quand plusieurs règles ont fait ajouter le même article le même jour et
 *    que le plafond ne suffit pas à toutes, il se partage au prorata de leurs
 *    ajouts, au plus fort reste (entiers, rien ne se crée ni ne se perd) ;
 * 3. le chiffre d'affaires d'une part vaut cette quantité au prix HT moyen
 *    payé ce jour-là pour l'article — total HT des lignes ÷ quantité —,
 *    arrondi au centime une fois par part.
 *
 * Tout est entier : des pièces et des centimes.
 */

/** Les ajouts d'un article par une règle, un jour (compteur `suggestion_added`, source `staff`). */
export interface RuleDayAdds {
  readonly ruleId: string;
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

/** Ce qu'une règle a apporté, estimé. */
export interface RuleAttribution {
  readonly orderedEstimate: number;
  readonly revenueEstimateCents: number;
}

/** Une case (jour × article) et ses prétendants. */
interface Cell {
  readonly sales: SkuDaySales | undefined;
  readonly adds: RuleDayAdds[];
}

const cellKey = (day: string, sku: string): string => `${day}|${sku}`;

/** Les parts de chaque règle, par règle. Une règle sans ajout n'y figure pas. */
export function attributeOrders(
  adds: readonly RuleDayAdds[],
  sales: readonly SkuDaySales[],
): ReadonlyMap<string, RuleAttribution> {
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
    for (const [ruleId, quantity] of shareCell(cell)) {
      const total = totals.get(ruleId) ?? { orderedEstimate: 0, revenueEstimateCents: 0 };
      total.orderedEstimate += quantity;
      total.revenueEstimateCents += revenueOf(quantity, cell.sales);
      totals.set(ruleId, total);
    }
  }
  return totals;
}

/** Le plafond d'une case, partagé entre ses règles. */
function shareCell(cell: Cell): ReadonlyMap<string, number> {
  const ordered = cell.sales?.quantity ?? 0;
  const byRule = new Map<string, number>();
  for (const row of cell.adds) {
    byRule.set(row.ruleId, (byRule.get(row.ruleId) ?? 0) + row.added);
  }
  const added = [...byRule.values()].reduce((sum, count) => sum + count, 0);
  if (added <= ordered) {
    return byRule;
  }
  return largestRemainder(byRule, added, ordered);
}

/**
 * Partage `cap` (< `added`) au prorata des ajouts : la part entière d'abord,
 * puis une pièce de plus aux plus forts restes — à égalité, l'id le plus
 * petit, pour qu'une même base rende toujours les mêmes chiffres.
 */
function largestRemainder(
  byRule: ReadonlyMap<string, number>,
  added: number,
  cap: number,
): ReadonlyMap<string, number> {
  const shares = [...byRule].map(([ruleId, count]) => ({
    ruleId,
    quantity: Math.floor((count * cap) / added),
    remainder: (count * cap) % added,
  }));
  let left = cap - shares.reduce((sum, share) => sum + share.quantity, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.ruleId.localeCompare(b.ruleId),
  );
  for (const share of byRemainder) {
    if (left === 0) {
      break;
    }
    share.quantity += 1;
    left -= 1;
  }
  return new Map(shares.map((share) => [share.ruleId, share.quantity]));
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
