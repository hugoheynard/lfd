/**
 * Command : **confirmer un accord par le lien de l'e-mail** (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, règle 18, C1).
 * Ne rend rien, et ne dit pas si le jeton valait quelque chose : la page est
 * la même pour tout jeton.
 *
 * ⚠️ Le jeton n'est jamais journalisé : il confirme qui le présente.
 */
export class ConfirmConsentByTokenCommand {
  constructor(readonly token: string) {}
}
