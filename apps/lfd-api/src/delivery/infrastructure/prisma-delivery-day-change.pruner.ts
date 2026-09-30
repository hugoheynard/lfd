import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryDayChangePruner } from "../domain/ports/delivery-day-change.pruner.js";

/**
 * Le balayage de `delivery.day_change`. Une suppression PHYSIQUE, et c'est
 * permis : ce journal n'est pas un agrégat métier, c'est un numéro d'affichage
 * dont seule la dernière valeur compte.
 */
@Injectable()
export class PrismaDeliveryDayChangePruner extends DeliveryDayChangePruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pruneBefore(instant: Date): Promise<number> {
    const { count } = await this.prisma.deliveryDayChange.deleteMany({
      where: { changedAt: { lt: instant } },
    });
    return count;
  }
}
