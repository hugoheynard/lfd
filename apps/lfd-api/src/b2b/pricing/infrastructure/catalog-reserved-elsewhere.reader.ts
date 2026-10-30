import { Injectable } from "@nestjs/common";

import { CatalogViewers } from "../../catalog/application/catalog-viewers.service.js";
import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import { ReservedElsewhereReader } from "../domain/ports/reserved-elsewhere.reader.js";

/**
 * Le catalogue lu au nom du client (`staff`, `regarding`) : un article réservé
 * à un autre compte y porte l'étiquette `other`, qu'il soit `hidden` ou
 * `visible_locked` — la visibilité ne joue que chez les pros.
 */
@Injectable()
export class CatalogReservedElsewhereReader extends ReservedElsewhereReader {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly viewers: CatalogViewers,
  ) {
    super();
  }

  async among(companyId: string, shopSkus: readonly string[]): Promise<readonly string[]> {
    if (shopSkus.length === 0) {
      return [];
    }
    const items = await this.catalog.resolveMany(shopSkus, await this.viewers.regarding(companyId));
    return shopSkus.filter((sku) => items.get(sku)?.reservation === "other");
  }
}
