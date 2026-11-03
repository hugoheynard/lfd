import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDayStatusReader } from "../domain/ports/production-day-status.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** `closed_at` seul, par la clé primaire. Une journée sans ligne est ouverte. */
@Injectable()
export class PrismaProductionDayStatusReader extends ProductionDayStatusReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isClosed(day: ServiceDay): Promise<boolean> {
    const row = await this.prisma.productionDay.findUnique({
      where: { serviceDay: day.value },
      select: { closedAt: true },
    });
    return row !== null && row.closedAt !== null;
  }
}
