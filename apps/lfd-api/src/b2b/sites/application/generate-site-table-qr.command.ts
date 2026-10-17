/** Commande **staff** : (re)générer le QR d'une table d'un site. */
export class GenerateSiteTableQrCommand {
  constructor(
    readonly siteId: string,
    readonly tableNumber: number,
  ) {}
}
