import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderDayVersionReader } from "../domain/ports/order-day-version.reader.js";

/** `max(id)` de `public.day_change` pour un jour — un parcours d'index. */
@Injectable()
export class PrismaOrderDayVersionReader extends OrderDayVersionReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(day: string): Promise<number> {
    const found = await this.prisma.orderDayChange.aggregate({
      where: { serviceDay: day },
      _max: { id: true },
    });
    return found._max.id === null ? 0 : Number(found._max.id);
  }
}
