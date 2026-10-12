import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import { periodMonthOf } from "../domain/services/invoicing-closures.js";

/**
 * Le mois de l'issue `issued` de la facture par période — une seule par facture
 * (`invoice_id` unique) : celui où s'achève la période (R3, `periodMonthOf`).
 */
@Injectable()
export class PrismaInvoicePeriodsReader extends InvoicePeriodsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async periodsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (invoiceIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.invoiceMonthlyOutcome.findMany({
      where: { invoiceId: { in: [...invoiceIds] } },
      select: { invoiceId: true, periodClosesAt: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.invoiceId === null ? [] : [[row.invoiceId, periodMonthOf(row.periodClosesAt)] as const],
      ),
    );
  }
}
