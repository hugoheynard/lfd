/**
 * Query : **l'adresse d'un envoi, en clair**, et la raison d'un échec (plan
 * `le-suivi-des-e-mails.md`, décisions 4 et 7) — servies seulement si CETTE
 * personne a révélé CET envoi depuis moins de 5 minutes. Ne trace rien : la
 * trace est celle de la révélation.
 */
export class GetMailRecipientQuery {
  constructor(
    readonly sendId: string,
    readonly staffUserId: string,
  ) {}
}
