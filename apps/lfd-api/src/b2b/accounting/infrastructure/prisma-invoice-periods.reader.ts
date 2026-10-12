import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import { previousClosureOf } from "../domain/services/invoicing-closures.js";
import { billingRhythmSettingOf } from "./prisma-billing-rhythm.reader.js";

/**
 * La période de l'issue `issued` de la facture par période — une seule par
 * facture (`invoice_id` unique) : sa clôture rangée, et la clôture qui la
 * précède sous le rythme de son entité (R5).
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
            billingRhythmKind: true,
            billingRhythmDays: true,
            nextBillingRhythmKind: true,
            nextBillingRhythmDays: true,
            nextBillingRhythmEffectiveAt: true,
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
        const startsAt = previousClosureOf(closesAt, billingRhythmSettingOf(row.legalEntity));
        return [[row.invoiceId, { startsAt, closesAt }] as const];
      }),
    );
  }
}
