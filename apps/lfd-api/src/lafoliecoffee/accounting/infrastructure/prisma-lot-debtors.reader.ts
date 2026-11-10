import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { LotDebtorsReader } from "../domain/ports/lot-debtors.reader.js";
import type { LotDebtorLine } from "../domain/services/lot-debtor-bank-standing.js";

/** Les lignes des lots, par lot puis par rang — l'entité est dans le `where`. */
@Injectable()
export class PrismaLotDebtorsReader extends LotDebtorsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofBatches(
    legalEntityId: string,
    batchIds: readonly string[],
  ): Promise<readonly LotDebtorLine[]> {
    if (batchIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.collectionBatchLine.findMany({
      where: { batchId: { in: [...batchIds] }, batch: { legalEntityId } },
      orderBy: [{ batchId: "asc" }, { rank: "asc" }],
      select: {
        batchId: true,
        mandateId: true,
        mandateReference: true,
        debtorName: true,
        batch: { select: { scheme: true } },
      },
    });
    return rows.map((row) => ({
      batchId: row.batchId,
      scheme: row.batch.scheme,
      mandateId: row.mandateId,
      mandateReference: row.mandateReference,
      debtorName: row.debtorName,
    }));
  }
}
