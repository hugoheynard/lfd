import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CounterAccountOrderCountReader } from "../domain/ports/counter-account-order-count.reader.js";
import { ON_ACCOUNT_ORDER } from "./prisma-counter-account-outstanding.reader.js";

/**
 * Adaptateur Prisma du compte par lot : UN `groupBy`, le mur dans le `where`
 * (`company_id IN (…)`), et le filtre de l'encours — les deux lectures
 * comptent les mêmes commandes.
 */
@Injectable()
export class PrismaCounterAccountOrderCountReader extends CounterAccountOrderCountReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async countOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    if (companyIds.length === 0) {
      return counts;
    }
    const rows = await this.prisma.order.groupBy({
      by: ["companyId"],
      where: { companyId: { in: [...companyIds] }, ...ON_ACCOUNT_ORDER },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (row.companyId !== null) {
        counts.set(row.companyId, row._count._all);
      }
    }
    return counts;
  }
}
