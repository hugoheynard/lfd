import { z } from "zod";

/**
 * **Le lien de paiement d'essai** (doc
 * `documentation/payment/les-liens-de-paiement.md`, « Le lien d'essai ») : un
 * vrai lien de 1 €, envoyé à un membre du staff, payé avec une vraie carte et
 * remboursé tout seul dès l'encaissement.
 */

/** Au plus cinq essais par jour de Paris : chacun coûte une commission. */
export const PAY_LINK_TEST_DAILY_LIMIT = 5;

/**
 * L'état servi d'un essai. `expired` n'est pas rangé : il se calcule — un
 * essai envoyé depuis plus de 24 heures, jamais payé, dont la page dit
 * « plus valable ».
 */
export type PayLinkTestViewState = "sent" | "paid" | "refunded" | "refund_failed" | "expired";

/** Un essai, tel que l'écran le liste. Aucune adresse e-mail. */
export interface PayLinkTestView {
  readonly id: string;
  readonly state: PayLinkTestViewState;
  /** ISO. */
  readonly createdAt: string;
  /** Le nom de l'auteur ; `null` quand sa fiche ne se résout plus. */
  readonly createdByLabel: string | null;
  /** ISO, `null` tant que l'euro n'est pas encaissé. */
  readonly paidAt: string | null;
  /** ISO, `null` tant que l'euro n'est pas rendu. */
  readonly refundedAt: string | null;
  /** L'adresse `/payer/…` à copier, tant que l'essai se paie ; sinon `null`. */
  readonly url: string | null;
}

/**
 * Envoyer un essai : le destinataire est une fiche du staff, jamais une
 * adresse — le serveur la résout, et refuse un membre inconnu ou suspendu.
 */
export const createPayLinkTestPayloadSchema = z.object({
  staffUserId: z.string().trim().min(1),
});
export type CreatePayLinkTestPayload = z.infer<typeof createPayLinkTestPayloadSchema>;

/** Ce que rend l'envoi : de quoi afficher le lien à copier sans relire la liste. */
export interface CreatedPayLinkTest {
  readonly id: string;
  readonly url: string;
}

/** Un destinataire possible d'un essai : un membre actif joignable, sans son adresse. */
export interface PayLinkTestRecipient {
  readonly staffUserId: string;
  /** « Prénom Nom ». */
  readonly label: string;
}
