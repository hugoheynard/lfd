import type { ResupplyReceipt } from "./resupply-receipt.js";
import type { SaleUnit } from "./resupply-sale-unit.js";
import type { ShelfDraw } from "./shelf-draws.reader.js";

/**
 * Un article du point dans la journée, dans UNE unité : ce qui en a été reçu,
 * et ce qui devrait en rester en vitrine — des pièces, ou des grammes au
 * poids (L2b-1).
 */
export interface EstimatedStockLine {
  readonly sku: string;
  readonly label: string;
  readonly saleUnit: SaleUnit;
  readonly receivedQuantity: number;
  readonly estimatedStock: number;
}

/**
 * **Le reste du jour au point** (plan du jour même, §1 ; la réception en un geste, R2 ; décompté
 * depuis le stock du jour décompté (L2 du plan du jour J, §11.2) : la SOMME des reçus de la
 * journée, tous reçus confondus — réassorts réceptionnés et réassort sans
 * commande —, moins ce que les commandes sur stock (`supply = shelf`) en ont
 * pris. Calculé, jamais saisi.
 *
 * C'est LE calcul du reste : la Supervision, la réception et le refus d'une
 * baisse de reçu le lisent tous par `DayShelfStock`, qui lui passe les
 * prélèvements. La fonction reste pure : elle ne sait pas d'où ils viennent.
 *
 * - Un reçu encore attendu (pas réceptionné) ne compte pas : le stock ne monte
 *   qu'à la réception, jamais à l'envoi (Hugo, 2026-10-21).
 * - Les commandes fabriquées pour ce jour (`planned`) ne se soustraient pas :
 *   le fournil les a cuites pour elles, elles ne sont pas dans la vitrine.
 * - Un article pris sans avoir été reçu apparaît quand même, reçu 0 et reste
 *   NÉGATIF : une vente au-delà du stock est un fait à montrer, pas à taire.
 *   Aucun chemin ne le produit aujourd'hui (la baisse d'un reçu est refusée
 *   sous le déjà-pris ; la passation garde le reste au lot L4).
 *
 * - Le compte se fait par (article, unité), jamais pièces et grammes ensemble
 *   (L2b-1) : un article reçu au poids puis passé à la pièce au catalogue
 *   donne deux lignes, chacune dans son unité.
 *
 * L'ordre est celui de la première apparition, reçus d'abord dans l'ordre
 * donné, puis les articles seulement pris ; le libellé est celui de cette
 * première apparition.
 */
export function estimateStock(
  receipts: readonly ResupplyReceipt[],
  draws: readonly ShelfDraw[],
): readonly EstimatedStockLine[] {
  const totals = new Map<string, Tally>();
  const tallyOf = (sku: string, saleUnit: SaleUnit, label: string): Tally => {
    const key = stockKeyOf(sku, saleUnit);
    const known = totals.get(key) ?? { sku, saleUnit, label, received: 0, drawn: 0 };
    totals.set(key, known);
    return known;
  };
  for (const receipt of receipts) {
    if (receipt.status !== "received") {
      continue;
    }
    for (const line of receipt.lines) {
      tallyOf(line.sku, line.saleUnit, line.label).received += line.receivedQuantity ?? 0;
    }
  }
  for (const draw of draws) {
    tallyOf(draw.sku, draw.saleUnit, draw.label).drawn += draw.quantity;
  }
  return [...totals.values()].map(({ sku, saleUnit, label, received, drawn }) => ({
    sku,
    label,
    saleUnit,
    receivedQuantity: received,
    estimatedStock: received - drawn,
  }));
}

interface Tally {
  readonly sku: string;
  readonly saleUnit: SaleUnit;
  readonly label: string;
  received: number;
  drawn: number;
}

/** La clé d'un compte : l'article ET son unité — deux unités ne se somment jamais. */
export function stockKeyOf(sku: string, saleUnit: SaleUnit): string {
  return `${saleUnit}:${sku}`;
}
