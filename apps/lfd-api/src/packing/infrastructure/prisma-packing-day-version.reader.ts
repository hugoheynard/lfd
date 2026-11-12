import { Injectable } from "@nestjs/common";

import { journalVersion } from "../../platform/day-versions/journal-version.js";
import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingDayVersionReader } from "../../production/channels/packing/index.js";

/** `max(id)` et `count(*)` de `packing.day_change` (`journalVersion`) pour une journée — un parcours d'index. */
@Injectable()
export class PrismaPackingDayVersionReader extends PackingDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(serviceDay: string): Promise<number> {
    const found = await this.prisma.packingDayChange.aggregate({
      where: { serviceDay },
      _max: { id: true },
      _count: true,
    });
    return journalVersion(found._max.id, found._count);
  }
}
