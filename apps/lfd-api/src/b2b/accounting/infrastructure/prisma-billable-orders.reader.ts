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
    // Par (société, payeur copié), puis replié sur le PAYEUR en mémoire :
    // `groupBy` ne sait pas grouper sur `COALESCE(billed_company_id, company_id)`.
    // ⚠️ Une commande d'avant S4 (payeur nul) reste sur sa société : cet aperçu
    // ne résout pas les suivis datés, le lot figé le fait (`billedPayerOf`).
    const rows = await this.prisma.order.groupBy({
      by: ["companyId", "billedCompanyId"],
      where: billableOrderWhere(from, to),
      _sum: { totalCents: true },
      _count: { _all: true },
    });
    const byPayer = new Map<string, { orderCount: number; totalCents: number }>();
    for (const row of rows) {
      const payerId = row.billedCompanyId ?? row.companyId;
      if (payerId === null) {
        continue;
      }
      const sum = byPayer.get(payerId) ?? { orderCount: 0, totalCents: 0 };
      byPayer.set(payerId, {
        orderCount: sum.orderCount + row._count._all,
        totalCents: sum.totalCents + (row._sum.totalCents ?? 0),
      });
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: [...byPayer.keys()] } },
      select: { id: true, raisonSociale: true },
    });
    const nameOf = new Map(companies.map((company) => [company.id, company.raisonSociale]));

    return [...byPayer.entries()].flatMap(([companyId, sum]) => {
      const companyName = nameOf.get(companyId);
      return companyName === undefined ? [] : [{ companyId, companyName, ...sum }];
    });
  }
}
