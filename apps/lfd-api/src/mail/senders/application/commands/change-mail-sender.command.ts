import type { MailSenderIdentity } from "@lfd/mail-blocks";

/**
 * Command : **changer l'identité d'envoi d'un espace** (plan
 * `plan-editeur-par-blocs.md`, § 25, C3), sur la révision lue — un essai
 * part vers l'auteur sous l'identité avant qu'elle soit enregistrée.
 */
export class ChangeMailSenderCommand {
  constructor(
    readonly space: string,
    readonly identity: MailSenderIdentity,
    readonly expectedRevision: number,
    readonly staffUserId: string,
    /**
     * La clé d'intention fabriquée par l'écran (en-tête `Idempotency-Key`,
     * plan `plan-service-e-mails.md`, revue, cas 4) : un second clic de même
     * clé ne renvoie pas l'essai ; un vrai nouvel essai en porte une neuve.
     */
    readonly intentKey: string,
  ) {}
}
