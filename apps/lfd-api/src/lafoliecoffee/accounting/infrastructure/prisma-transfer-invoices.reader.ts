import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CREDIT_NOTE } from "../domain/entities/invoice.types.js";
import type { TransferInvoice } from "../domain/entities/received-bank-transfer.js";
import { TransferInvoicesReader } from "../domain/ports/transfer-invoices.reader.js";
import { invoicePaymentMeansSchema } from "./invoice-json.schema.js";
import { invoicePayerName } from "./invoice-payer-name.js";

/**
 * Les factures qu'un virement va régler, en UNE requête : la pièce, ses bons
 * dans l'ordre, et le virement qui la règle déjà. Tables de la comptabilité.
 */
@Injectable()
export class PrismaTransferInvoicesReader extends TransferInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofIds(invoiceIds: readonly string[]): Promise<readonly TransferInvoice[]> {
    if (invoiceIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.invoice.findMany({
      where: { id: { in: [...invoiceIds] } },
      select: {
        id: true,
        number: true,
        type: true,
        legalEntityId: true,
        payerCompanyId: true,
        buyer: true,
        paymentMeans: true,
        totalTtcCents: true,
        prepaidCents: true,
        orders: { select: { orderId: true }, orderBy: { position: "asc" } },
        bankTransfer: { select: { transferId: true } },
      },
    });
    return rows.map((row) => ({
      invoiceId: row.id,
      number: row.number,
      legalEntityId: row.legalEntityId,
      payerCompanyId: row.payerCompanyId,
      payerName: invoicePayerName(row.id, row.buyer),
      paymentMeansCode: invoicePaymentMeansSchema.safeParse(row.paymentMeans).data?.code ?? null,
      isCreditNote: row.type === CREDIT_NOTE,
      remainingCents: row.totalTtcCents - (row.prepaidCents ?? 0),
      settledByTransferId: row.bankTransfer?.transferId ?? null,
      orderIds: row.orders.map((order) => order.orderId),
    }));
  }
}
