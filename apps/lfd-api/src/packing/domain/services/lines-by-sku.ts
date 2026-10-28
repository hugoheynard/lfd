import type { SaleUnit } from "@lfd/money";

import { MixedSaleUnitLineError } from "../errors/packing-sale-unit-errors.js";

/** Une ligne à coliser : l'article, son nom, la quantité due. */
export interface DueLine {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"`. */
  readonly quantity: number;
  /** P6 de `pricing/plan-vente-au-poids.md` ; un réassort est toujours à la pièce. */
  readonly saleUnit: SaleUnit;
}

/** Ce que le regroupement lit : une ligne de commande (avec unité) ou de réassort (sans). */
export interface SummableLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit?: SaleUnit;
}

/**
 * **Une ligne par article** : les lignes d'un même SKU d'une commande,
 * additionnées. L'ombre range une ligne par (commande × article) ; deux lignes
 * du même croissant sur un bon sont un seul geste au bac.
 *
 * Le nom retenu est celui de la première ligne, comme le compte à produire du
 * fournil (`countOf`) : c'est le SKU qui fait foi. Une ligne de commande
 * porte son unité ; une ligne de réassort n'en porte pas (toujours des pièces).
 */
export function linesBySku<Line extends SummableLine>(lines: readonly Line[]): readonly Line[] {
  const bySku = new Map<string, Line>();
  for (const line of lines) {
    const known = bySku.get(line.sku);
    if (known === undefined) {
      bySku.set(line.sku, line);
      continue;
    }
    if (known.saleUnit !== line.saleUnit) {
      // Des pièces et des grammes du même article ne font pas une ligne (P6).
      throw new MixedSaleUnitLineError(line.sku);
    }
    bySku.set(line.sku, { ...known, quantity: known.quantity + line.quantity });
  }
  return [...bySku.values()];
}
