/**
 * Query : **l'adresse en clair d'une ligne du registre**, servie au seul
 * membre du staff qui l'a consultée dans les 5 minutes (lot C4).
 */
export class GetMarketingPreferenceRecipientQuery {
  constructor(
    readonly preferenceId: string,
    readonly staffUserId: string,
  ) {}
}
