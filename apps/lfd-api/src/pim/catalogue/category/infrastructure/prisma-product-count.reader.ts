import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductCountReader } from "../domain/ports/product-count.reader.js";

/** « Active » = tout sauf archivée. La définition vit ICI, en un seul endroit. */
const ACTIVE = { status: { not: "archived" } } as const;

@Injectable()
export class PrismaProductCountReader extends ProductCountReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async countForCategory(categoryId: string): Promise<number> {
    return this.prisma.product.count({ where: { categoryId, ...ACTIVE } });
  }

  async countByCategory(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.product.groupBy({
      by: ["categoryId"],
      where: ACTIVE,
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.categoryId, row._count._all]));
  }
}
