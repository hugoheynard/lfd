/** Query : l'identité d'envoi d'un espace, l'identité par défaut, et les domaines vérifiés. */
export class GetMailSenderQuery {
  constructor(readonly space: string) {}
}
