import type {
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "../entities/production-day.js";

/** Une part d'un article : une couleur de destination (`null` = neutre) et sa quantité. */
export interface CountColorShare {
  readonly color: string | null;
  readonly quantity: number;
}

/**
 * **La répartition du jour entre les couleurs de destination** (décision de
 * Hugo du 2026-10-22, plan de la planche des documents v2, §0 bis) — le seul
 * camembert, en haut du compte à produire.
 *
 * Lue dans ce que la journée a FIGÉ : les lignes de chaque commande et de
 * chaque réassort, les mêmes que `countOf` additionne — si bien que la somme
 * des parts est le total de pièces du compte. Une commande sans couleur, et
 * tout réassort (qui n'est pas une commande et n'a pas de couleur), tombent
 * dans la part neutre `null`.
 *
 * Pure et déterministe : les parts colorées par teinte croissante, la neutre
 * en dernier — deux tirages rendent le même dessin.
 */
export function countColorSharesOf(
  orders: readonly ProductionOrderSnapshot[],
  resupplies: readonly ProductionResupplySnapshot[],
  colors: ReadonlyMap<string, string>,
): readonly CountColorShare[] {
  const shares = new Map<string | null, number>();
  const add = (color: string | null, quantity: number): void => {
    shares.set(color, (shares.get(color) ?? 0) + quantity);
  };
  for (const order of orders) {
    const color = colors.get(order.orderId) ?? null;
    order.lines.forEach((line) => add(color, line.quantity));
  }
  for (const resupply of resupplies) {
    resupply.lines.forEach((line) => add(null, line.quantity));
  }
  return sortedShares(shares);
}

function sortedShares(shares: ReadonlyMap<string | null, number>): readonly CountColorShare[] {
  return [...shares]
    .map(([color, quantity]) => ({ color, quantity }))
    .filter((share) => share.quantity > 0)
    .sort((left, right) => {
      if (left.color === right.color) {
        return 0;
      }
      if (left.color === null) {
        return 1;
      }
      return right.color === null ? -1 : left.color.localeCompare(right.color);
    });
}
