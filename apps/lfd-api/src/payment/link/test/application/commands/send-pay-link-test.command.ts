/**
 * **Envoyer un lien de paiement d'essai** à un membre du staff. `staffUserId`
 * est l'auteur, résolu par la porte staff ; `recipientStaffUserId` la fiche
 * choisie à l'écran — jamais une adresse.
 */
export class SendPayLinkTestCommand {
  constructor(
    readonly staffUserId: string,
    readonly recipientStaffUserId: string,
    /** La clé d'intention de l'écran : un second envoi rend le même essai. */
    readonly intentKey: string,
  ) {}
}
