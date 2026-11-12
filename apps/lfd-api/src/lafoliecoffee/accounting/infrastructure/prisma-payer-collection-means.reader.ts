import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerCollectionMeansReader } from "../domain/ports/payer-collection-means.reader.js";
import type { PayerMeansEntry } from "../domain/services/collection-means-timeline.js";
import { payerMeansEntryOf } from "./collection-means.mapper.js";

/** Adaptateur de lecture de `payer_collection_means`. */
@Injectable()
export class PrismaPayerCollectionMeansReader extends PayerCollectionMeansReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async entriesOf(
    legalEntityId: string,
    payerCompanyId: string,
  ): Promise<readonly PayerMeansEntry[]> {
    const rows = await this.prisma.payerCollectionMeans.findMany({
      where: { legalEntityId, payerCompanyId },
      orderBy: { effectiveFrom: "asc" },
    });
    return rows.map(payerMeansEntryOf);
  }
}
