import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  InvoiceAutopilotRuns,
  type InvoiceAutopilotOutcome,
  type SettledInvoiceAutopilotOutcome,
} from "../domain/ports/invoice-autopilot-runs.js";

/**
 * Les tentatives de la facture automatique, une par (entité, clôture), dans
 * `public.invoice_autopilot_run` — `createMany … skipDuplicates` =
 * `INSERT … ON CONFLICT DO NOTHING`, comme `PrismaCollectionAutopilotRuns`.
 */
@Injectable()
export class PrismaInvoiceAutopilotRuns extends InvoiceAutopilotRuns {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async attempted(legalEntityId: string, periodClosesAt: Date): Promise<boolean> {
    const row = await this.prisma.invoiceAutopilotRun.findUnique({
      where: { legalEntityId_periodClosesAt: { legalEntityId, periodClosesAt } },
      select: { legalEntityId: true },
    });
    return row !== null;
  }

  async lastAttempted(legalEntityId: string): Promise<Date | null> {
    const row = await this.prisma.invoiceAutopilotRun.findFirst({
      where: { legalEntityId },
      orderBy: { periodClosesAt: "desc" },
      select: { periodClosesAt: true },
    });
    return row?.periodClosesAt ?? null;
  }

  async claim(legalEntityId: string, periodClosesAt: Date, at: Date): Promise<boolean> {
    const pending: InvoiceAutopilotOutcome = "pending";
    const { count } = await this.prisma.invoiceAutopilotRun.createMany({
      data: [{ legalEntityId, periodClosesAt, ranAt: at, outcome: pending }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  async settle(
    legalEntityId: string,
    periodClosesAt: Date,
    outcome: SettledInvoiceAutopilotOutcome,
    message: string | null,
  ): Promise<void> {
    await this.prisma.invoiceAutopilotRun.update({
      where: { legalEntityId_periodClosesAt: { legalEntityId, periodClosesAt } },
      data: { outcome, message },
    });
  }
}
