import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionHandoffReader } from "../domain/ports/production-handoff.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** L'adaptateur Prisma de la lecture des remises — les remises, pas les retours. */
@Injectable()
export class PrismaProductionHandoffReader extends ProductionHandoffReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async handedAmong(
    day: ServiceDay,
    batchIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    if (batchIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.productionHandoff.findMany({
      where: { serviceDay: day.value, id: { in: [...batchIds] }, quantity: { gt: 0 } },
      select: { id: true, quantity: true },
    });
    return new Map(rows.map((row) => [row.id, row.quantity]));
  }
}
