import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogColdReader } from "../domain/ports/catalog-cold.reader.js";
import { STILL_SOLD } from "./sellable-filter.js";

/** Le froid, lu sur le miroir des articles : en rayon seulement, par SKU produit. */
@Injectable()
export class PrismaCatalogColdReader extends CatalogColdReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async coldProductSkus(): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { requiresCold: true, ...STILL_SOLD },
      select: { productSku: true },
      distinct: ["productSku"],
    });
    return new Set(rows.map((row) => row.productSku));
  }
}
