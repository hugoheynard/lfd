import { mandateReferenceOf, type InvoiceState } from "../entities/invoice.types.js";
import type { BillingCycle } from "./billing-cycle.js";
import { noticeAmount, noticeDay } from "./collection-notice-wording.js";
import { periodLabelOf } from "./invoicing-closures.js";

/** Ce que l'e-mail « Votre facture » imprime, mis en forme une fois. */
export interface InvoiceNoticeContent {
  readonly invoiceNumber: string;
  readonly sellerName: string;
  readonly buyerName: string;
  readonly issuedOn: string;
  readonly period: string | null;
  readonly total: string;
  readonly dueOn: string;
  readonly paymentMeans: string | null;
  readonly invoicesUrl: string;
}

/**
 * Le contenu de l'e-mail d'une facture émise (E6). `null` pour un avoir, ou
 * une facture sans échéance : Q3 ne prévient qu'à l'émission d'une facture,
 * et une facture 380 porte toujours son échéance (contrôle en base).
 *
 * Le moyen de paiement n'est écrit que s'il est figé sur la pièce (BG-16) :
 * jamais deviné du mandat du jour.
 *
 * La période est celle DU PAYEUR, rangée à l'émission (M4a) : « du 5 au 11
 * octobre 2026 » pour un hebdomadaire, plus le mois où elle s'achève.
 */
export function invoiceNoticeContent(
  state: InvoiceState,
  period: BillingCycle | null,
  invoicesUrl: string,
): InvoiceNoticeContent | null {
  if (state.correctedInvoiceId !== null || state.dueOn === null) {
    return null;
  }
  return {
    invoiceNumber: state.number,
    sellerName: state.seller.name,
    buyerName: state.buyer.name,
    issuedOn: noticeDay(state.issuedOn),
    period: period === null ? null : periodLabelOf(period),
    total: noticeAmount(state.vat.totalCents),
    dueOn: noticeDay(state.dueOn),
    paymentMeans: paymentMeansText(state),
    invoicesUrl,
  };
}

/** Le règlement, s'il est figé sur la pièce : le prélèvement et sa RUM, ou la carte (E5a). */
function paymentMeansText(state: InvoiceState): string | null {
  const reference = mandateReferenceOf(state.paymentMeans);
  if (reference !== null) {
    return `Prélèvement SEPA — mandat ${reference}`;
  }
  return state.prepayment === null
    ? null
    : `Payée par carte le ${noticeDay(state.prepayment.paidOn)} — rien à régler`;
}
