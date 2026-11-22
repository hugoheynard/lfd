import { Injectable } from "@nestjs/common";

import { BankTransfers } from "../../../payment/channels/requests/index.js";
import { movementSubjectKey } from "../../../payment/channels/subjects/index.js";
import { INVOICE_PAYMENT_SUBJECT } from "../domain/entities/invoice.types.js";
import { InvoiceTransferSettlementReader } from "../domain/ports/invoice-transfer-settlement.reader.js";

/**
 * Le jour du virement qui règle une facture, demandé au bloc `payment`
 * (`BankTransfers.allocationsOf`) : la facture y est un sujet `invoice`, et
 * un sujet n'est réglé que par un virement.
 */
@Injectable()
export class PaymentInvoiceTransferSettlementReader extends InvoiceTransferSettlementReader {
  constructor(private readonly bankTransfers: BankTransfers) {
    super();
  }

  async receivedOnOf(invoiceId: string): Promise<string | null> {
    const subject = { type: INVOICE_PAYMENT_SUBJECT, id: invoiceId };
    const allocations = await this.bankTransfers.allocationsOf([subject]);
    return allocations.get(movementSubjectKey(subject))?.receivedOn ?? null;
  }
}
