import type { ResupplyReceipt } from "./resupply-receipt.js";
import type { ShelfDraw } from "./shelf-draws.reader.js";

/** Un article du point dans la journée : ce qui en a été reçu, et ce qui devrait en rester en vitrine. */
export interface EstimatedStockLine {
  readonly sku: string;
  readonly label: string;
  readonly receivedQuantity: number;
  readonly estimatedStock: number;
}

/**
 * **Le reste du jour au point** (plan du jour même, §1 ; lot R2 ; décompté
 * depuis le lot L2 du plan du jour J, §11.2) : la SOMME des reçus de la
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
 * L'ordre est celui de la première apparition, reçus d'abord dans l'ordre
 * donné, puis les articles seulement pris ; le libellé est celui de cette
 * première apparition.
 */
export function estimateStock(
  receipts: readonly ResupplyReceipt[],
  draws: readonly ShelfDraw[],
): readonly EstimatedStockLine[] {
  const totals = new Map<string, { label: string; received: number; drawn: number }>();
  for (const receipt of receipts) {
    if (receipt.status !== "received") {
      continue;
    }
    for (const line of receipt.lines) {
      const known = totals.get(line.sku);
      totals.set(line.sku, {
        label: known?.label ?? line.label,
        received: (known?.received ?? 0) + (line.receivedQuantity ?? 0),
        drawn: 0,
      });
    }
  }
  for (const draw of draws) {
    const known = totals.get(draw.sku) ?? { label: draw.label, received: 0, drawn: 0 };
    totals.set(draw.sku, { ...known, drawn: known.drawn + draw.quantity });
  }
  return [...totals].map(([sku, { label, received, drawn }]) => ({
    sku,
    label,
    receivedQuantity: received,
    estimatedStock: received - drawn,
  }));
}
