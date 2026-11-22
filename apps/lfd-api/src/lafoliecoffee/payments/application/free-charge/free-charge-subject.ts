import type { CardSubject } from "../../../../payment/channels/subjects/index.js";

/**
 * **Le type de sujet d'une demande de paiement libre** pour le bloc `payment` (plan du
 * lien vers un sujet, §5.2) — 🔴 une valeur persistée
 * (`payment.card_payment.subject_type`, `payment.pay_link.subject_type`), qui
 * ne se renomme pas. Le compte qui l'encaisse n'est pas ici : seul
 * `appBootstrap/` connaît à la fois ce type et un compte.
 */
export const FREE_CHARGE_SUBJECT_TYPE = "free_charge";

/**
 * L'application qui ouvre les liens des demandes de paiement libres — une origine du
 * registre (`platform/config/pay-link-origins.ts`), valeur persistée.
 */
export const FREE_CHARGE_LINK_ORIGIN = "lafoliecoffee";

/** La demande de paiement libre, telle que le canal la passe : un sujet opaque. */
export function freeChargeSubject(paymentLinkId: string): CardSubject {
  return { type: FREE_CHARGE_SUBJECT_TYPE, id: paymentLinkId };
}
