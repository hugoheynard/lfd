import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { OrderRevisionNoticesReader } from "../domain/ports/order-revision-notices.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** Le repère d'une journée : `max(id)`, par l'index `(service_day, id)`. */
@Injectable()
export class PrismaOrderRevisionNoticesReader extends OrderRevisionNoticesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async markerOf(day: ServiceDay): Promise<number | null> {
    const found = await this.prisma.orderRevisionNotice.aggregate({
      where: { serviceDay: day.value },
      _max: { id: true },
    });
    return found._max.id;
  }
}
