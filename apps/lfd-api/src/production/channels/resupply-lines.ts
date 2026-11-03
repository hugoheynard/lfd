import type { SaleUnit } from "@lfd/money";

import { piecesOf, recordOf, saleUnitOf, textOf } from "./payload-fields.js";

/**
 * **Les lignes d'un réassort**, telles que deux faits du fournil les portent :
 * la liste à coliser (`production.resupply_list_drawn`, canal du colisage) et
 * le lancement « au plus tôt » (`production.resupply_launched`, canal du
 * commerce). Rangées à la racine des canaux le 2026-11-03 : le fait du
 * commerce les lisait jusque-là dans le canal du colisage.
 */

/** Une ligne d'un réassort à coliser : l'article, son nom, la quantité demandée. */
export interface ResupplyListLine {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des GRAMMES si `saleUnit = "weight"` — toujours un entier. */
  readonly quantity: number;
  /**
   * L'unité figée sur la ligne au commerce (L2b-3 du plan
   * `limites-de-commande/jour-meme-sur-stock.md`). Additive : une ligne
   * écrite avant le champ se relit `piece` — aucun réassort au poids n'a pu
   * partir au fournil avant elle (garde d'envoi de L2b-1).
   */
  readonly saleUnit: SaleUnit;
}

/** Les lignes d'un réassort relues d'un payload, ou `null` hors contrat. */
export function resupplyLinesOf(value: unknown): readonly ResupplyListLine[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const lines: ResupplyListLine[] = [];
  for (const entry of value) {
    const raw = recordOf(entry);
    const sku = textOf(raw?.["sku"]);
    const productName = raw?.["productName"];
    const quantity = piecesOf(raw?.["quantity"]);
    // Une unité inconnue rend le fait illisible : relue en pièces, elle ferait
    // coliser des grammes un par un.
    const saleUnit = saleUnitOf(raw?.["saleUnit"]);
    if (sku === null || typeof productName !== "string" || quantity === null || saleUnit === null) {
      return null;
    }
    lines.push({ sku, productName, quantity, saleUnit });
  }
  return lines;
}
