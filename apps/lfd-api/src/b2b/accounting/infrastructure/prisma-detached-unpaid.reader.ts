import { companyDisplayName } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  DetachedUnpaidReader,
  type DetachedUnpaidRow,
  type UnpaidCompanyRef,
} from "../domain/ports/detached-unpaid.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";

/**
 * `order_collection` n'a pas de relation Prisma vers `orders` (l'id est
 * opaque) : deux lectures, jointes en mémoire, comme la constitution.
 */
@Injectable()
export class PrismaDetachedUnpaidReader extends DetachedUnpaidReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async rows(): Promise<readonly DetachedUnpaidRow[]> {
    const states = await this.prisma.orderCollection.findMany({
      where: { state: "excluded", exclusionReason: "payer_detached" },
      select: { orderId: true, updatedAt: true },
    });
    const excludedAt = new Map(states.map((state) => [state.orderId, state.updatedAt]));
    const orders = await this.prisma.order.findMany({
      where: { id: { in: [...excludedAt.keys()] }, companyId: { not: null } },
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalCents: true,
        billedCompanyId: true,
        company: { select: { id: true, raisonSociale: true, enseigne: true } },
      },
    });
    return orders.flatMap((order) => {
      const at = excludedAt.get(order.id);
      if (order.company === null || at === undefined) {
        return [];
      }
      return [
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          placedAt: order.createdAt,
          totalCents: order.totalCents,
          site: { id: order.company.id, name: companyDisplayName(order.company) },
          billedCompanyId: order.billedCompanyId,
          excludedAt: at,
        },
      ];
    });
  }

  async followsOf(siteIds: readonly string[]): Promise<readonly BillingFollow[]> {
    const rows = await this.prisma.companyFollow.findMany({
      where: { companyId: { in: [...siteIds] }, aspect: "billing" },
      select: {
        companyId: true,
        parentId: true,
        validFrom: true,
        validTo: true,
        parent: { select: { raisonSociale: true } },
      },
    });
    return rows.map((row) => ({
      companyId: row.companyId,
      payerId: row.parentId,
      payerName: row.parent.raisonSociale,
      validFrom: row.validFrom,
      validTo: row.validTo,
    }));
  }

  async companies(ids: readonly string[]): Promise<ReadonlyMap<string, UnpaidCompanyRef>> {
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, raisonSociale: true, enseigne: true },
    });
    return new Map(rows.map((row) => [row.id, { id: row.id, name: companyDisplayName(row) }]));
  }
}
