/** Retire le prix B2B : l'article repasse au tarif du PIM et suivra ses hausses. */
export class AlignOnPimPriceCommand {
  constructor(readonly sku: string) {}
}
