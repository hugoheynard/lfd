/**
 * Command : **révéler l'adresse d'un envoi** (`le-suivi-des-e-mails.md`,
 * décision 7). Range la révélation et publie `mail.recipient_revealed` ; ne
 * rend rien — l'adresse se lit ensuite par `GetMailRecipientQuery`.
 */
export class RevealMailRecipientCommand {
  constructor(
    readonly sendId: string,
    readonly staffUserId: string,
  ) {}
}
