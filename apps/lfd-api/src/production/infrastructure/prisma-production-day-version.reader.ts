import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDayVersionReader } from "../domain/ports/production-day-version.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * `max(id)` de `production.day_change` pour une journée — un parcours de
 * l'index `(service_day, id)`, une seule opération.
 */
@Injectable()
export class PrismaProductionDayVersionReader extends ProductionDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(day: ServiceDay): Promise<number> {
    const found = await this.prisma.productionDayChange.aggregate({
      where: { serviceDay: day.value },
      _max: { id: true },
    });
    // Un `bigserial` : il ne dépassera pas 2^53 avant très longtemps, et un
    // nombre JSON est ce que l'écran compare.
    return found._max.id === null ? 0 : Number(found._max.id);
  }
}
