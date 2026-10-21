import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  PackingResupplyListing,
  type ResupplyToDraw,
} from "../domain/ports/packing-resupply-listing.js";

/**
 * L'adaptateur Prisma de la liste des fiches de réassort (lot R3b). Il tourne
 * dans l'unité de travail que la garde du relais ouvre pour le fait.
 *
 * 🔴 **Le retrait est un effacement, délibéré** — même raison que
 * `PrismaPackingListWithdrawal` : ces lignes ne sont que l'inscription posée
 * par le tirage du fournil, que la réouverture défait. Seules les fiches
 * intouchées partent ; aucune ne porte de geste.
 */
@Injectable()
export class PrismaPackingResupplyListing extends PackingResupplyListing {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async draw(resupply: ResupplyToDraw): Promise<void> {
    const key = { serviceDay: resupply.serviceDay, resupplyId: resupply.resupplyId };
    await this.prisma.packingResupply.createMany({
      data: [
        {
          ...key,
          siteId: resupply.siteId,
          siteLabel: resupply.siteLabel,
          name: resupply.name,
          drawnAt: resupply.drawnAt,
        },
      ],
      skipDuplicates: true,
    });
    await this.prisma.packingResupplyLine.createMany({
      data: resupply.lines.map((line) => ({ ...key, ...line })),
      skipDuplicates: true,
    });
  }

  async withdrawUntouched(serviceDay: string, resupplyIds: readonly string[]): Promise<number> {
    if (resupplyIds.length === 0) {
      return 0;
    }
    const untouched = await this.prisma.packingResupply.findMany({
      where: {
        serviceDay,
        resupplyId: { in: [...resupplyIds] },
        closedAt: null,
        lines: { none: { packed: { not: null } } },
      },
      select: { resupplyId: true },
    });
    const ids = untouched.map((row) => row.resupplyId);
    if (ids.length === 0) {
      return 0;
    }
    await this.prisma.packingResupplyLine.deleteMany({
      where: { serviceDay, resupplyId: { in: ids } },
    });
    const { count } = await this.prisma.packingResupply.deleteMany({
      where: { serviceDay, resupplyId: { in: ids } },
    });
    return count;
  }
}
