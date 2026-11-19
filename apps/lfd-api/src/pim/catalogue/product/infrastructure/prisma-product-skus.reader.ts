import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductSkusReader } from "../domain/ports/product-skus.reader.js";

/** Un `findMany` par table, sur les identifiants demandés, deux colonnes. */
@Injectable()
export class PrismaProductSkusReader extends ProductSkusReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async productSkusOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, sku: true },
    });
    return new Map(rows.map((row) => [row.id, row.sku]));
  }

  async variantSkusOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const rows = await this.prisma.productVariant.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, sku: true },
    });
    return new Map(rows.map((row) => [row.id, row.sku]));
  }
}
