import type { CustomerCancellationRefusal } from "@lfd/contracts";

import type { CancellationBlock } from "./order-cancellation.js";

/**
 * **Les refus de la règle staff, dits à un client** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.7).
 *
 * Le noyau lève les erreurs staff ; le client en reçoit la traduction. Aucune
 * phrase ne cite le motif staff, une autre commande par son numéro (le refus
 * C3b le fait côté staff : côté client, il se tait), ni le fournil comme
 * acteur.
 */
export const CUSTOMER_REFUSAL_PHRASES: Readonly<Record<CustomerCancellationRefusal, string>> = {
  already_cancelled: "Cette commande est déjà annulée.",
  in_preparation:
    "Votre commande est déjà en préparation : elle ne peut plus être annulée. Contactez-nous si besoin.",
  ready: "Votre commande est prête : elle ne peut plus être annulée.",
  fulfilled: "Votre commande est déjà retirée : elle ne peut plus être annulée.",
  closed: "L'annulation en ligne n'est pas proposée. Contactez-nous pour annuler cette commande.",
  too_late: "Il est trop tard pour annuler en ligne. Contactez-nous.",
  payment_in_progress:
    "Un paiement est en cours sur cette commande. Réessayez dans quelques minutes.",
  paid_just_now:
    "Votre paiement vient d'aboutir. Rechargez la page pour annuler avec remboursement.",
  not_recorded:
    "Nous n'avons pas pu annuler votre commande. Rien n'a été prélevé de plus ; réessayez dans un instant.",
  invoiced: "Cette commande est déjà facturée : elle ne s'annule plus en ligne. Contactez-nous.",
  voucher_reused:
    "Le bon utilisé sur cette commande a déjà resservi : contactez-nous pour l'annuler.",
  account_required: "Connectez-vous pour gérer cette commande.",
  account_disabled: "Cette commande ne peut pas être gérée en ligne. Contactez la boutique.",
  not_allowed:
    "Cette commande ne peut pas être annulée depuis votre compte. Contactez la boutique.",
};

const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Paris",
});
const SHORT_TIME = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** « … c'était possible jusqu'au JJ/MM à HH:mm. » — sans échéance, la phrase courte. */
export function tooLatePhraseOf(until: Date | null): string {
  if (until === null) {
    return CUSTOMER_REFUSAL_PHRASES.too_late;
  }
  return (
    "Il est trop tard pour annuler en ligne : c'était possible jusqu'au " +
    `${SHORT_DAY.format(until)} à ${SHORT_TIME.format(until)}. Contactez-nous.`
  );
}

/**
 * Le refus client d'un blocage de la règle — `null` pour un brouillon : un
 * client ne voit pas un brouillon, l'appelant répond 404.
 *
 * `refund_in_flight` se dit comme un paiement en cours : un remboursement
 * attend son issue, et c'est le même geste de sortie (réessayer plus tard).
 */
export function customerRefusalOf(block: CancellationBlock): CustomerCancellationRefusal | null {
  switch (block.kind) {
    case "draft":
      return null;
    case "already_cancelled":
    case "ready":
    case "fulfilled":
    case "paid_just_now":
      return block.kind;
    case "inscribed":
      return "in_preparation";
    case "refund_in_flight":
      return "payment_in_progress";
    case "voucher_remainder_engaged":
    case "voucher_remainder_cancelled":
      return "voucher_reused";
    case "invoiced":
    case "collecting":
    case "collected":
    case "written_off":
    case "returned_before":
    case "settled_otherwise":
    case "engagement_unknown":
      return "invoiced";
  }
}
