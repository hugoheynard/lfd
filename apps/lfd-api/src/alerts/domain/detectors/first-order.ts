import type { AlertFinding, FirstOrderParams } from "@lfd/contracts";

import type { AlertEvaluationContext } from "./context.js";

/**
 * `product.first_order` — les produits que ce compte n'avait **jamais** pris.
 *
 * On lit `everOrdered`, pas l'historique récent : un produit commandé il y a
 * trois ans sort de la fenêtre de la dérive, mais il n'est pas « jamais pris ».
 * Confondre les deux ferait crier « nouveau produit » sur un habitué de longue
 * date, et c'est le genre d'erreur qui décrédibilise toute la liste.
 */
export function detectFirstOrder(
  context: AlertEvaluationContext,
  params: FirstOrderParams,
): AlertFinding[] {
  // Sur la toute première commande, *tout* est nouveau : la règle se tait plutôt
  // que de produire autant d'alertes que de lignes, donc zéro signal.
  if (context.previousOrderCount < params.minPreviousOrders) {
    return [];
  }
  return context.lines
    .filter((line) => !context.everOrdered.has(line.sku))
    .map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      baseline: null,
      deviationPercent: null,
      message: `${line.productName} — jamais commandé jusqu'ici (${line.quantity})`,
    }));
}
