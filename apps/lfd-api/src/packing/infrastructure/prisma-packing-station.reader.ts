import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingStationReader, type StationDay } from "../../production/channels/packing/index.js";

/**
 * Le poste de colisage d'une journée, en lecture — les bacs, leurs lignes et
 * les réserves, en deux requêtes. Implémente le port que le fournil déclare.
 */
@Injectable()
export class PrismaPackingStationReader extends PackingStationReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dayOf(serviceDay: string): Promise<StationDay> {
    const [orders, stocks] = await Promise.all([
      this.prisma.packingOrder.findMany({
        where: { serviceDay },
        select: {
          orderId: true,
          packedAt: true,
          packedBy: true,
          containerCount: true,
          lines: {
            select: { sku: true, packedAt: true, packedBy: true, packedInitials: true },
          },
        },
      }),
      this.prisma.packingStock.findMany({
        where: { serviceDay },
        select: { sku: true, received: true, returned: true, packed: true },
      }),
    ]);
    return {
      orders: orders.map((order) => ({
        orderId: order.orderId,
        packed:
          order.packedAt === null || order.packedBy === null
            ? null
            : { at: order.packedAt, by: order.packedBy },
        containers: order.containerCount,
        lines: order.lines.map((line) => ({
          sku: line.sku,
          packed:
            line.packedAt === null || line.packedBy === null
              ? null
              : { at: line.packedAt, by: line.packedBy, initials: line.packedInitials },
        })),
      })),
      stocks,
    };
  }
}
