/**
 * Command : **se désinscrire par le lien d'un e-mail** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, règle 5 et
 * contradiction). Ne rend rien, et ne dit pas si le jeton valait quelque
 * chose : la réponse est la même pour tout jeton.
 *
 * ⚠️ Le jeton n'est jamais journalisé : il désinscrit qui le présente.
 */
export class UnsubscribeByTokenCommand {
  constructor(
    readonly token: string,
    /** Le POST « One-Click » d'une messagerie (RFC 8058), sinon le bouton de la page. */
    readonly oneClick: boolean,
    /** « Ne plus rien recevoir du groupe » (règle 20). */
    readonly wholeGroup: boolean,
  ) {}
}
