import type { OrderRevisionQuoteView } from "@lfd/contracts";

import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";

/**
 * **Le devis dit au lecteur** : la commande recomposée, l'écart avec la
 * révision courante, et quelles lignes gardent leur prix d'origine (R3).
 * Partagé par le devis de la modification et celui d'une demande (M4).
 */
export function quoteViewOf(
  current: RevisableOrder,
  revision: OrderRevisionToSave,
): OrderRevisionQuoteView {
  const { state } = revision;
  const previous = new Set(current.lines.map((line) => line.sku));
  return {
    revision: current.revision,
    lines: state.lines.map((line) => ({
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      unitPriceMillicents: line.unitPriceMillicents,
      vatRate: line.vatRate,
      lineTotalCents: line.lineTotalCents,
      priceFrozen: previous.has(line.sku),
    })),
    subtotalCents: state.subtotalCents,
    discountCents: state.discountCents,
    deliveryFeeCents: state.deliveryFeeCents,
    lateFeeCents: state.lateFeeCents,
    voucherDiscountCents: state.voucherDiscountCents,
    vatCents: state.vatCents,
    totalCents: state.totalCents,
    previousTotalCents: current.totalCents,
    differenceCents: state.totalCents - current.totalCents,
    changes: revision.changes,
  };
}
