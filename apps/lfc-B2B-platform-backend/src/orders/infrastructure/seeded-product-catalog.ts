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
 * Catalogue en mémoire, semé au démarrage depuis `CATALOG_SEED`. Indexé par SKU
 * pour une résolution O(1) au checkout. Attache à chaque article son **taux de
 * TVA** (5,5 % par défaut, surcharge ci-dessus). Les prix semés sont **HT**.
 */
@Injectable()
export class SeededProductCatalog extends ProductCatalogReader {
  private readonly bySku = new Map<string, CatalogItem>(
    CATALOG_SEED.map((priced) => [
      priced.sku,
      { ...priced, vatRate: VAT_RATE_OVERRIDES[priced.sku] ?? DEFAULT_FOOD_VAT_RATE },
    ]),
  );

  resolve(sku: string): CatalogItem | null {
    return this.bySku.get(sku) ?? null;
  }
}
