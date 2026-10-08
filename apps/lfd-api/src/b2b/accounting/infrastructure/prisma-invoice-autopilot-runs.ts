import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  InvoiceAutopilotRuns,
  type InvoiceAutopilotOutcome,
  type SettledInvoiceAutopilotOutcome,
} from "../domain/ports/invoice-autopilot-runs.js";

/**
 * Les tentatives de la facture du mois automatique, dans
 * `public.invoice_autopilot_run` — `createMany … skipDuplicates` =
 * `INSERT … ON CONFLICT DO NOTHING`, comme `PrismaCollectionAutopilotRuns`.
 */
@Injectable()
export class PrismaInvoiceAutopilotRuns extends InvoiceAutopilotRuns {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async attempted(legalEntityId: string, month: string): Promise<boolean> {
    const row = await this.prisma.invoiceAutopilotRun.findUnique({
      where: { legalEntityId_month: { legalEntityId, month } },
      select: { legalEntityId: true },
    });
    return row !== null;
  }

  async claim(legalEntityId: string, month: string, at: Date): Promise<boolean> {
    const pending: InvoiceAutopilotOutcome = "pending";
    const { count } = await this.prisma.invoiceAutopilotRun.createMany({
      data: [{ legalEntityId, month, ranAt: at, outcome: pending }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async settle(
    legalEntityId: string,
    month: string,
    outcome: SettledInvoiceAutopilotOutcome,
    message: string | null,
  ): Promise<void> {
    await this.prisma.invoiceAutopilotRun.update({
      where: { legalEntityId_month: { legalEntityId, month } },
      data: { outcome, message },
    });
  }
}
