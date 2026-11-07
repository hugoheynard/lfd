import type { MailLocale } from "@lfd/mail-blocks";

import type { MailCopySource } from "../../../copy/domain/mail-copy-locale.js";

/**
 * Command : « M'envoyer un essai » depuis l'éditeur (plan
 * `plan-editeur-par-blocs.md`, § 16, S4d) — l'e-mail rendu avec le document
 * que l'éditeur montre et les phrases de la source demandée (brouillons, ou
 * publiées depuis S5e, § 21), dans cette langue et ce cas, à la seule adresse
 * de l'appelant.
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
    /** Les phrases envoyées (S5e) : `draft` par défaut, comme avant. */
    readonly source: MailCopySource = "draft",
  ) {}
}
