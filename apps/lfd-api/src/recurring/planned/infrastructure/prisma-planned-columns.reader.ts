import type { PlannedColumnView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PlannedColumnsReader,
  type PlannedColumnsWindow,
} from "../domain/ports/planned-columns.reader.js";
import { plannedColumnView } from "./planned-column-row.mapper.js";

/** Les colonnes d'une société (le site), murées par la société ; les retirées n'existent plus pour l'écran. */
@Injectable()
export class PrismaPlannedColumnsReader extends PlannedColumnsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async window(window: PlannedColumnsWindow): Promise<readonly PlannedColumnView[]> {
    const rows = await this.prisma.plannedColumn.findMany({
      where: {
        companyId: window.companyId,
        serviceDay: { gte: window.from.toUtcDate(), lte: window.to.toUtcDate() },
        status: { not: "withdrawn" },
      },
      orderBy: [{ serviceDay: "asc" }, { windowStart: "asc" }, { windowEnd: "asc" }, { id: "asc" }],
    });
    return rows.map(plannedColumnView);
  }
}
