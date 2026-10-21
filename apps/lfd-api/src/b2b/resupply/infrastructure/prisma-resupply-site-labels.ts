import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";

/** Le nom des points de retrait (`pickup_addresses`), archivés compris : un réassort passé reste lisible. */
@Injectable()
export class PrismaResupplySiteLabels extends ResupplySiteLabels {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async labelsOf(siteIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.site.findMany({
      where: { id: { in: [...siteIds] } },
      select: { id: true, label: true },
    });
    return new Map(rows.map((row) => [row.id, row.label]));
  }
}
