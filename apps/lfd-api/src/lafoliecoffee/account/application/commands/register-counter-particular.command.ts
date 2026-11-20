/**
 * Commande **staff** : inscrire explicitement, au comptoir, une fiche
 * particulier invitée — e-mail, prénom, téléphone.
 *
 * Retourne l'identifiant de la fiche créée.
 */
export class RegisterCounterParticularCommand {
  constructor(
    readonly staffUserId: string,
    readonly identity: {
      readonly firstName: string;
      readonly email: string;
      readonly phone: string;
    },
    readonly intentKey: string,
  ) {}
}
