import type { CatalogSnapshot } from "@lfd/catalog-sync";

import type { CatalogItem } from "../domain/entities/catalog-item.js";
import type { DeliveredItem } from "../domain/delivery-diff.js";

/**
 * **Les deux côtés d'une comparaison d'arrivée**, mis à la même forme.
 *
 * Extrait parce que deux lectures en ont besoin — l'écran de validation, qui
 * montre le diff, et le port de retour, qui dit au référentiel si une arrivée
 * touche un SKU. Deux copies auraient fini par diverger sur le détail qui compte
 * : le prix **reçu** contre le prix **effectif**.
 */

/** Le snapshot livré, aplati en articles comparables. */
export function deliveredItems(snapshot: CatalogSnapshot): DeliveredItem[] {
  return snapshot.products.flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      priceMillicents: variant.priceMillicents,
      vatRatePercent: variant.vatRatePercent,
      weightGrams: variant.weightGrams,
      categoryId: product.categoryId,
      allergens: variant.allergens,
    })),
  );
}

/**
 * Le miroir, à la même forme.
 *
 * 🔴 Le prix **REÇU**, jamais l'effectif : une négociation locale n'est pas une
 * dérive du référentiel, et la compter comme telle ferait sonner l'écran sur
 * chaque client à qui l'on a consenti un tarif.
 */
export function mirrorItems(items: readonly CatalogItem[]): DeliveredItem[] {
  return items.map((item) => ({
    sku: item.sku,
    name: item.name,
    priceMillicents: item.pimPriceMillicents,
    vatRatePercent: item.vatRatePercent,
    weightGrams: item.weightGrams,
    categoryId: item.categoryId,
    allergens: item.allergens,
  }));
}
