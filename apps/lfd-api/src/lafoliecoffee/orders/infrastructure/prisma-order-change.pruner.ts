import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderChangePruner } from "../domain/ports/order-change.pruner.js";

/**
 * Le balayage de `public.order_change`. Une suppression PHYSIQUE, et c'est
 * permis : ce journal n'est pas un agrégat métier, c'est un numéro d'affichage.
 */
@Injectable()
export class PrismaOrderChangePruner extends OrderChangePruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pruneBefore(instant: Date): Promise<number> {
    const { count } = await this.prisma.orderChange.deleteMany({
      where: { changedAt: { lt: instant } },
    });
    return count;
  }
}
