import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderPlanRelease } from "../domain/ports/order-plan-release.js";
import { releasableFromPlanWhere } from "./order-plan-release.where.js";

/**
 * L'adaptateur Prisma de la remise au client d'un plan défait.
 *
 * Toute la règle est dans le `WHERE`, comme pour `absorbIntoPlan` : c'est la
 * base qui refuse de faire reculer une commande que l'arrêt défait n'avait
 * pas confirmée, qui est déjà prête ou dont un manque est décidé. La
 * condition est partagée avec `PrismaReopenReleasePending`
 * (`releasableFromPlanWhere`) : l'arrêt attend exactement ce qu'elle remet.
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
      where: { id: { in: [...orderIds] }, ...releasableFromPlanWhere(serviceDay, closedAt) },
      data: { status: OrderStatus.placed, confirmedAt: null },
    });
    return count;
  }
}
