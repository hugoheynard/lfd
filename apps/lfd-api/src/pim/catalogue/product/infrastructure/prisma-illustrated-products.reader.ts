import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { IllustratedProductsReader } from "../domain/ports/illustrated-products.reader.js";

/** Une requête pour toute la liste, regroupée par fiche — jamais une par fiche. */
@Injectable()
export class PrismaIllustratedProductsReader extends IllustratedProductsReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async amongst(productIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (productIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.productMedia.groupBy({
      by: ["productId"],
      where: { productId: { in: [...productIds] } },
    });
    return new Set(rows.map((row) => row.productId));
  }
}
