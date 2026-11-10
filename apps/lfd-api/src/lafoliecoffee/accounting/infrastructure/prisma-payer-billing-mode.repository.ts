import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PayerBillingModeHistory,
  type NamedPayer,
} from "../domain/entities/payer-billing-mode-history.js";
import { PayerBillingModeRepository } from "../domain/ports/payer-billing-mode.repository.js";
import { payerModeEntryOf } from "./billing-mode.mapper.js";

/**
 * Adaptateur d'écriture de `payer_billing_mode` — APPEND-ONLY, même régime que
 * `billing_mode_dates` : insertion des segments neufs, pose des annulations.
 */
@Injectable()
export class PrismaPayerBillingModeRepository extends PayerBillingModeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(legalEntityId: string, payer: NamedPayer): Promise<PayerBillingModeHistory> {
    const rows = await this.prisma.payerBillingMode.findMany({
      where: { legalEntityId, payerCompanyId: payer.id },
      orderBy: { effectiveFrom: "asc" },
    });
    return PayerBillingModeHistory.reconstitute(legalEntityId, payer, rows.map(payerModeEntryOf));
  }

  async save(history: PayerBillingModeHistory): Promise<void> {
    const record = history.toPersistence();
    const fresh = record.entries.filter((entry) => record.freshIds.includes(entry.id));
    if (fresh.length > 0) {
      await this.prisma.payerBillingMode.createMany({
        data: fresh.map((entry) => ({
          id: entry.id,
          legalEntityId: record.legalEntityId,
          payerCompanyId: record.payerCompanyId,
          effectiveFrom: entry.effectiveFrom,
          mode: entry.mode,
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
      await this.prisma.payerBillingMode.updateMany({
        where: { id: entry.id, cancelledAt: null },
        data: { cancelledAt: entry.cancelledAt, cancelledByStaffId: entry.cancelledByStaffId },
      });
    }
  }
}
