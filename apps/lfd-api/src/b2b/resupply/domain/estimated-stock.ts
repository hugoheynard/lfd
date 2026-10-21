import type { ResupplyReceiptLine } from "./resupply-receipt-line.js";

/** Une ligne reçue, avec ce qui devrait en rester en vitrine. */
export interface EstimatedStockLine {
  readonly sku: string;
  readonly label: string;
  readonly receivedQuantity: number;
  readonly estimatedStock: number;
}

/**
 * **Le stock estimé** (plan du jour même, §1) : reçu − ce que les commandes
 * « jour même sur stock » en ont pris. Calculé, jamais saisi.
 *
 * Ce circuit n'existe pas encore (lot J2) : aucune commande ne puise dans la
 * vitrine, donc le stock estimé EST le reçu. Les commandes déjà passées pour
 * ce jour ne se soustraient pas — elles ont été passées la veille, avant
 * l'heure limite, et le fournil les a fabriquées pour elles (Hugo,
 * 2026-10-21). Aucun port de décompte n'est posé d'avance : J2 ajoutera le
 * sien, et ce paramètre, quand il y aura quelque chose à décompter.
 */
export function estimateStock(
  lines: readonly ResupplyReceiptLine[],
): readonly EstimatedStockLine[] {
  return lines.map((line) => ({
    sku: line.sku,
    label: line.label,
    receivedQuantity: line.quantity,
    estimatedStock: line.quantity,
  }));
}
