/** Commande **staff** : (re)générer le QR d'une table d'un site. */
export class GenerateSiteTableQrCommand {
  constructor(
    readonly siteId: string,
    readonly tableNumber: number,
    /** La fiche du staff qui agit : l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
