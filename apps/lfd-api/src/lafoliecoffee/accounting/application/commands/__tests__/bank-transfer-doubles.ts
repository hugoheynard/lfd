import {
  BankTransfers,
  type RecordedTransferView,
  type TransferAllocationView,
  type TransferToRecord,
} from "../../../../../payment/channels/requests/index.js";
import {
  type MovementSubject,
  movementSubjectKey,
} from "../../../../../payment/channels/subjects/index.js";
import type { TransferInvoice } from "../../../domain/entities/received-bank-transfer.js";
import { OrderInvoicingLock } from "../../../domain/ports/order-invoicing-lock.js";
import { TransferInvoicesReader } from "../../../domain/ports/transfer-invoices.reader.js";

/**
 * Le bloc `payment` vu par la facturation : il garde les virements reçus, et
 * tient le contrat du canal — une répartition fausse (somme des parts ≠
 * montant, sujet cité deux fois, part non positive) ou un sujet déjà réglé
 * est refusé, comme le bloc le ferait. `refuseNext` simule un refus du bloc.
 */
export class MemoryBankTransfers extends BankTransfers {
  readonly recorded: TransferToRecord[] = [];
  refuseNext: Error | null = null;
  constructor(private readonly log: string[]) {
    super();
  }
  record(transfer: TransferToRecord): Promise<void> {
    const refusal = this.refuseNext ?? contractBreach(transfer, this.recorded);
    this.refuseNext = null;
    if (refusal !== null) {
      return Promise.reject(refusal);
    }
    this.log.push(`transfer:record:${transfer.id}`);
    this.recorded.push(transfer);
    return Promise.resolve();
  }
  allocationsOf(
    subjects: readonly MovementSubject[],
  ): Promise<ReadonlyMap<string, TransferAllocationView>> {
    const wanted = new Set(subjects.map(movementSubjectKey));
    const found = new Map<string, TransferAllocationView>();
    for (const transfer of this.recorded) {
      for (const part of transfer.parts) {
        const key = movementSubjectKey(part.subject);
        if (wanted.has(key)) {
          found.set(key, {
            transferId: transfer.id,
            subject: part.subject,
            amountCents: part.amountCents,
            receivedOn: transfer.receivedOn,
          });
        }
      }
    }
    return Promise.resolve(found);
  }
  recordedSince(since: Date): Promise<readonly RecordedTransferView[]> {
    return Promise.resolve(
      this.recorded
        .filter((transfer) => transfer.recordedAt >= since)
        .map((transfer) => ({
          id: transfer.id,
          receivedInto: transfer.receivedInto,
          payerRef: transfer.payerRef,
          amountCents: transfer.amountCents,
          receivedOn: transfer.receivedOn,
          recordedAt: transfer.recordedAt,
          parts: transfer.parts,
        })),
    );
  }
  /** Le virement qui règle une facture, comme l'unique `(subject_type, subject_id)` le rend. */
  settling(invoiceId: string): string | null {
    const found = this.recorded.find((transfer) =>
      transfer.parts.some((part) => part.subject.id === invoiceId),
    );
    return found?.id ?? null;
  }
}

/** Ce que le canal promet de refuser, réécrit ici : un double qui l'oublierait mentirait. */
function contractBreach(
  transfer: TransferToRecord,
  recorded: readonly TransferToRecord[],
): Error | null {
  const keys = transfer.parts.map((part) => movementSubjectKey(part.subject));
  const sum = transfer.parts.reduce((total, part) => total + part.amountCents, 0);
  const taken = new Set(
    recorded.flatMap((other) => other.parts.map((part) => movementSubjectKey(part.subject))),
  );
  if (
    transfer.parts.length === 0 ||
    sum !== transfer.amountCents ||
    new Set(keys).size !== keys.length ||
    transfer.parts.some((part) => part.amountCents <= 0) ||
    keys.some((key) => taken.has(key))
  ) {
    return new RangeError(`double du bloc : répartition refusée (${transfer.id})`);
  }
  return null;
}

/** Les factures connues ; « déjà réglée » se relit sur les virements enregistrés. */
export class StoreTransferInvoices extends TransferInvoicesReader {
  constructor(
    private readonly invoices: readonly TransferInvoice[],
    private readonly transfers: MemoryBankTransfers,
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
