/** Commande **staff** : retirer le QR d'une table d'un site. */
export class RemoveSiteTableQrCommand {
  constructor(
    readonly siteId: string,
    readonly tableNumber: number,
  ) {}
}
