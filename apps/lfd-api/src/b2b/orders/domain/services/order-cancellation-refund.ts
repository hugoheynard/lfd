/**
 * **Les phrases de l'argent à l'annulation d'une commande payée** (plan
 * `documentation/order/plan-annulation-de-commande.md`, lot C4, C4.4, C4.6,
 * C4.9) — pures. Lues par l'équipe sans le code sous les yeux. Centimes TTC,
 * l'unité de l'encaissement.
 */

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** « 23,40 € » */
export function refundEuros(cents: number): string {
  return EUROS.format(cents / 100);
}

/** Ce que la confirmation annonce : le montant qui partira, ou rien (C4.9). */
export function cancellationRefundSentenceOf(refundableCents: number): string {
  if (refundableCents <= 0) {
    return "Le paiement a déjà été remboursé en entier depuis Stripe : rien ne partira.";
  }
  return (
    `Le client sera remboursé de ${refundEuros(refundableCents)} sur sa carte (livraison comprise). ` +
    "Le remboursement part automatiquement chez Stripe après l'annulation."
  );
}

/** Refus `refund_in_flight` (C4.4). */
export function refundInFlightRefusalOf(amountCents: number): string {
  return (
    `Un remboursement de ${refundEuros(amountCents)} est en cours chez Stripe sur cette commande. ` +
    "Attendez son issue, puis annulez."
  );
}

/** Refus `paid_just_now` (C4.6, C4.12) : la carte a abouti pendant le clic. */
export const PAID_JUST_NOW_REFUSAL =
  "Le paiement vient d'aboutir : rechargez la commande, l'annulation proposera le remboursement.";
