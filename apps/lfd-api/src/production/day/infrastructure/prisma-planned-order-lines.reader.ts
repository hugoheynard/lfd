import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type PlannedOrderLineRef,
  PlannedOrderLinesReader,
} from "../domain/ports/planned-order-lines.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Une requête : les lignes des articles demandés, sur les commandes demandées de la journée. */
@Injectable()
export class PrismaPlannedOrderLinesReader extends PlannedOrderLinesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async linesOf(
    day: ServiceDay,
    orderIds: readonly string[],
    skus: readonly string[],
  ): Promise<readonly PlannedOrderLineRef[]> {
    const rows = await this.prisma.productionOrderLine.findMany({
      where: {
        sku: { in: [...skus] },
        order: { serviceDay: day.value, orderId: { in: [...orderIds] } },
      },
      select: { sku: true, order: { select: { orderId: true } } },
    });
    return rows.map((row) => ({ orderId: row.order.orderId, sku: row.sku }));
  }
}
