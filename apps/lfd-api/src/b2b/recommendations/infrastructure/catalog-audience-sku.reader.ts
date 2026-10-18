import { Injectable } from "@nestjs/common";

import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import { AudienceSkuReader } from "../domain/ports/audience-sku.reader.js";

/**
 * Les SKU servis à quelqu'un, lus par le port du catalogue pour les DEUX
 * audiences : `resolveMany` applique `servedTo`, on n'a qu'à réunir.
 */
@Injectable()
export class CatalogAudienceSkuReader extends AudienceSkuReader {
  constructor(private readonly catalog: ProductCatalogReader) {
    super();
  }

  async servedAmong(skus: readonly string[]): Promise<ReadonlySet<string>> {
    const [pro, publicItems] = await Promise.all([
      this.catalog.resolveMany(skus, "pro"),
      this.catalog.resolveMany(skus, "public"),
    ]);
    return new Set([...pro.keys(), ...publicItems.keys()]);
  }
}
