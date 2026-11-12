import { Injectable } from "@nestjs/common";

import { journalVersion } from "../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryDayVersionReader } from "../domain/ports/delivery-day-version.reader.js";

/**
 * `max(id)` et `count(*)` de `delivery.day_change` (`journalVersion`) pour une journée — un parcours de l'index
 * `(service_day, id)`, une seule opération.
 */
@Injectable()
export class PrismaDeliveryDayVersionReader extends DeliveryDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(serviceDay: string): Promise<number> {
    const found = await this.prisma.deliveryDayChange.aggregate({
      where: { serviceDay },
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
