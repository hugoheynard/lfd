import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { NamedPayer } from "../domain/entities/payer-billing-mode-history.js";
import { PayerCollectionMeansHistory } from "../domain/entities/payer-collection-means-history.js";
import { PayerCollectionMeansRepository } from "../domain/ports/payer-collection-means.repository.js";
import { payerMeansEntryOf } from "./collection-means.mapper.js";

/**
 * Adaptateur d'écriture de `payer_collection_means` — APPEND-ONLY, même régime
 * que `payer_billing_mode` : insertion des segments neufs, pose des annulations.
 */
@Injectable()
export class PrismaPayerCollectionMeansRepository extends PayerCollectionMeansRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(legalEntityId: string, payer: NamedPayer): Promise<PayerCollectionMeansHistory> {
    const rows = await this.prisma.payerCollectionMeans.findMany({
      where: { legalEntityId, payerCompanyId: payer.id },
      orderBy: { effectiveFrom: "asc" },
    });
    return PayerCollectionMeansHistory.reconstitute(
      legalEntityId,
      payer,
      rows.map(payerMeansEntryOf),
    );
  }

  async save(history: PayerCollectionMeansHistory): Promise<void> {
    const record = history.toPersistence();
    const fresh = record.entries.filter((entry) => record.freshIds.includes(entry.id));
    if (fresh.length > 0) {
      await this.prisma.payerCollectionMeans.createMany({
        data: fresh.map((entry) => ({
          id: entry.id,
          legalEntityId: record.legalEntityId,
          payerCompanyId: record.payerCompanyId,
          effectiveFrom: entry.effectiveFrom,
          means: entry.means,
          reason: entry.reason,
          createdAt: entry.createdAt,
          createdByStaffId: entry.createdByStaffId,
          cancelledAt: entry.cancelledAt,
          cancelledByStaffId: entry.cancelledByStaffId,
        })),
      });
    }
    for (const entry of record.entries) {
      if (!record.cancelledIds.includes(entry.id) || entry.cancelledAt === null) {
        continue;
      }
      await this.prisma.payerCollectionMeans.updateMany({
        where: { id: entry.id, cancelledAt: null },
        data: { cancelledAt: entry.cancelledAt, cancelledByStaffId: entry.cancelledByStaffId },
      });
    }
  }
}
