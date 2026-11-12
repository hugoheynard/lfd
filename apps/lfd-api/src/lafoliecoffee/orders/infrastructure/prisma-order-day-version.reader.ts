import { Injectable } from "@nestjs/common";

import { journalVersion } from "../../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderDayVersionReader } from "../domain/ports/order-day-version.reader.js";

/** `max(id)` et `count(*)` de `public.day_change` (`journalVersion`) pour un jour — un parcours d'index. */
@Injectable()
export class PrismaOrderDayVersionReader extends OrderDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(day: string): Promise<number> {
    const found = await this.prisma.orderDayChange.aggregate({
      where: { serviceDay: day },
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
