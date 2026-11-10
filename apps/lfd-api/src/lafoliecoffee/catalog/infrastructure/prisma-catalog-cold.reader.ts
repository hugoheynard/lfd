import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogColdReader } from "../domain/ports/catalog-cold.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";
import { STILL_SOLD } from "./sellable-filter.js";

/**
 * Le froid, lu sur le miroir des articles : en rayon seulement, par SKU de
 * vente, sans filtre d'audience — une déclinaison vendue au public seulement
 * part aussi en tournée.
 */
@Injectable()
export class PrismaCatalogColdReader extends CatalogColdReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async coldShopSkus(): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { requiresCold: true, ...STILL_SOLD },
      select: { sku: true, productSku: true, isDefault: true },
    });
    return new Set(rows.map(shopSkuOf));
  }
}
