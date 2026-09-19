/** Met un article en avant, ou l'en retire (cf. `catalog-decision-support.ts`). */
export class SetCatalogFeaturedCommand {
  constructor(
    readonly sku: string,
    readonly featured: boolean,
    readonly decidedBy: string | null,
  ) {}
}
