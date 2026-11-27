import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ReopenReleasePending,
  type ServiceDay,
} from "../../../production/channels/commerce/index.js";
import { releasableFromPlanWhere } from "./order-plan-release.where.js";

/**
 * Ce que le commerce répond au fournil qui arrête après une réouverture : une
 * commande que la remise rendrait encore au client est-elle là ? Même `where`
 * que la remise (`releasableFromPlanWhere`), pour qu'aucune commande ne fasse
 * attendre l'arrêt sans que la remise puisse la rendre.
 *
 * Lu dans l'unité de travail de l'arrêt, sous le verrou de la journée.
 */
@Injectable()
export class PrismaReopenReleasePending extends ReopenReleasePending {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pendingFor(day: ServiceDay, undoneClosedAt: Date): Promise<boolean> {
    const found = await this.prisma.order.findFirst({
      where: releasableFromPlanWhere(day.value, undoneClosedAt),
      select: { id: true },
    });
    return found !== null;
  }
}
