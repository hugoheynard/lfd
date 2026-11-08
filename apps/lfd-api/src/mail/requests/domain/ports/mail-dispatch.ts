import type { MailSubject } from "../../../channels/requests/mail-subject.js";

/** Un e-mail prêt à partir, sans type de modèle : le canal l'a déjà vérifié. */
export interface OutgoingMail {
  readonly template: string;
  readonly to: string;
  readonly data: unknown;
  readonly idempotencyKey: string;
  /** L'adresse de réponse de ce message, s'il en a une (`MailDemand.replyTo`). */
  readonly replyTo?: string;
  /**
   * Ce pour quoi il part (`plan-sujet-des-e-mails.md`, règle 2) : rangé au
   * suivi, porté par le fait différé ; le transport ne le lit pas.
   */
  readonly subjects?: readonly MailSubject[];
}

/** Ce qu'un envoi accepté rend. */
export interface MailDispatchReceipt {
  /** L'identifiant du fournisseur, `null` en mode à blanc. */
  readonly providerId: string | null;
  /**
   * La version publiée du document qui a composé l'e-mail (plan
   * `plan-editeur-par-blocs.md`, § 5, S4c) ; `null` : le document de départ.
   */
  readonly documentVersion: number | null;
}

/**
 * Port d'**envoi** : rendre et envoyer par le mailer d'aujourd'hui
 * (`mail/templates/` depuis S3b — plan S1 : le rendu ne change pas).
 *
 * @returns l'identifiant du fournisseur et la version du document qui a
 *   composé l'e-mail.
 * @throws {MailInFlightError} un envoi de même clé est encore en cours chez le
 *   fournisseur : ni échec, ni refus.
 * @throws {MailRefusedError} refus que réessayer ne changera pas. Toute autre
 *   erreur est technique : un nouvel essai peut réussir.
 */
export abstract class MailDispatch {
  abstract dispatch(mail: OutgoingMail): Promise<MailDispatchReceipt>;
}
