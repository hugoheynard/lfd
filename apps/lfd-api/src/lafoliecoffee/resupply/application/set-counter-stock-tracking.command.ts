/** Active ou désactive le suivi du stock au comptoir d'un point. Acte staff. */
export class SetCounterStockTrackingCommand {
  constructor(
    readonly siteId: string,
    readonly stockTracking: boolean,
    readonly staffUserId: string,
  ) {}
}
