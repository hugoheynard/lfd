/** Un e-mail prêt à partir, sans type de modèle : le canal l'a déjà vérifié. */
export interface OutgoingMail {
  readonly template: string;
  readonly to: string;
  readonly data: unknown;
  readonly idempotencyKey: string;
}

/**
 * Port d'**envoi** : rendre et envoyer par le mailer d'aujourd'hui
 * (`platform/mailer` — plan S1 : le rendu ne change pas).
 *
 * @returns l'identifiant du fournisseur, `null` en mode à blanc.
 * @throws {MailRefusedError} refus que réessayer ne changera pas. Toute autre
 *   erreur est technique : un nouvel essai peut réussir.
 */
export abstract class MailDispatch {
  abstract dispatch(mail: OutgoingMail): Promise<string | null>;
}
