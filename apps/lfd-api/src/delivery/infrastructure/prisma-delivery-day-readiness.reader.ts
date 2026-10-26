import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  DeliveryDayReadinessReader,
  type DeliveryDayReadinessRow,
} from "../domain/ports/delivery-day-readiness.reader.js";

/**
 * Adaptateur Prisma de la lecture du plan arrêté. Deux requêtes, sur les
 * seules tables de la livraison : la ligne et ses envois, puis les arrêts
 * VIVANTS des tournées du même jour qui portent un envoi de l'ensemble
 * (commande ET rang, plan E7 reliquat, L3c).
 */
@Injectable()
export class PrismaDeliveryDayReadinessReader extends DeliveryDayReadinessReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async readinessOf(serviceDay: string): Promise<DeliveryDayReadinessRow | null> {
    const row = await this.prisma.deliveryDayReadiness.findUnique({
      where: { serviceDay },
      select: { closedAt: true, shipments: { select: { orderId: true, rank: true } } },
    });
    if (row === null) {
      return null;
    }
    const placed =
      row.shipments.length === 0
        ? []
        : await this.prisma.deliveryRoundStop.findMany({
            where: {
              OR: row.shipments.map(({ orderId, rank }) => ({ orderId, rank })),
              removedAt: null,
              round: { serviceDay },
            },
            distinct: ["orderId", "rank"],
            select: { orderId: true },
          });
    return {
      closedAt: row.closedAt,
      deliveryCount: row.shipments.length,
      unplacedCount: row.shipments.length - placed.length,
    };
  }
}
