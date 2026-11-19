import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import {
  CategoryRateUsageReader,
  type RateContextTally,
} from "../domain/ports/category-rate-usage.reader.js";

/** Un `groupBy` par taux et contexte sur les taux des familles, compté côté base. */
@Injectable()
export class PrismaCategoryRateUsageReader extends CategoryRateUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async tallies(): Promise<readonly RateContextTally[]> {
    const rows = await this.prisma.categoryContextVat.groupBy({
      by: ["vatRateId", "contextId"],
      _count: { _all: true },
    });
    return rows.map((row) => ({
      vatRateId: row.vatRateId,
      contextId: row.contextId,
      count: row._count._all,
    }));
  }
}
