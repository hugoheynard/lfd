import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OccurrenceOrderReader } from "../domain/ports/occurrence-order.reader.js";
import type { PlacedOrder } from "../domain/ports/order.repository.js";

/** La commande d'une échéance, par l'index `orders_one_per_occurrence`. */
@Injectable()
export class PrismaOccurrenceOrderReader extends OccurrenceOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  orderOf(basketId: string, occurrenceDay: string): Promise<PlacedOrder | null> {
    return this.prisma.order.findFirst({
      where: {
        fromSubscriptionId: basketId,
        fromOccurrenceDay: new Date(`${occurrenceDay}T00:00:00.000Z`),
      },
      select: { id: true, orderNumber: true },
    });
  }
}
