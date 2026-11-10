import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BillingModeDatesHistory } from "../domain/entities/billing-mode-dates-history.js";
import { BillingModeDatesRepository } from "../domain/ports/billing-mode-dates.repository.js";
import type { BillingMode } from "../domain/value-objects/billing-mode.js";
import { modeDatesEntryOf } from "./billing-mode.mapper.js";

/**
 * Adaptateur d'écriture de `billing_mode_dates` — APPEND-ONLY : `save` insère
 * les segments neufs et pose les annulations, rien d'autre. Un déclencheur
 * refuse en base tout autre UPDATE et tout DELETE ; l'index unique partiel
 * tranche deux gestes simultanés (le second échoue au lieu de doubler).
 */
@Injectable()
export class PrismaBillingModeDatesRepository extends BillingModeDatesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(legalEntityId: string, mode: BillingMode): Promise<BillingModeDatesHistory> {
    const rows = await this.prisma.billingModeDates.findMany({
      where: { legalEntityId, mode },
      orderBy: { effectiveFrom: "asc" },
    });
    return BillingModeDatesHistory.reconstitute(legalEntityId, mode, rows.map(modeDatesEntryOf));
  }

  async save(history: BillingModeDatesHistory): Promise<void> {
    const record = history.toPersistence();
    const fresh = record.entries.filter((entry) => record.freshIds.includes(entry.id));
    if (fresh.length > 0) {
      await this.prisma.billingModeDates.createMany({
        data: fresh.map((entry) => ({
          id: entry.id,
          legalEntityId: record.legalEntityId,
          mode: record.mode,
          effectiveFrom: entry.effectiveFrom,
          days: [...entry.rhythm.days],
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
      // Sous condition : une annulation déjà posée ne se repose pas (le déclencheur refuserait).
      await this.prisma.billingModeDates.updateMany({
        where: { id: entry.id, cancelledAt: null },
        data: { cancelledAt: entry.cancelledAt, cancelledByStaffId: entry.cancelledByStaffId },
      });
    }
  }
}
