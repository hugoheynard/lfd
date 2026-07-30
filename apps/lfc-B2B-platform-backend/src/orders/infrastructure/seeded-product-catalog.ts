import { Injectable } from "@nestjs/common";

import { type CatalogItem, ProductCatalogReader } from "../domain/ports/product-catalog.reader.js";
import { CATALOG_SEED } from "./product-catalog.seed.js";

/** TVA Phase 1 : 0 partout (le seed n'a pas de taux — cf. product-catalog.seed). */
const PHASE1_VAT_RATE = 0;

/**
 * Catalogue en mémoire, semé au démarrage depuis `CATALOG_SEED`. Indexé par SKU
 * pour une résolution O(1) au checkout. Ajoute la TVA (0 en Phase 1) au prix semé.
 */
@Injectable()
export class SeededProductCatalog extends ProductCatalogReader {
  private readonly bySku = new Map<string, CatalogItem>(
    CATALOG_SEED.map((priced) => [priced.sku, { ...priced, vatRate: PHASE1_VAT_RATE }]),
  );

  resolve(sku: string): CatalogItem | null {
    return this.bySku.get(sku) ?? null;
  }
}
