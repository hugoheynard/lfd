import type { ResupplyReceipt } from "./resupply-receipt.js";
import type { SaleUnit } from "./resupply-sale-unit.js";
import type { ShelfDraw } from "./shelf-draws.reader.js";
import { StockTallies } from "./stock-tally.js";

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
 * **Le reste du jour au point** : la SOMME des reçus de la journée, tous
 * reçus confondus — réassorts réceptionnés et réassort sans commande —, moins
 * ce que les commandes sur stock (`supply = shelf`) en ont pris. Calculé,
 * jamais saisi. Sources : la réception en un geste (R2,
 * `documentation/reassort-boutiques/reception-et-stock.md`) et le stock du
 * jour décompté (L2, `documentation/limites-de-commande/jour-meme-sur-stock.md`).
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
 *   Aucun chemin ne le produit aujourd'hui (vérifié le 2026-11-02 : la
 *   baisse d'un reçu est refusée sous le déjà-pris par
 *   `ReceivedStockLowering`, et la passation refuse au-delà du reste par
 *   `ShelfCircuitService`, `ShelfStockShortError`, lot L4).
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
  const tallies = new StockTallies<Tally>((identity) => ({ ...identity, received: 0, drawn: 0 }));
  for (const receipt of receipts) {
    if (receipt.status !== "received") {
      continue;
    }
    for (const line of receipt.lines) {
      tallies.of(line).received += line.receivedQuantity ?? 0;
    }
  }
  for (const draw of draws) {
    tallies.of(draw).drawn += draw.quantity;
  }
  return tallies.values().map(({ sku, saleUnit, label, received, drawn }) => ({
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
