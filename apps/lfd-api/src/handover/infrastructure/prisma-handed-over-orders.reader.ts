import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { HandedOverOrdersReader } from "../domain/ports/handed-over-orders.reader.js";

/** Les attestations de retrait des commandes demandées — une requête, quel que soit leur nombre. */
@Injectable()
export class PrismaHandedOverOrdersReader extends HandedOverOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async handedOverAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (orderIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.orderHandover.findMany({
      where: { orderId: { in: [...orderIds] } },
      select: { orderId: true },
    });
    return new Set(rows.map((row) => row.orderId));
  }
}
