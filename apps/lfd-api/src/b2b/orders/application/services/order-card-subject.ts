import type { CardSubject } from "../../../../card-payment/channels/subjects/index.js";

/**
 * **Le type de sujet d'une commande** pour le bloc `card-payment` (plan M2,
 * §3.3) — 🔴 une valeur persistée (`card_payment.payment.subject_type`),
 * qui ne se renomme pas. Le compte qui l'encaisse n'est pas ici : seul
 * `appBootstrap/` connaît à la fois ce type et un compte (§3.2).
 */
export const ORDER_CARD_SUBJECT_TYPE = "order";

/**
 * La métadonnée posée chez le prestataire pour une commande sans société —
 * celle d'avant le bloc, inchangée (§4.2) : de la traçabilité, jamais un mur.
 */
export const PERSONAL_CARD_TAG = "personal";

/** La commande, telle que le canal la passe : un sujet opaque. */
export function orderCardSubject(orderId: string): CardSubject {
  return { type: ORDER_CARD_SUBJECT_TYPE, id: orderId };
}

/** La métadonnée d'une intention : la société, sinon `personal`. */
export function orderCardTag(companyId: string | null): string {
  return companyId ?? PERSONAL_CARD_TAG;
}
