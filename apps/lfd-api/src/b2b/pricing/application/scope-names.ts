import { legacyShelfLabel } from "../../catalog/domain/legacy-shelf-codes.js";
import type { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import type { PriceScope } from "../domain/price-rule.js";

/**
 * **Le nom du moment** de ce qu'une portée tarifaire vise — pour le figer dans
 * la phrase d'un acte (plan des phrases du journal, lot B, D5).
 *
 * - `global` : `null`, il n'y a rien à nommer ;
 * - `category` : le nom de la famille du référentiel, dont l'identifiant est
 *   celui que vise la portée — cherché parmi les familles qui portent un
 *   article. Une portée d'avant le 2026-09-26 porte un ancien code de rayon :
 *   son libellé d'alors vient de `legacy-shelf-codes.ts` ;
 * - `product` / `variant` : le nom de l'article au catalogue, cherché par son
 *   SKU.
 *
 * Un article que le catalogue ne rend plus (retiré de la vente) ou une famille
 * sans article rendent `null` : l'identifiant reste alors dans la phrase
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
    const familyId = scope.id;
    const family = (await catalog.all()).find((item) => item.family?.id === familyId)?.family;
    return family?.name ?? legacyShelfLabel(familyId);
  }
  // `pro` : on ne cherche QU'UN NOM ici — l'audience ne le change pas, et
  // l'écran qui l'affiche est celui de la tarification professionnelle.
  return (await catalog.resolve(scope.id, "pro"))?.name ?? null;
}
