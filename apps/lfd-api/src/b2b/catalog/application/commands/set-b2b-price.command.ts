/**
 * Pose le prix B2B négocié d'un article — une intention du back-office,
 * nommée dans le vocabulaire du commercial (cf. `catalog-decision-support.ts`).
 */
export class SetB2bPriceCommand {
  constructor(
    readonly sku: string,
    readonly priceMillicents: number,
    readonly decidedBy: string | null,
  ) {}
}
