import type { MailLocale } from "@lfd/mail-blocks";

/**
 * Command : **s'inscrire à la lettre d'information** par le champ du pied de
 * page de la boutique (plan `documentation/mail/plan-desinscription-des-e-mails.md`,
 * C5). Public, sans compte : toujours la double confirmation. Ne rend rien, et
 * ne dit pas ce qu'elle a fait — la réponse est la même pour toute adresse.
 */
export class SubscribeNewsletterCommand {
  constructor(
    readonly address: string,
    readonly textVersion: string,
    readonly locale: MailLocale,
    /** Le champ piège : rempli par un robot, vide pour une personne. */
    readonly honeypot: string,
  ) {}
}
