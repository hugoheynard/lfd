import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  OrderCustodyReader,
  type OrderOutOfHand,
} from "../../production/channels/handover/index.js";

/**
 * **Ce que le retrait répond au fournil** : lesquelles de ces commandes ne sont
 * plus là (`plan-a-la-porte.md`, BQ). Un adaptateur à part des dépôts
 * d'écriture, pour la raison de `PrismaAttestedHandoversReader` (ISP).
 *
 * Retirée l'emporte sur partie : c'est le dernier état, et la phrase la plus
 * juste pour qui lit le refus.
 */
@Injectable()
export class PrismaOrderCustodyReader extends OrderCustodyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async outOfHand(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderOutOfHand>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const ids = [...orderIds];
    const [departed, handedOver] = await Promise.all([
      // Une commande « rapportée » (B3) est revenue : elle n'est plus partie.
      this.prisma.orderDeparture.findMany({
        where: { orderId: { in: ids }, returnedAt: null },
        select: { orderId: true },
      }),
      this.prisma.orderHandover.findMany({
        where: { orderId: { in: ids } },
        select: { orderId: true },
      }),
    ]);
    const gone = new Map<string, OrderOutOfHand>();
    for (const row of departed) {
      gone.set(row.orderId, "departed");
    }
    for (const row of handedOver) {
      gone.set(row.orderId, "handed_over");
    }
    return gone;
  }
}
