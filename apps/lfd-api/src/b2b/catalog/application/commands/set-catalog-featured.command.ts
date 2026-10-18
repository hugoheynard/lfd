import type { ShopAudience } from "../../domain/ports/catalog.reader.js";

/**
 * Met un article en avant pour une audience, ou l'en retire
 * (cf. `catalog-decision-support.ts`).
 */
export class SetCatalogFeaturedCommand {
  constructor(
    readonly sku: string,
    readonly audience: ShopAudience,
    readonly featured: boolean,
    readonly decidedBy: string | null,
  ) {}
}
