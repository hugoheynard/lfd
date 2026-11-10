import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import { previousClosureOf } from "../domain/services/invoicing-closures.js";
import { modeTimelinesOf } from "./billing-mode.mapper.js";
import { MODE_DATES_SELECT } from "./prisma-billing-mode-dates.reader.js";

/**
 * La période de l'issue `issued` de la facture par période — une seule par
 * facture (`invoice_id` unique) : sa clôture et son début, RANGÉS à
 * l'émission depuis M4a (`period_starts_at`, la période du payeur).
 *
 * Repli pour une issue d'avant M4a (colonne NULL ; aucune en production au
 * 2026-10-12) : la clôture qui précède sous le mode MENSUEL de l'entité — ce
 * que le lecteur faisait avant, exact pour un payeur resté mensuel.
 */
@Injectable()
export class PrismaInvoicePeriodsReader extends InvoicePeriodsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async periodsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, BillingCycle>> {
    if (invoiceIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.invoiceMonthlyOutcome.findMany({
      where: { invoiceId: { in: [...invoiceIds] } },
      select: {
        invoiceId: true,
        periodClosesAt: true,
        periodStartsAt: true,
        legalEntity: {
          select: {
            // Le repli seulement — lu pour toute ligne, ignoré dès qu'elle
            // porte son début.
            billingModeDates: {
              where: { mode: "monthly", cancelledAt: null },
              select: MODE_DATES_SELECT,
            },
          },
        },
      },
    });
    return new Map(
      rows.flatMap((row) => {
        if (row.invoiceId === null) {
          return [];
        }
        const closesAt = row.periodClosesAt;
        const startsAt =
          row.periodStartsAt ??
          previousClosureOf(closesAt, modeTimelinesOf(row.legalEntity.billingModeDates).monthly);
        return [[row.invoiceId, { startsAt, closesAt }] as const];
      }),
    );
  }
}
