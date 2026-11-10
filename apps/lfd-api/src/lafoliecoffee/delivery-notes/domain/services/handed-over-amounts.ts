import type { HandedOverNoteAmounts } from "../../../orders/domain/entities/order-billing.js";
import type { DeliveryNote } from "../entities/delivery-note.js";
import type { DeliveryNoteTerms } from "../value-objects/delivery-note-terms.js";
import { vatSharesOf } from "./delivery-note-sheet.js";

function amountsOf(terms: DeliveryNoteTerms | null): HandedOverNoteAmounts["amounts"] {
  if (terms === null) {
    return null;
  }
  return {
    subtotalCents: terms.subtotalCents,
    discountCents: terms.discountCents,
    voucherDiscountCents: terms.voucherDiscountCents,
    deliveryFeeCents: terms.deliveryFeeCents,
    lateFeeCents: terms.lateFeeCents,
    vatCents: terms.vatCents,
    vatShares: vatSharesOf(terms.vatShares),
    totalCents: terms.totalCents,
  };
}

/**
 * Les BL **remis** d'une commande, vus du solde (E6c1) : leur jour et leur
 * en-tête — ce que `OrderBilling.closeBilling` additionne.
 */
export function handedOverAmountsOf(
  orderId: string,
  notes: readonly DeliveryNote[],
): readonly HandedOverNoteAmounts[] {
  return (
    notes
      .filter((note) => note.orderId === orderId && note.status === "handed_over")
      .map((note) => note.toState())
      // Un BL remis sans jour n'est pas écarté : le solde le refuse, et le
      // réconciliateur le nomme (plan E6, relecture de `vitruve`).
      .map((state) => ({
        number: state.number,
        rank: state.rank,
        receivedOn: state.receivedOn,
        amounts: amountsOf(state.terms),
      }))
  );
}
