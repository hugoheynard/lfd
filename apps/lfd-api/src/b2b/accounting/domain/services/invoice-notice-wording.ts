import { mandateReferenceOf, type InvoiceState } from "../entities/invoice.types.js";
import { noticeAmount, noticeDay } from "./collection-notice-wording.js";

const MONTH = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

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

/** `AAAA-MM` → « septembre 2026 ». Le mois est civil, lu et formaté en UTC. */
export function invoicePeriodLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00.000Z`));
}

/**
 * Le contenu de l'e-mail d'une facture émise (E6). `null` pour un avoir, ou
 * une facture sans échéance : Q3 ne prévient qu'à l'émission d'une facture,
 * et une facture 380 porte toujours son échéance (contrôle en base).
 *
 * Le moyen de paiement n'est écrit que s'il est figé sur la pièce (BG-16) :
 * jamais deviné du mandat du jour.
 */
export function invoiceNoticeContent(
  state: InvoiceState,
  period: string | null,
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
    period: period === null ? null : invoicePeriodLabel(period),
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
