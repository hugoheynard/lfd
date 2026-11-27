import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PlacedOrder } from "../domain/ports/order.repository.js";
import { PlannedColumnOrderReader } from "../domain/ports/planned-column-order.reader.js";

/** La commande d'une colonne planifiée, par l'index `orders_one_per_planned_column`. */
@Injectable()
export class PrismaPlannedColumnOrderReader extends PlannedColumnOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  orderOf(columnId: string): Promise<PlacedOrder | null> {
    return this.prisma.order.findUnique({
      where: { fromPlannedColumnId: columnId },
      select: { id: true, orderNumber: true },
    });
  }
}
