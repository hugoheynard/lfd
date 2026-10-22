import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BatchedMandatesReader } from "../domain/ports/batched-mandates.reader.js";

/** Les mandats qu'une ligne d'un lot non annulé porte. */
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
      where: { mandateId: { in: [...mandateIds] }, batch: { status: { not: "cancelled" } } },
      select: { mandateId: true },
      distinct: ["mandateId"],
    });
    return new Set(rows.map((row) => row.mandateId));
  }
}
