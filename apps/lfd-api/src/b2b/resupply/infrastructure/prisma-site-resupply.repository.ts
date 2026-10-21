import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SiteResupply } from "../domain/site-resupply.js";
import {
  DraftResupplyNotPersistableError,
  SiteResupplyChangedMeanwhileError,
} from "../domain/site-resupply-errors.js";
import { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import { dayColumn, SITE_RESUPPLY_LINES, snapshotOf } from "./site-resupply.row.js";

/**
 * Adaptateur Prisma du réassort (`site_resupply` + ses lignes). Un réassort
 * neuf s'écrit avec ses lignes, qui ne changent plus ; ensuite seule
 * l'annulation s'écrit, sous le verrou de la version lue. Rien ne se supprime.
 */
@Injectable()
export class PrismaSiteResupplyRepository extends SiteResupplyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(siteId: string, resupplyId: string): Promise<SiteResupply | null> {
    // Le point est dans le `where` : c'est le mur par point.
    const row = await this.prisma.siteResupply.findFirst({
      where: { id: resupplyId, siteId },
      include: { lines: SITE_RESUPPLY_LINES },
    });
    return row === null ? null : SiteResupply.restore(snapshotOf(row));
  }

  async save(resupply: SiteResupply): Promise<void> {
    const placed = resupply.placed;
    if (placed === null) {
      throw new DraftResupplyNotPersistableError();
    }
    if (resupply.version === 0) {
      await this.prisma.siteResupply.create({
        data: {
          id: resupply.id,
          siteId: resupply.siteId,
          target: resupply.target,
          serviceDay: dayColumn(resupply.serviceDay),
          placedAt: placed.at,
          placedByStaffId: placed.author.staffUserId,
          placedByName: placed.author.name,
          placedByRole: placed.author.role,
          lines: {
            create: resupply.lines.map((line, position) => ({
              sku: line.sku,
              label: line.label,
              quantity: line.quantity,
              position,
            })),
          },
        },
      });
      return;
    }
    await this.saveCancellation(resupply);
  }

  private async saveCancellation(resupply: SiteResupply): Promise<void> {
    const cancelled = resupply.cancelled;
    if (cancelled === null) {
      return;
    }
    const { count } = await this.prisma.siteResupply.updateMany({
      where: { id: resupply.id, siteId: resupply.siteId, version: resupply.version },
      data: {
        version: resupply.version + 1,
        cancelledAt: cancelled.at,
        cancelledByStaffId: cancelled.author.staffUserId,
        cancelledByName: cancelled.author.name,
        cancelledByRole: cancelled.author.role,
      },
    });
    if (count === 0) {
      throw new SiteResupplyChangedMeanwhileError();
    }
  }
}
