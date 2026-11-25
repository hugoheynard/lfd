import type { BackorderOriginLine } from "../ports/backorder-origin.reader.js";
import { BackorderLine } from "../value-objects/backorder-line.js";

/** Ce qui part d'un article, tel que la décision du départ le fige. */
export interface DepartedQuantity {
  readonly sku: string;
  readonly quantity: number;
}

/**
 * **Le reste d'une commande partie incomplète**, par article : quantité
 * commandée − quantité partie, dans l'unité de la ligne (des grammes au
 * poids). Un article tout parti sort ; une liste vide dit que tout est parti.
 *
 * Une commande porte une ligne par article ; si deux lignes partageaient un
 * article, leurs quantités s'additionnent, comme la décision les additionne.
 */
export function backorderRemainderOf(
  ordered: readonly BackorderOriginLine[],
  departed: readonly DepartedQuantity[],
): readonly BackorderLine[] {
  const departedBySku = new Map<string, number>();
  for (const line of departed) {
    departedBySku.set(line.sku, (departedBySku.get(line.sku) ?? 0) + line.quantity);
  }
  const orderedBySku = new Map<string, { quantity: number; saleUnit: string }>();
  for (const line of ordered) {
    const seen = orderedBySku.get(line.sku);
    orderedBySku.set(line.sku, {
      quantity: (seen?.quantity ?? 0) + line.quantity,
      saleUnit: seen?.saleUnit ?? line.saleUnit,
    });
  }
  const remainder: BackorderLine[] = [];
  for (const [sku, { quantity, saleUnit }] of orderedBySku) {
    const left = quantity - (departedBySku.get(sku) ?? 0);
    if (left > 0) {
      remainder.push(BackorderLine.of({ sku, quantity: left, saleUnit }));
    }
  }
  return remainder;
}
