import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ClosureBatchesReader,
  type ClosureBatchRead,
} from "../domain/ports/closure-batches.reader.js";
import { periodLabelOf } from "../domain/services/invoicing-closures.js";

/** Les lots par clôture : un résumé, sans le fichier ni les avis. */
@Injectable()
export class PrismaClosureBatchesReader extends ClosureBatchesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofClosures(
    legalEntityId: string,
    closures: readonly Date[],
  ): Promise<readonly ClosureBatchRead[]> {
    const rows = await this.prisma.collectionBatch.findMany({
      where: { legalEntityId, cycleClosesAt: { in: [...closures] } },
      orderBy: [{ constitutedAt: "asc" }, { scheme: "asc" }],
      select: {
        id: true,
        scheme: true,
        status: true,
        cycleStartsAt: true,
        cycleClosesAt: true,
        lines: { select: { amountCents: true } },
      },
    });
    return rows.map((row) => ({
      closesAt: row.cycleClosesAt,
      batch: {
        batchId: row.id,
        scheme: row.scheme,
        status: row.status,
        periodLabel: periodLabelOf({ startsAt: row.cycleStartsAt, closesAt: row.cycleClosesAt }),
        lineCount: row.lines.length,
        totalCents: row.lines.reduce((sum, line) => sum + line.amountCents, 0),
      },
    }));
  }
}
