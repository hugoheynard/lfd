/** Lève à la main une alerte de stock d'un point. Acte staff. */
export class LiftStockAlertCommand {
  constructor(
    readonly siteId: string,
    readonly alertId: string,
    readonly staffUserId: string,
  ) {}
}
