/** « Il manque » sur le bac d'une commande (lot E6a). */
export class ReportPackingShortfallCommand {
  constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly staffUserId: string,
  ) {}
}
