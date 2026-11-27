import type { ProductionLineOption } from "../../../channels/commerce/day-orders.reader.js";

/** Ce que l'addition lit d'une commande : ses lignes et leurs options. */
export interface OptionedOrder {
  readonly lines: readonly {
    readonly sku: string;
    readonly options?: readonly ProductionLineOption[];
  }[];
}

/**
 * **Les options d'un article, toutes commandes confondues** — « 4 pains de
 * campagne, dont 2 tranchés » sur la fiche d'atelier
 * (`documentation/catalogue/plan-options-de-commande.md`, § 3.4). Pur.
 *
 * Additionnées par groupe et par choix, dans l'ordre où elles apparaissent ;
 * au poids, ce sont des grammes, comme la ligne. Un article sans option est
 * absent de la table. Le compte à produire n'en dépend pas.
 */
export function optionsBySku(
  orders: readonly OptionedOrder[],
): ReadonlyMap<string, readonly ProductionLineOption[]> {
  const bySku = new Map<string, Map<string, ProductionLineOption>>();
  for (const line of orders.flatMap((order) => order.lines)) {
    for (const option of line.options ?? []) {
      const choices = bySku.get(line.sku) ?? new Map<string, ProductionLineOption>();
      const key = JSON.stringify([option.groupName, option.choiceLabel]);
      const quantity = (choices.get(key)?.quantity ?? 0) + option.quantity;
      choices.set(key, { ...option, quantity });
      bySku.set(line.sku, choices);
    }
  }
  return new Map([...bySku].map(([sku, choices]) => [sku, [...choices.values()]]));
}
