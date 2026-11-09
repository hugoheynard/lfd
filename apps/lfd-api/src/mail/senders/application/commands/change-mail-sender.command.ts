import type { MailSenderIdentity } from "@lfd/mail-blocks";

/**
 * Command : **changer l'identité d'envoi d'un espace pour une nature
 * d'e-mails** (plan `plan-editeur-par-blocs.md`, § 25, C3 ; nature : plan
 * `la-desinscription-et-l-accord.md`, lot U5), sur la révision lue — un
 * essai part vers l'auteur sous l'identité avant qu'elle soit enregistrée.
 */
export class ChangeMailSenderCommand {
  constructor(
    readonly space: string,
    /** `transactional` ou `marketing` — un paramètre de route, relu par le handler. */
    readonly nature: string,
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
