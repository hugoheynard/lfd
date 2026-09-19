import { CATALOG_CATEGORY_LABELS } from "@lfd/contracts";

import type { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import type { PriceScope } from "../domain/price-rule.js";

/**
 * **Le nom du moment** de ce qu'une portée tarifaire vise — pour le figer dans
 * la phrase d'un acte (plan des phrases du journal, lot B, D5).
 *
 * - `global` : `null`, il n'y a rien à nommer ;
 * - `category` : le rayon, dont l'identifiant est le code (`viennoiserie`) —
 *   c'est lui que visent les règles (`pricingContextFor`) ;
 * - `product` / `variant` : le nom de l'article au catalogue, cherché par son
 *   SKU.
 *
 * Un article que le catalogue ne rend plus (retiré de la vente) ou un code de
 * rayon inconnu rendent `null` : l'identifiant reste alors dans la phrase
 * (`describeScope`), plutôt qu'un nom qu'on n'a pas.
 *
 * Rien ici n'entre dans un calcul de prix : ce nom ne sert qu'à la phrase.
 */
export async function scopeNameOf(
  scope: PriceScope,
  catalog: ProductCatalogReader,
): Promise<string | null> {
  if (scope.id === null) {
    return null;
  }
  if (scope.type === "category") {
    const shelf = Object.entries(CATALOG_CATEGORY_LABELS).find(([code]) => code === scope.id);
    return shelf?.[1] ?? null;
  }
  return (await catalog.resolve(scope.id))?.name ?? null;
}
