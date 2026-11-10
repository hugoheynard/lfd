import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DefaultSaleReferenceReader } from "../domain/ports/default-sale-reference.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** Les défauts en vente de ces fiches, en une lecture, sous leur référence de vente. */
@Injectable()
export class PrismaDefaultSaleReferenceReader extends DefaultSaleReferenceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofProducts(productSkus: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (productSkus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogItem.findMany({
      where: { productSku: { in: [...new Set(productSkus)] }, isDefault: true, ...STILL_SOLD },
      select: { sku: true, productSku: true },
    });
    return new Map(rows.map((row) => [row.productSku, shopSkuOf(row)]));
  }
}
