import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Invoice } from "../domain/entities/invoice.js";
import { InvoiceReader } from "../domain/ports/invoice.reader.js";
import { INVOICE_ROW_INCLUDE, toInvoice } from "./invoice.mapper.js";

/** Relit les factures émises par `Invoice.restore` — aucun montant recalculé. */
@Injectable()
export class PrismaInvoiceReader extends InvoiceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async byId(invoiceId: string): Promise<Invoice | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: INVOICE_ROW_INCLUDE,
    });
    return row === null ? null : toInvoice(row);
  }

  async byPayer(payerCompanyId: string): Promise<readonly Invoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { payerCompanyId },
      include: INVOICE_ROW_INCLUDE,
      orderBy: [{ year: "asc" }, { rank: "asc" }],
    });
    return rows.map(toInvoice);
  }

  async byEntityAndYear(legalEntityId: string, year: number): Promise<readonly Invoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { legalEntityId, year },
      include: INVOICE_ROW_INCLUDE,
      orderBy: { rank: "asc" },
    });
    return rows.map(toInvoice);
  }
}
