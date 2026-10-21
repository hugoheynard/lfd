import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ResupplyReceptions } from "../domain/resupply-receptions.js";
import type { SiteResupplyTrace } from "../domain/site-resupply.js";

/** La réception d'un réassort, lue dans `resupply_receipt` — écrite seulement une fois reçu. */
@Injectable()
export class PrismaResupplyReceptions extends ResupplyReceptions {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async receptionOf(siteId: string, resupplyId: string): Promise<SiteResupplyTrace | null> {
    // Le point est dans le `where` : c'est le mur par point.
    const row = await this.prisma.resupplyReceipt.findFirst({
      where: { resupplyId, siteId },
      select: {
        receivedAt: true,
        receivedByStaffId: true,
        receivedByName: true,
        receivedByRole: true,
      },
    });
    return row === null
      ? null
      : {
          at: row.receivedAt,
          author: {
            staffUserId: row.receivedByStaffId,
            name: row.receivedByName,
            role: row.receivedByRole,
          },
        };
  }
}
