import type { ShopCatalogueView } from "@lfd/contracts";

import type { PricingCaller } from "../../pricing/application/pricing-caller.js";
import { anonymousViewer, type CatalogViewer } from "../domain/catalog-viewer.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";
import type { ShelfBuyer } from "./shop-catalogue-offers.js";

/**
 * Ce que tarifer : tout le rayon (`only: null`), ou les seuls articles
 * demandés. Le filtre se pose sur la vue AVANT le prix — tout ce qui suit
 * (lot, prix au kilo, offres) ne voit plus que ces articles.
 */
export interface ShelfScope {
  readonly only: ReadonlySet<string> | null;
  readonly caller: PricingCaller;
}

export const SHELF_SCOPE: ShelfScope = { only: null, caller: "shelf" };

export function scopedTo(catalogue: ShopCatalogueView, scope: ShelfScope): ShopCatalogueView {
  const { only } = scope;
  return only === null
    ? catalogue
    : { ...catalogue, items: catalogue.items.filter((item) => only.has(item.sku)) };
}

/**
 * Le lecteur et l'acheteur d'une vitrine sans société. Sans société, un pro
 * est anonyme : jamais un article réservé (Q2). À `pro`, l'audience est
 * déclarée (`previewed`) ; à `public`, c'est un invité.
 */
export function withoutCompany(audience: ShopAudience): {
  readonly viewer: CatalogViewer;
  readonly buyer: ShelfBuyer;
} {
  return {
    viewer: anonymousViewer(audience),
    buyer: { companyId: null, buyerKind: audience === "pro" ? "previewed" : "guest" },
  };
}
