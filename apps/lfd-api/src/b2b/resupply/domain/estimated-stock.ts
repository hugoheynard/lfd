import type { ResupplyReceipt } from "./resupply-receipt.js";

/** Un article reçu au point dans la journée, avec ce qui devrait en rester en vitrine. */
export interface EstimatedStockLine {
  readonly sku: string;
  readonly label: string;
  readonly receivedQuantity: number;
  readonly estimatedStock: number;
}

/**
 * **Le stock estimé du jour au point** (plan du jour même, §1 ; lot R2) : la
 * SOMME des reçus de la journée, tous reçus confondus — réassorts
 * réceptionnés et réassort sans commande —, moins ce que les commandes « jour
 * même sur stock » en ont pris. Calculé, jamais saisi.
 *
 * Un reçu encore attendu (pas réceptionné) ne compte pas : le stock ne monte
 * qu'à la réception, jamais à l'envoi (Hugo, 2026-10-21).
 *
 * Le circuit « jour même sur stock » n'existe pas encore (lot J2) : aucune
 * commande ne puise dans la vitrine, donc le stock estimé EST le reçu. Les
 * commandes déjà passées pour ce jour ne se soustraient pas — elles ont été
 * passées la veille, avant l'heure limite, et le fournil les a fabriquées
 * pour elles. Aucun port de décompte n'est posé d'avance : J2 ajoutera le
 * sien quand il y aura quelque chose à décompter.
 *
 * L'ordre est celui de la première apparition, reçus pris dans l'ordre donné ;
 * le libellé est celui de cette première apparition.
 */
export function estimateStock(receipts: readonly ResupplyReceipt[]): readonly EstimatedStockLine[] {
  const totals = new Map<string, { label: string; quantity: number }>();
  for (const receipt of receipts) {
    if (receipt.status !== "received") {
      continue;
    }
    for (const line of receipt.lines) {
      const received = line.receivedQuantity ?? 0;
      const known = totals.get(line.sku);
      totals.set(line.sku, {
        label: known?.label ?? line.label,
        quantity: (known?.quantity ?? 0) + received,
      });
    }
  }
  return [...totals].map(([sku, { label, quantity }]) => ({
    sku,
    label,
    receivedQuantity: quantity,
    estimatedStock: quantity,
  }));
}
