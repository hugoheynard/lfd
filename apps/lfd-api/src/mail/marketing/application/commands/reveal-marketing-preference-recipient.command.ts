/**
 * Command : **afficher l'adresse d'une ligne du registre** (lot C4). Même
 * geste que la révélation du suivi des envois : tracé, plafonné, 5 minutes
 * pour son seul auteur. Ne rend rien — l'adresse se lit ensuite par
 * `GetMarketingPreferenceRecipientQuery`.
 */
export class RevealMarketingPreferenceRecipientCommand {
  constructor(
    readonly preferenceId: string,
    readonly staffUserId: string,
  ) {}
}
