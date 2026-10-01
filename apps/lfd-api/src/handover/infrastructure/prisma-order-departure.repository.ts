import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderDepartureRepository } from "../domain/ports/order-departure.repository.js";

/**
 * Les départs annoncés (`production.order_departure`, rangée avec
 * `order_handover` : le retrait n'a pas de schéma à lui).
 *
 * Un `upsert` par commande, dans une transaction : l'annonce d'une tournée
 * s'écrit entière ou pas du tout. Un second départ de la même commande (un
 * autre jour) réécrit l'instant.
 */
@Injectable()
export class PrismaOrderDepartureRepository extends OrderDepartureRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordDeparted(orderIds: readonly string[], at: Date): Promise<void> {
    if (orderIds.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      orderIds.map((orderId) =>
        this.prisma.orderDeparture.upsert({
          where: { orderId },
          create: { orderId, departedAt: at },
          update: { departedAt: at },
        }),
      ),
    );
  }
}
