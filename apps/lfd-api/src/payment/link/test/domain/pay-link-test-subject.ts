import type { CardSubject } from "../../../channels/subjects/index.js";

/**
 * **Le type de sujet d'un essai** — le seul sujet que le bloc `payment`
 * possède lui-même. 🔴 Une valeur persistée (`payment.pay_link.subject_type`,
 * `payment.card_payment.subject_type`), qui ne se renomme pas. Le compte qui
 * l'encaisse n'est pas ici : seul `appBootstrap/` connaît un type et un compte.
 */
export const PAY_LINK_TEST_SUBJECT_TYPE = "payment_test";

/**
 * L'origine des liens d'essai — une entrée du registre
 * (`platform/config/pay-link-origins.ts`), valeur persistée sur le lien.
 */
export const PAY_LINK_TEST_ORIGIN = "lafoliecoffee_test";

/** Le payeur figé sur le lien, recopié dans l'avis à la comptabilité. Aucune adresse. */
export const PAY_LINK_TEST_PAYER_LABEL = "Essai du paiement par lien";

/** Ce que l'essai règle, tel que l'avis et les cloches le nomment. */
export const PAY_LINK_TEST_DESCRIPTION = "ESSAI — lien de paiement de 1 €";

/** L'écran du back-office qui liste les essais. */
export const PAY_LINK_TEST_SCREEN = "/comptabilite/lien-de-paiement-d-essai";

/** L'essai, tel que le canal le passe : un sujet. */
export function payLinkTestSubject(testId: string): CardSubject {
  return { type: PAY_LINK_TEST_SUBJECT_TYPE, id: testId };
}
