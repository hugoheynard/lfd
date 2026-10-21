import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplySites } from "../domain/resupply-sites.js";

/** Les points de retrait (`pickup_addresses`) : existe et n'est pas archivé. */
@Injectable()
export class PrismaResupplySites extends ResupplySites {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async exists(siteId: string): Promise<boolean> {
    const count = await this.prisma.site.count({ where: { id: siteId, archivedAt: null } });
    return count > 0;
  }
}
