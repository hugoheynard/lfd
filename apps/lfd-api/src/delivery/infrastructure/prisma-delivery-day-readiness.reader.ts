import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  DeliveryDayReadinessReader,
  type DeliveryDayReadinessRow,
} from "../domain/ports/delivery-day-readiness.reader.js";

/**
 * Adaptateur Prisma de la lecture du plan arrêté. Deux requêtes, sur les
 * seules tables de la livraison : la ligne, puis les arrêts VIVANTS des
 * tournées du même jour qui portent une commande de l'ensemble.
 */
@Injectable()
export class PrismaDeliveryDayReadinessReader extends DeliveryDayReadinessReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async readinessOf(serviceDay: string): Promise<DeliveryDayReadinessRow | null> {
    const row = await this.prisma.deliveryDayReadiness.findUnique({
      where: { serviceDay },
      select: { closedAt: true, deliveryOrderIds: true },
    });
    if (row === null) {
      return null;
    }
    const placed =
      row.deliveryOrderIds.length === 0
        ? []
        : await this.prisma.deliveryRoundStop.findMany({
            where: {
              orderId: { in: row.deliveryOrderIds },
              removedAt: null,
              round: { serviceDay },
            },
            distinct: ["orderId"],
            select: { orderId: true },
          });
    return {
      closedAt: row.closedAt,
      deliveryCount: row.deliveryOrderIds.length,
      unplacedCount: row.deliveryOrderIds.length - placed.length,
    };
  }
}
