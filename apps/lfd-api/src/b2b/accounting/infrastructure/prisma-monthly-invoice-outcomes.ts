import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MonthlyInvoiceOutcomes,
  type MonthlyInvoiceOutcomeKey,
} from "../domain/ports/monthly-invoice-outcomes.js";

/** Les deux valeurs de `invoice_monthly_outcome.outcome` (CHECK en base). */
export const ISSUED_OUTCOME = "issued";
export const BLOCKED_OUTCOME = "blocked";

/**
 * L'issue par payeur, dans `public.invoice_monthly_outcome`.
 *
 * 🔴 Le déclencheur `invoice_monthly_outcome_final` refuse de toucher une
 * issue `issued` : un refus n'écrase donc qu'un refus (`outcome = blocked`
 * dans le `where`), et une émission qui croiserait une autre émission du
 * même payeur échouerait avec sa transaction — numéro compris.
 */
@Injectable()
export class PrismaMonthlyInvoiceOutcomes extends MonthlyInvoiceOutcomes {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordIssued(key: MonthlyInvoiceOutcomeKey, invoiceId: string): Promise<void> {
    const columns = { ...this.columns(key), outcome: ISSUED_OUTCOME, invoiceId, message: null };
    await this.prisma.invoiceMonthlyOutcome.upsert({
      where: { legalEntityId_month_payerCompanyId: this.id(key) },
      create: columns,
      update: columns,
    });
  }

  async recordBlocked(key: MonthlyInvoiceOutcomeKey, message: string): Promise<void> {
    const columns = { ...this.columns(key), outcome: BLOCKED_OUTCOME, invoiceId: null, message };
    const { count } = await this.prisma.invoiceMonthlyOutcome.createMany({
      data: [columns],
      skipDuplicates: true,
    });
    if (count === 0) {
      await this.prisma.invoiceMonthlyOutcome.updateMany({
        where: { ...this.id(key), outcome: BLOCKED_OUTCOME },
        data: columns,
      });
    }
  }

  private id(key: MonthlyInvoiceOutcomeKey) {
    return {
      legalEntityId: key.legalEntityId,
      month: key.month,
      payerCompanyId: key.payerCompanyId,
    };
  }

  private columns(key: MonthlyInvoiceOutcomeKey) {
    return {
      ...this.id(key),
      payerName: key.payerName,
      unbillableOrders: [...key.unbillableOrders],
      recordedAt: key.at,
    };
  }
}
