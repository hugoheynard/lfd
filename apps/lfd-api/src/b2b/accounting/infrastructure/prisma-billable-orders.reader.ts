import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  BillableOrdersReader,
  type BillableCompany,
} from "../domain/ports/billable-orders.reader.js";
import { billableOrderWhere } from "./billable-order-criterion.js";

/**
 * L'assiette par société, sommée en SQL. Le critère vit dans
 * `billable-order-criterion.ts`, que le relevé de cycle partage : il n'est
 * écrit qu'à un endroit.
 */
@Injectable()
export class PrismaBillableOrdersReader extends BillableOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async billableBetween(from: Date, to: Date): Promise<readonly BillableCompany[]> {
    const rows = await this.prisma.order.groupBy({
      by: ["companyId"],
      where: billableOrderWhere(from, to),
      _sum: { totalCents: true },
      _count: { _all: true },
    });

    const companies = await this.prisma.company.findMany({
      where: { id: { in: rows.flatMap((row) => (row.companyId === null ? [] : [row.companyId])) } },
      select: { id: true, raisonSociale: true },
    });
    const nameOf = new Map(companies.map((company) => [company.id, company.raisonSociale]));

    return rows.flatMap((row) => {
      const companyId = row.companyId;
      const companyName = companyId === null ? undefined : nameOf.get(companyId);
      if (companyId === null || companyName === undefined) {
        return [];
      }
      return [
        {
          companyId,
          companyName,
          orderCount: row._count._all,
          totalCents: row._sum.totalCents ?? 0,
        },
      ];
    });
  }
}
