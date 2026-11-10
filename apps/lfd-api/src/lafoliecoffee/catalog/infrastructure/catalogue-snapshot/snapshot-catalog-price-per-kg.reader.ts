import { Injectable } from "@nestjs/common";

import {
  CatalogPricePerKgReader,
  type CatalogPricePerKg,
} from "../../domain/ports/catalog-price-per-kg.reader.js";
import { PrismaCatalogPricePerKgReader } from "../prisma-catalog-price-per-kg.reader.js";
import { CatalogueSnapshotStore } from "./catalogue-snapshot.store.js";

/**
 * **Les prix au kilo sur l'instantané** (lecture E, § 2.4, lot M2) : les deux
 * colonnes du kilo, prises dans l'index par SKU du morceau `catalog` — que le
 * rayon vient de lire pour ses articles. Hors de la portée, la base comme
 * avant. Les deux sources ne gardent que les articles ENCORE VENDUS
 * (`STILL_SOLD`) : un SKU retiré est absent des deux.
 */
@Injectable()
export class SnapshotCatalogPricePerKgReader extends CatalogPricePerKgReader {
  constructor(
    private readonly base: PrismaCatalogPricePerKgReader,
    private readonly store: CatalogueSnapshotStore,
  ) {
    super();
  }

  async bySkus(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogPricePerKg>> {
    if (!this.store.serves()) {
      return this.base.bySkus(skus);
    }
    if (skus.length === 0) {
      return new Map();
    }
    const { bySku } = await this.store.articles();
    const prices = new Map<string, CatalogPricePerKg>();
    for (const sku of skus) {
      const row = bySku.get(sku);
      if (row !== undefined) {
        prices.set(sku, {
          proPricePerKgMillicents: row.proPricePerKgMillicents,
          publicPricePerKgTtcCents: row.publicPricePerKgTtcCents,
        });
      }
    }
    return prices;
  }
}
