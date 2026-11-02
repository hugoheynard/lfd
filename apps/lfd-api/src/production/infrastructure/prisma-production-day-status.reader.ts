import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { LaunchedResupplyLookup } from "../domain/ports/launched-resupply.lookup.js";
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

/**
 * Une ligne par l'unicité `(service_day, resupply_id)`. « Lancé » se lit sur
 * `launched_at` : le CHECK `production_resupply_asap_launched` le réserve aux
 * réassorts « au plus tôt », et un réassort du soir ne l'a jamais.
 */
@Injectable()
export class PrismaLaunchedResupplyLookup extends LaunchedResupplyLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isLaunched(day: ServiceDay, resupplyId: string): Promise<boolean> {
    const row = await this.prisma.productionResupply.findUnique({
      where: { serviceDay_resupplyId: { serviceDay: day.value, resupplyId } },
      select: { launchedAt: true },
    });
    return row !== null && row.launchedAt !== null;
  }
}
