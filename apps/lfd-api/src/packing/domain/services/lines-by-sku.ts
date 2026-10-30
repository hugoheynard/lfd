import type { SaleUnit } from "@lfd/money";

import { MixedSaleUnitLineError } from "../errors/packing-sale-unit-errors.js";

/** Une ligne à coliser : l'article, son nom, la quantité due. */
export interface DueLine {
  readonly sku: string;
  readonly productName: string;
  /** Des pièces, ou des grammes si `saleUnit = "weight"`. */
  readonly quantity: number;
  /** P6 de `pricing/vente-au-poids.md` ; un réassort est toujours à la pièce. */
  readonly saleUnit: SaleUnit;
}

/** Ce que le regroupement lit : une ligne de commande (avec unité) ou de réassort (sans). */
export interface SummableLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit?: SaleUnit;
  /** Le marqueur « sur mesure » d'une ligne de commande (M4) ; un réassort n'en porte pas. */
  readonly madeToOrder?: boolean | null;
}

/**
 * **Une ligne par article** : les lignes d'un même SKU d'une commande,
 * additionnées. L'ombre range une ligne par (commande × article) ; deux lignes
 * du même croissant sur un bon sont un seul geste au bac.
 *
 * Le nom retenu est celui de la première ligne, comme le compte à produire du
 * fournil (`countOf`) : c'est le SKU qui fait foi. Une ligne de commande
 * porte son unité ; une ligne de réassort n'en porte pas (toujours des pièces).
 *
 * Le marqueur « sur mesure » (plan M4) : une seule ligne sur mesure fait la
 * ligne sur mesure — c'est ce qui doit se voir au bac ; un « non » connu
 * l'emporte sur une ignorance ; aucun marqueur connu, aucun marqueur.
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
    const madeToOrder = mergedMadeToOrder(known.madeToOrder, line.madeToOrder);
    bySku.set(line.sku, {
      ...known,
      quantity: known.quantity + line.quantity,
      ...(madeToOrder === undefined ? {} : { madeToOrder }),
    });
  }
  return [...bySku.values()];
}

function mergedMadeToOrder(
  left: boolean | null | undefined,
  right: boolean | null | undefined,
): boolean | null | undefined {
  if (left === true || right === true) {
    return true;
  }
  if (left === false || right === false) {
    return false;
  }
  return left === null || right === null ? null : undefined;
}
