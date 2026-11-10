import { shownItemOrderLimit, type OrderCutoffView, type ShopCatalogueView } from "@lfd/contracts";

import type { ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";
import { shownByShopSku } from "./shop-catalogue-view.js";

/**
 * **La limite propre de chaque article**, posée sur la vitrine — seulement
 * quand elle est plus stricte que la règle générale (`shownItemOrderLimit`,
 * partagée avec les tests et la boutique).
 *
 * La limite lue est celle de l'unité vendue par défaut — la même ligne que
 * celle qui fait l'article de la vitrine (`shopCatalogueOf`) —, déjà résolue
 * par le référentiel sur l'échelle déclinaison → produit → famille → global.
 * La grâce n'est jamais servie.
 */
export function withOrderLimits(
  view: ShopCatalogueView,
  sellable: readonly ResolvedCatalogItem[],
  rules: readonly OrderCutoffView[],
): ShopCatalogueView {
  const byShopSku = shownByShopSku(sellable);
  return {
    ...view,
    items: view.items.map((item) => {
      const shown = shownItemOrderLimit(byShopSku.get(item.sku)?.orderTimeLimit ?? null, rules);
      return shown === null ? item : { ...item, orderTimeLimit: shown };
    }),
  };
}
