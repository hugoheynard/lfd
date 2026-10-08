import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Invoice } from "../domain/entities/invoice.js";
import { CompanyInvoicesReader } from "../domain/ports/company-invoices.reader.js";
import { INVOICE_ROW_INCLUDE, toInvoice } from "./invoice.mapper.js";

/**
 * Le mur de « Mes factures » : `payer_company_id` = la société, OU un bon de
 * la pièce (`invoice_order`) passé par elle (`orders.company_id`). Tables du
 * même bloc `b2b` (comme `PrismaInvoiceSiteContactsReader`), en lecture.
 */
@Injectable()
export class PrismaCompanyInvoicesReader extends CompanyInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async visibleTo(companyId: string): Promise<readonly Invoice[]> {
    const covering = await this.coveringOrdersOf(companyId, null);
    const rows = await this.prisma.invoice.findMany({
      where: { OR: [{ payerCompanyId: companyId }, { id: { in: [...covering] } }] },
      include: INVOICE_ROW_INCLUDE,
      orderBy: [{ year: "asc" }, { rank: "asc" }],
    });
    return rows.map(toInvoice);
  }

  async oneVisibleTo(invoiceId: string, companyId: string): Promise<Invoice | null> {
    const covering = await this.coveringOrdersOf(companyId, invoiceId);
    const row = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        OR: [{ payerCompanyId: companyId }, { id: { in: [...covering] } }],
      },
      include: INVOICE_ROW_INCLUDE,
    });
    return row === null ? null : toInvoice(row);
  }

  /** Les pièces qui portent au moins un bon de la société (une seule si `invoiceId`). */
  private async coveringOrdersOf(
    companyId: string,
    invoiceId: string | null,
  ): Promise<readonly string[]> {
    const rows = await this.prisma.$queryRaw<readonly { readonly invoice_id: string }[]>`
      SELECT DISTINCT io."invoice_id"
        FROM "public"."invoice_order" io
        JOIN "public"."orders" o ON o."id" = io."order_id"
       WHERE o."company_id" = ${companyId}
         AND (${invoiceId}::text IS NULL OR io."invoice_id" = ${invoiceId})`;
    return rows.map((row) => row.invoice_id);
  }
}
