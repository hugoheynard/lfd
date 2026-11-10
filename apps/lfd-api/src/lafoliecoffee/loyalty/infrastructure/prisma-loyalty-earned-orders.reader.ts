import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LoyaltyEarnedOrdersReader } from "../domain/ports/loyalty-earned-orders.reader.js";

/**
 * Les gains déjà écrits, lus sur l'index partiel `(order_id) WHERE kind =
 * 'earned'`. Le client est le proxy transactionnel : appelé sous le verrou du
 * titulaire, la lecture voit ce qu'un crédit concurrent vient de commiter.
 */
@Injectable()
export class PrismaLoyaltyEarnedOrdersReader extends LoyaltyEarnedOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async earnedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.loyaltyLedgerEntry.findMany({
      where: { kind: "earned", orderId: { in: [...orderIds] } },
      select: { orderId: true },
    });
    return new Set(rows.flatMap((row) => (row.orderId === null ? [] : [row.orderId])));
  }
}
