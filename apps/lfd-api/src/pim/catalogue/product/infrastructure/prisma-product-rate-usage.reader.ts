import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import type { RateContextTally } from "../../category/domain/ports/category-rate-usage.reader.js";
import { ProductRateUsageReader } from "../domain/ports/product-rate-usage.reader.js";

/** Un `groupBy` par taux et contexte sur les dérogations des fiches, compté côté base. */
@Injectable()
export class PrismaProductRateUsageReader extends ProductRateUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async tallies(): Promise<readonly RateContextTally[]> {
    const rows = await this.prisma.productContextVat.groupBy({
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
