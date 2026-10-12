import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoicedClosuresReader } from "../domain/ports/invoiced-closures.reader.js";

/** Lit `public.invoice_autopilot_run` par sa clé (entité, clôture). */
@Injectable()
export class PrismaInvoicedClosuresReader extends InvoicedClosuresReader {
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
}
