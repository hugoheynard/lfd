import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerCollectionMeansReader } from "../domain/ports/payer-collection-means.reader.js";
import { PayersCollectionMeansReader } from "../domain/ports/payers-collection-means.reader.js";
import type { PayerMeansEntry } from "../domain/services/collection-means-timeline.js";
import { payerMeansEntryOf } from "./collection-means.mapper.js";

/**
 * Adaptateur de lecture de `payer_collection_means` — un payeur (la fiche),
 * ou plusieurs d'une entité en une requête (l'émission, le lot, le compte
 * des clients). Deux ports, un adaptateur lié par `useExisting`.
 */
@Injectable()
export class PrismaPayerCollectionMeansReader
  extends PayerCollectionMeansReader
  implements PayersCollectionMeansReader
{
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

  async entriesOfPayers(
    legalEntityId: string,
    payerCompanyIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly PayerMeansEntry[]>> {
    if (payerCompanyIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.payerCollectionMeans.findMany({
      where: { legalEntityId, payerCompanyId: { in: [...payerCompanyIds] } },
      orderBy: { effectiveFrom: "asc" },
    });
    const byPayer = new Map<string, PayerMeansEntry[]>();
    for (const row of rows) {
      byPayer.set(row.payerCompanyId, [
        ...(byPayer.get(row.payerCompanyId) ?? []),
        payerMeansEntryOf(row),
      ]);
    }
    return byPayer;
  }
}
