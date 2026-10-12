import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import { previousClosureOf } from "../domain/services/invoicing-closures.js";
import { modeTimelinesOf } from "./billing-mode.mapper.js";
import { MODE_DATES_SELECT } from "./prisma-billing-mode-dates.reader.js";

/**
 * La période de l'issue `issued` de la facture par période — une seule par
 * facture (`invoice_id` unique) : sa clôture rangée, et la clôture qui la
 * précède sous le rythme de son entité (R5) — en M1, le mode mensuel.
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
        legalEntity: {
          select: {
            // ⚠️ M1 : la timeline du mode MENSUEL (adaptateur de transition,
            // `BillingRhythmReader`) — M4 lira la période du payeur.
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
        const startsAt = previousClosureOf(
          closesAt,
          modeTimelinesOf(row.legalEntity.billingModeDates).monthly,
        );
        return [[row.invoiceId, { startsAt, closesAt }] as const];
      }),
    );
  }
}
