import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { PackingDayVersionReader } from "../../production/channels/packing/index.js";

/** `max(id)` de `packing.day_change` pour une journée — un parcours d'index. */
@Injectable()
export class PrismaPackingDayVersionReader extends PackingDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(serviceDay: string): Promise<number> {
    const found = await this.prisma.packingDayChange.aggregate({
      where: { serviceDay },
      _max: { id: true },
    });
    return found._max.id === null ? 0 : Number(found._max.id);
  }
}
