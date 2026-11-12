import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoiceTransferSettlementReader } from "../domain/ports/invoice-transfer-settlement.reader.js";

/**
 * Lit `received_bank_transfer_invoice` par sa clé unique `invoice_id` (une
 * facture n'est réglée que par un virement) et le jour de son virement.
 */
@Injectable()
export class PrismaInvoiceTransferSettlementReader extends InvoiceTransferSettlementReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async receivedOnOf(invoiceId: string): Promise<string | null> {
    const row = await this.prisma.receivedBankTransferInvoice.findUnique({
      where: { invoiceId },
      select: { transfer: { select: { receivedOn: true } } },
    });
    return row === null ? null : row.transfer.receivedOn.toISOString().slice(0, 10);
  }
}
