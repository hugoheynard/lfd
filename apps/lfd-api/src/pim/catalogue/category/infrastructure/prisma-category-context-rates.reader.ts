import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { CategoryContextRatesReader } from "../domain/ports/category-context-rates.reader.js";

/**
 * Un `count` pour un contexte, un `groupBy` pour tous, sur les taux des familles —
 * dans la transaction de l'appelant quand il y en a une.
 */
@Injectable()
export class PrismaCategoryContextRatesReader extends CategoryContextRatesReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  countIn(contextId: string): Promise<number> {
    return this.prisma.categoryContextVat.count({ where: { contextId } });
  }

  async countByContext(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.categoryContextVat.groupBy({
      by: ["contextId"],
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.contextId, row._count._all]));
  }
}
