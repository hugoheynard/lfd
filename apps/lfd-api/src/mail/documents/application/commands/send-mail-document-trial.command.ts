import type { MailLocale } from "@lfd/mail-blocks";

/**
 * Command : « M'envoyer un essai » depuis l'éditeur (plan
 * `plan-editeur-par-blocs.md`, § 16, S4d) — l'e-mail rendu avec son document
 * BROUILLON et ses phrases en brouillon, dans cette langue et ce cas, à la
 * seule adresse de l'appelant.
 */
export class SendMailDocumentTrialCommand {
  constructor(
    readonly template: string,
    readonly locale: MailLocale,
    readonly caseId: string,
    readonly staffUserId: string,
    /**
     * La clé d'intention fabriquée par l'écran (en-tête `Idempotency-Key`,
     * plan `plan-service-e-mails.md`, revue, cas 4) : un second clic de même
     * clé ne réexécute rien ; un vrai renvoi en porte une neuve.
     */
    readonly intentKey: string,
  ) {}
}
