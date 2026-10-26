import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderPlanRelease } from "../domain/ports/order-plan-release.js";

/**
 * L'adaptateur Prisma de la remise au client d'un plan défait.
 *
 * Toute la règle est dans le `WHERE`, comme pour `absorbIntoPlan` : c'est la
 * base qui refuse de faire reculer une commande que l'arrêt défait n'avait
 * pas confirmée (`confirmedAt = closedAt` — l'arrêt écrit son PROPRE instant,
 * cf. `OnProductionDayClosed`), ou qui est déjà prête.
 */
@Injectable()
export class PrismaOrderPlanRelease extends OrderPlanRelease {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async releaseFromPlan(
    serviceDay: string,
    orderIds: readonly string[],
    closedAt: Date,
  ): Promise<number> {
    const { count } = await this.prisma.order.updateMany({
      where: {
        id: { in: [...orderIds] },
        requestedDeliveryDate: new Date(`${serviceDay}T00:00:00.000Z`),
        status: OrderStatus.confirmed,
        confirmedAt: closedAt,
        readyAt: null,
        // Une commande dont le départ est décidé reste confirmée, comme une
        // prête : la re-clôture ne la refabrique pas en entier (E6b, § 13).
        // Une décision sur n'importe quel envoi (LB) : un reste n'existe
        // qu'après celle du rang 1.
        shortfallDecisions: { none: {} },
      },
      data: { status: OrderStatus.placed, confirmedAt: null },
    });
    return count;
  }
}
