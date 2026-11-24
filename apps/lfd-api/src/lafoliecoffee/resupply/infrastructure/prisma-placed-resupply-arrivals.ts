import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PlacedResupplyArrivals } from "../domain/placed-resupply-arrivals.reader.js";
import { dayColumn } from "./day-column.js";

/**
 * {@link PlacedResupplyArrivals} sur `site_resupply` : la plus tôt des
 * `arrival_by` par point, sans charger les lignes. `HH:MM` à deux chiffres
 * (CHECK `site_resupply_arrival_by_clock`) : l'ordre des chaînes est celui
 * des heures.
 */
@Injectable()
export class PrismaPlacedResupplyArrivals extends PlacedResupplyArrivals {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async earliestFor(day: string, siteIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.siteResupply.groupBy({
      by: ["siteId"],
      where: {
        serviceDay: dayColumn(day),
        siteId: { in: [...siteIds] },
        target: "tomorrow",
        placedAt: { not: null },
        cancelledAt: null,
        arrivalBy: { not: null },
      },
      _min: { arrivalBy: true },
    });
    const earliest = new Map<string, string>();
    for (const row of rows) {
      if (row._min.arrivalBy !== null) {
        earliest.set(row.siteId, row._min.arrivalBy);
      }
    }
    return earliest;
  }
}
