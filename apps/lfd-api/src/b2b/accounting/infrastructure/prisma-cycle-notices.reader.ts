import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CollectionNotice } from "../domain/entities/collection-notice.js";
import { CycleNoticesReader } from "../domain/ports/cycle-notices.reader.js";
import type { CycleNotice } from "../domain/services/collection-notice-plan.js";
import { toNoticeState } from "./collection-notice.mapper.js";

/** Les avis d'un cycle, avec l'état de leur lot — lus sous le verrou de l'entité. */
@Injectable()
export class PrismaCycleNoticesReader extends CycleNoticesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofCycle(legalEntityId: string, cycleClosesAt: Date): Promise<readonly CycleNotice[]> {
    const rows = await this.prisma.collectionNotice.findMany({
      where: { legalEntityId, cycleClosesAt },
      orderBy: { id: "asc" },
      include: { batch: { select: { status: true } } },
    });
    return rows.map(({ batch, ...row }) => ({
      notice: CollectionNotice.rehydrate(toNoticeState(row)),
      batchLive: batch !== null && batch.status !== "cancelled",
    }));
  }
}
