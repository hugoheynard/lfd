import type { ShopCatalogueView, ShopItemView } from "@lfd/contracts";

import type { CatalogPricePerKg } from "../domain/ports/catalog-price-per-kg.reader.js";
import type { ResolvedCatalogItem, ShopAudience } from "../domain/ports/catalog.reader.js";
import { servedPricePerKg } from "./shop-catalogue-promoted-per-kg.js";
import { shownByShopSku } from "./shop-catalogue-view.js";

/** Ce qu'une vitrine sans prix au kilo porte : rien de saisi. */
const NOT_ENTERED: CatalogPricePerKg = {
  proPricePerKgMillicents: null,
  publicPricePerKgTtcCents: null,
};

/**
 * **Le prix au kilo posé sur le rayon** (`saisir-un-prix.md`, K3) — celui
 * de l'audience servie, et lui seul : le prix au kilo PRO pour un rayon pro,
 * le PUBLIC pour un rayon public ; l'autre champ vaut `null`.
 *
 * ⚠️ Les deux étaient servis à toutes les audiences jusqu'au 2026-10-31, et
 * l'écran choisissait. C'était deux clientèles dans une seule réponse — le
 * prix au kilo pro sur la route publique sans `?audience=pro` — contre la
 * règle de Hugo du même jour (« chaque audience n'a le droit qu'à son
 * information », `plan-chaque-audience-son-information.md`). L'écran ne
 * montre jamais l'autre en repli : il lit l'assiette qu'il affiche
 * (`showsTtc()` — HT pour un pro, TTC pour un particulier).
 *
 * Posés APRÈS la composition, le prix et le nom des promotions : ils ne se
 * rangent pas, ne se vendent pas, ne se tarifent pas — mais sous une
 * promotion, le kilo suit la pièce et le kilo saisi se barre
 * (`servedPricePerKg`, `saisir-un-prix.md`, § 2), ce qui
 * demande le tarif, le prix servi ET `promotionNames`, tous posés avant. La carte est lue par SKU de déclinaison ;
 * la vue est indexée par SKU de vente, d'où le détour par l'article montré.
 */
export function withPricesPerKg(
  view: ShopCatalogueView,
  sellable: readonly ResolvedCatalogItem[],
  perKg: ReadonlyMap<string, CatalogPricePerKg>,
  audience: ShopAudience,
): ShopCatalogueView {
  const shown = shownByShopSku(sellable);
  return {
    ...view,
    items: view.items.map((item): ShopItemView => {
      const variantSku = shown.get(item.sku)?.sku;
      const entered = (variantSku === undefined ? undefined : perKg.get(variantSku)) ?? NOT_ENTERED;
      return { ...item, ...servedPricePerKg(item, entered, audience) };
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
