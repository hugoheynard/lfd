/** Masque un article, ou le remet en vente (cf. `catalog-decision-support.ts`). */
export class SetCatalogVisibilityCommand {
  constructor(
    readonly sku: string,
    readonly hidden: boolean,
    readonly decidedBy: string | null,
  ) {}
}
