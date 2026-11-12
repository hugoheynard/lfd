/** « Envoyer un test » : un corps vide et signé, tout de suite. Rend l'id de l'envoi. */
export class SendVitrineTestCommand {
  constructor(
    readonly subscriberId: string,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
