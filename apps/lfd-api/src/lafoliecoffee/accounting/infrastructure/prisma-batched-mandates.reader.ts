import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BatchedMandatesReader } from "../domain/ports/batched-mandates.reader.js";
import { LIVE_BATCH_STATUS } from "./live-batch-status.js";

/** Les mandats qu'une ligne d'un lot vivant (ni annulé, ni rejeté) porte. */
@Injectable()
export class PrismaBatchedMandatesReader extends BatchedMandatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async batched(mandateIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (mandateIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.collectionBatchLine.findMany({
      where: { mandateId: { in: [...mandateIds] }, batch: { status: LIVE_BATCH_STATUS } },
      select: { mandateId: true },
      distinct: ["mandateId"],
    });
    return new Set(rows.map((row) => row.mandateId));
  }
}
