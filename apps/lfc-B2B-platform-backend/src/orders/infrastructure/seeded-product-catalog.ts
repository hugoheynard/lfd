import { CATALOG_CATEGORY_ORDER, type CatalogCategory } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { type CatalogItem, ProductCatalogReader } from "../domain/ports/product-catalog.reader.js";
import { DEFAULT_FOOD_VAT_RATE } from "../domain/services/vat.js";
import { CATALOG_SEED } from "./product-catalog.seed.js";

/**
 * TVA **par produit**, pilotée par la donnée. Le catalogue est alimentaire
 * (viennoiseries, pains, pâtisseries) → **5,5 %** par défaut. Les rares SKU
 * non-alimentaires (goodies, matériel…) se surchargent ici à 20 %. C'est le taux
 * du **produit**, pas du client : rien à voir avec le fait qu'il soit un pro.
 */
const VAT_RATE_OVERRIDES: Readonly<Record<string, number>> = {
  // Ex. : "GOO-001": 20  (non-alimentaire → taux normal)
};

/**
 * La famille d'un produit, lue dans son **préfixe de SKU**.
 *
 * Le préfixe porte déjà l'information — `VIE-001` est une viennoiserie, et
 * chacun des 92 SKU en a un. Ajouter une colonne « catégorie » à côté aurait
 * ouvert la possibilité que les deux se contredisent, sans rien apprendre de
 * plus.
 */
const CATEGORY_BY_PREFIX: Readonly<Record<string, CatalogCategory>> = {
  VIE: "viennoiserie",
  PAI: "pain",
  PAT: "patisserie",
  SAL: "sale",
  CHO: "chocolat",
};

/**
 * Range un SKU. Un préfixe inconnu **lève** plutôt que de se ranger au hasard :
 * la faute est alors au seed, elle se voit au démarrage, et un rayon par défaut
 * ferait disparaître le produit dans une famille où personne ne le cherche.
 */
function categoryOf(sku: string): CatalogCategory {
  const category = CATEGORY_BY_PREFIX[sku.slice(0, 3)];
  if (category === undefined) {
    throw new Error(`Catalogue : préfixe de SKU inconnu (« ${sku} »).`);
  }
  return category;
}

/**
 * Catalogue en mémoire, semé au démarrage depuis `CATALOG_SEED`. Indexé par SKU
 * pour une résolution O(1) au checkout. Attache à chaque article son **taux de
 * TVA** (5,5 % par défaut, surcharge ci-dessus) et sa **famille** (préfixe de
 * SKU). Les prix semés sont **HT**.
 */
@Injectable()
export class SeededProductCatalog extends ProductCatalogReader {
  private readonly bySku = new Map<string, CatalogItem>(
    CATALOG_SEED.map((priced) => [
      priced.sku,
      {
        ...priced,
        vatRate: VAT_RATE_OVERRIDES[priced.sku] ?? DEFAULT_FOOD_VAT_RATE,
        category: categoryOf(priced.sku),
      },
    ]),
  );

  /**
   * Le catalogue rangé par rayon, dans l'ordre de la vitrine, alphabétique à
   * l'intérieur. Trié **une fois** au démarrage : la liste est immuable, la
   * retrier à chaque requête serait payer le tri pour rien.
   */
  private readonly ordered: readonly CatalogItem[] = [...this.bySku.values()].sort(byShelfThenName);

  resolve(sku: string): CatalogItem | null {
    return this.bySku.get(sku) ?? null;
  }

  all(): readonly CatalogItem[] {
    return this.ordered;
  }
}

/** L'ordre de la vitrine d'abord, l'alphabet ensuite. */
function byShelfThenName(left: CatalogItem, right: CatalogItem): number {
  const shelves =
    CATALOG_CATEGORY_ORDER.indexOf(left.category) - CATALOG_CATEGORY_ORDER.indexOf(right.category);
  return shelves === 0 ? left.name.localeCompare(right.name, "fr") : shelves;
}
