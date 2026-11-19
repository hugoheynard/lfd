import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { ProductContextRatesReader } from "../domain/ports/product-context-rates.reader.js";

/**
 * Un `count` pour un contexte, un `groupBy` pour tous, sur les dérogations des fiches —
 * dans la transaction de l'appelant quand il y en a une.
 */
@Injectable()
export class PrismaProductContextRatesReader extends ProductContextRatesReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  countIn(contextId: string): Promise<number> {
    return this.prisma.productContextVat.count({ where: { contextId } });
  }

  async countByContext(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.productContextVat.groupBy({
      by: ["contextId"],
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.contextId, row._count._all]));
  }
}
