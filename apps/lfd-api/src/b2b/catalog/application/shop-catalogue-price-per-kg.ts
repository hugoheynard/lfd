import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import type { CatalogPricePerKg } from "../domain/ports/catalog-price-per-kg.reader.js";
import type { ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";
import { shownByShopSku } from "./shop-catalogue-view.js";

/** Ce qu'une vitrine sans prix au kilo porte : rien de saisi. */
const NOT_ENTERED: CatalogPricePerKg = {
  proPricePerKgMillicents: null,
  publicPricePerKgTtcCents: null,
};

/**
 * **Les prix au kilo posés sur le rayon** (`plan-prix-au-kilo.md`, K3) — les
 * deux, chacun nommé par son unité. Le serveur ne choisit pas l'assiette :
 * c'est l'écran qui la choisit, comme pour le prix à la pièce.
 *
 * Posés APRÈS la composition et le prix : ils ne se rangent pas, ne se
 * vendent pas, ne se tarifent pas. La carte est lue par SKU de déclinaison ;
 * la vue est indexée par SKU de vente, d'où le détour par l'article montré.
 */
export function withPricesPerKg(
  view: ShopCatalogueView,
  sellable: readonly ResolvedCatalogItem[],
  perKg: ReadonlyMap<string, CatalogPricePerKg>,
): ShopCatalogueView {
  const shown = shownByShopSku(sellable);
  return {
    ...view,
    items: view.items.map((item): ShopItemView => {
      const variantSku = shown.get(item.sku)?.sku;
      const entered = (variantSku === undefined ? undefined : perKg.get(variantSku)) ?? NOT_ENTERED;
      return { ...item, ...entered };
    }),
  };
}

/** Les SKU de déclinaison dont la vitrine a besoin : ceux des articles montrés. */
export function shownVariantSkus(
  view: ShopCatalogueView,
  sellable: readonly ResolvedCatalogItem[],
): readonly string[] {
  const shown = new Set(view.items.map((item) => item.sku));
  return [...shownByShopSku(sellable)]
    .filter(([shopSku]) => shown.has(shopSku))
    .map(([, item]) => item.sku);
}
