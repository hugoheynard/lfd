import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CancelledOrdersReader } from "../domain/ports/cancelled-orders.reader.js";
import { OrderNumbersReader } from "../domain/ports/order-numbers.reader.js";

/** Les commandes annulées parmi celles d'un lot — par leur numéro. */
@Injectable()
export class PrismaCancelledOrdersReader extends CancelledOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async cancelledAmong(orderIds: readonly string[]): Promise<readonly string[]> {
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] }, status: "cancelled" },
      select: { orderNumber: true },
      orderBy: { orderNumber: "asc" },
    });
    return rows.map((row) => row.orderNumber);
  }
}

@Injectable()
export class PrismaOrderNumbersReader extends OrderNumbersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async numberOf(orderId: string): Promise<string | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });
    return row?.orderNumber ?? null;
  }
}
