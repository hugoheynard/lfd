import { Injectable } from "@nestjs/common";

import { journalVersion } from "../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDayVersionReader } from "../domain/ports/production-day-version.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/**
 * `max(id)` et `count(*)` de `production.day_change` (`journalVersion`) pour une journée — un parcours de
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
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
