import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CollectionNoticeStatus } from "../domain/entities/collection-notice.js";
import { BatchNoticeStatesReader } from "../domain/ports/batch-notice-states.reader.js";

/** L'état de l'avis de chaque ligne d'un lot, lu dans la transaction du dépôt. */
@Injectable()
export class PrismaBatchNoticeStatesReader extends BatchNoticeStatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofBatch(batchId: string): Promise<ReadonlyMap<number, CollectionNoticeStatus>> {
    const rows = await this.prisma.collectionNotice.findMany({
      where: { batchId },
      select: { lineRank: true, status: true },
    });
    return new Map(
      rows.flatMap((row) => (row.lineRank === null ? [] : [[row.lineRank, row.status] as const])),
    );
  }
}
