import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type SiteResupplyPlanKey,
  SiteResupplyPlanKeyReader,
} from "../domain/site-resupply-plan-key.reader.js";
import { resupplyTargetOf } from "../domain/site-resupply-snapshot.js";
import { serviceDayOfColumn } from "./day-column.js";

/** Lecture Prisma de la clé de plan d'un réassort — deux colonnes, par la clé primaire. */
@Injectable()
export class PrismaSiteResupplyPlanKeyReader extends SiteResupplyPlanKeyReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async keyOf(siteId: string, resupplyId: string): Promise<SiteResupplyPlanKey | null> {
    const row = await this.prisma.siteResupply.findFirst({
      where: { id: resupplyId, siteId },
      select: { target: true, serviceDay: true },
    });
    return row === null
      ? null
      : { target: resupplyTargetOf(row.target), serviceDay: serviceDayOfColumn(row.serviceDay) };
  }
}
