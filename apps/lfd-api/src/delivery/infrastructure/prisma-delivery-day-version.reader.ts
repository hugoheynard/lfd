import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DeliveryDayVersionReader } from "../domain/ports/delivery-day-version.reader.js";

/**
 * `max(id)` de `delivery.day_change` pour une journée — un parcours de l'index
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
    });
    // Un `bigserial` : il ne dépassera pas 2^53 avant très longtemps, et un
    // nombre JSON est ce que l'écran compare.
    return found._max.id === null ? 0 : Number(found._max.id);
  }
}
