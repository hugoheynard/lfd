import type { StoredSiteView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SiteReader } from "../domain/site.reader.js";
import { SITE_SELECT, toSiteView } from "./site-row.js";

/** Adaptateur Prisma de la lecture des sites — archivés compris, à la fin. */
@Injectable()
export class PrismaSiteReader extends SiteReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly StoredSiteView[]> {
    const rows = await this.prisma.site.findMany({
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      select: SITE_SELECT,
    });
    return rows.map(toSiteView);
  }

  async get(id: string): Promise<StoredSiteView | null> {
    const row = await this.prisma.site.findUnique({ where: { id }, select: SITE_SELECT });
    return row === null ? null : toSiteView(row);
  }
}
