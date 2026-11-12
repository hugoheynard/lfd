import {
  ReceivedBankTransfer,
  type TransferInvoice,
} from "../../../domain/entities/received-bank-transfer.js";
import { OrderInvoicingLock } from "../../../domain/ports/order-invoicing-lock.js";
import { ReceivedBankTransferRepository } from "../../../domain/ports/received-bank-transfer.repository.js";
import { TransferInvoicesReader } from "../../../domain/ports/transfer-invoices.reader.js";

/** Les virements ajoutés, et dans quelle transaction. */
export class MemoryReceivedTransfers extends ReceivedBankTransferRepository {
  readonly added: ReceivedBankTransfer[] = [];
  constructor(private readonly log: string[]) {
    super();
  }
  add(transfer: ReceivedBankTransfer): Promise<void> {
    this.log.push(`transfer:add:${transfer.id}`);
    this.added.push(transfer);
    return Promise.resolve();
  }
  /** Le virement qui règle une facture, comme l'unicité de `invoice_id` le rend. */
  settling(invoiceId: string): string | null {
    const found = this.added.find((transfer) =>
      transfer.toState().invoices.some((invoice) => invoice.invoiceId === invoiceId),
    );
    return found?.id ?? null;
  }
}

/** Les factures connues ; « déjà réglée » se relit sur les virements ajoutés. */
export class StoreTransferInvoices extends TransferInvoicesReader {
  constructor(
    private readonly invoices: readonly TransferInvoice[],
    private readonly transfers: MemoryReceivedTransfers,
  ) {
    super();
  }
  ofIds(invoiceIds: readonly string[]): Promise<readonly TransferInvoice[]> {
    return Promise.resolve(
      this.invoices
        .filter((invoice) => invoiceIds.includes(invoice.invoiceId))
        .map((invoice) => ({
          ...invoice,
          settledByTransferId: this.transfers.settling(invoice.invoiceId),
        })),
    );
  }
}

/** Le verrou des bons : il note chaque id, dans l'ordre reçu. */
export class LoggingInvoicingLock extends OrderInvoicingLock {
  constructor(private readonly log: string[]) {
    super();
  }
  lock(orderId: string): Promise<void> {
    this.log.push(`lock:${orderId}`);
    return Promise.resolve();
  }
}
