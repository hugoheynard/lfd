/**
 * Query : l'identité d'envoi d'un espace pour une nature d'e-mails (lot U5),
 * son repli, et les domaines vérifiés.
 */
export class GetMailSenderQuery {
  constructor(
    readonly space: string,
    readonly nature: string,
  ) {}
}
