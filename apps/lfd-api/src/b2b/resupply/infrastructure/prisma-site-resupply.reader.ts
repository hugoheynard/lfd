import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  isPlaced,
  type PlacedSiteResupplySnapshot,
  type SiteResupplySnapshot,
} from "../domain/site-resupply.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { dayColumn, SITE_RESUPPLY_LINES, snapshotOf } from "./site-resupply.row.js";

/** Lecture Prisma des réassorts, pour le comptoir et pour le fournil. */
@Injectable()
export class PrismaSiteResupplyReader extends SiteResupplyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async forSite(
    siteId: string,
    serviceDays: readonly string[],
  ): Promise<readonly SiteResupplySnapshot[]> {
    const rows = await this.prisma.siteResupply.findMany({
      where: { siteId, serviceDay: { in: serviceDays.map(dayColumn) } },
      include: { lines: SITE_RESUPPLY_LINES },
      // Les demandes en cours (sans `placed_at`) d'abord : Postgres range
      // les `NULL` en tête d'un tri descendant.
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(snapshotOf);
  }

  async placedOn(serviceDays: readonly string[]): Promise<readonly PlacedSiteResupplySnapshot[]> {
    const rows = await this.prisma.siteResupply.findMany({
      where: {
        serviceDay: { in: serviceDays.map(dayColumn) },
        placedAt: { not: null },
        cancelledAt: null,
      },
      include: { lines: SITE_RESUPPLY_LINES },
      orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(snapshotOf).filter(isPlaced);
  }
}
