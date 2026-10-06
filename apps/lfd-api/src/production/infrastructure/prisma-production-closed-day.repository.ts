import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { ProductionClosedDay } from "../domain/entities/production-closed-day.js";
import { ProductionClosedDayRepository } from "../domain/ports/production-closed-day.repository.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * Le calendrier des jours fermés, dans `production.production_closed_day`.
 *
 * `createMany … skipDuplicates` et `deleteMany` : deux écritures qui rendent
 * leur compte, donc « ai-je changé quelque chose ? » sans lecture préalable ni
 * course entre deux clics.
 */
@Injectable()
export class PrismaProductionClosedDayRepository extends ProductionClosedDayRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(day: ProductionClosedDay): Promise<boolean> {
    const { count } = await this.prisma.productionClosedDay.createMany({
      data: [
        {
          serviceDay: day.serviceDay.value,
          declaredBy: day.declaredBy,
          declaredAt: day.declaredAt,
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }

  /** Un vrai DELETE : un paramétrage de calendrier, pas un agrégat métier (§3.1). */
  async remove(day: ServiceDay): Promise<boolean> {
    const { count } = await this.prisma.productionClosedDay.deleteMany({
      where: { serviceDay: day.value },
    });
    return count > 0;
  }
}
