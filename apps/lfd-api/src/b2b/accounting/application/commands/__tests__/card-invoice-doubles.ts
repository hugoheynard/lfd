import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { Invoice } from "../../../domain/entities/invoice.js";
import { SELLER_FACTS } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { InvoiceIssuedBeforePreviousError } from "../../../domain/errors/invoice-errors.js";
import {
  CardInvoiceOutcomes,
  type CardInvoiceOutcomeKey,
} from "../../../domain/ports/card-invoice-outcomes.js";
import { CardInvoicingReader } from "../../../domain/ports/card-invoicing.reader.js";
import { InvoiceNumbering } from "../../../domain/ports/invoice-numbering.js";
import { OrderInvoicesReader } from "../../../domain/ports/order-invoices.reader.js";
import { OrderInvoicingLock } from "../../../domain/ports/order-invoicing-lock.js";
import {
  RefundCreditLinks,
  RefundsToCreditReader,
  type CreditableRefund,
} from "../../../domain/ports/refunds-to-credit.js";
import type { CardInvoiceCandidate } from "../../../domain/services/card-invoicing.js";
import type { InvoiceSellerFacts } from "../../../domain/services/invoice-issuance-blockers.js";
import { CREDITOR } from "../../../domain/services/__tests__/collection-fixtures.js";
import { InvoiceNumber } from "../../../domain/value-objects/invoice-number.js";
import { InvoiceIssuer } from "../../services/invoice-issuer.js";
import { RefundReconciler } from "../../services/refund-reconciler.js";
import { IssueCardInvoiceHandler } from "../issue-card-invoice.handler.js";
import { ReconcileRefundsHandler } from "../reconcile-refunds.handler.js";
import { FixedBuyers, FixedCreditors, UlidSequence } from "./collection-doubles.js";
import { FixedIssuers, MemoryInvoices } from "./monthly-invoice-doubles.js";
import { RecordingDurable } from "./notice-doubles.js";

/**
 * Doublés de la facture carte et du rapprochement (lots E5a, E5b), chacun
 * héritant de son port. Ils partagent la mémoire des pièces : une facture
 * émise est vue par le lecteur suivant, comme en base.
 */

/** Le compteur, avec la règle que la base tient : jamais un jour antérieur au dernier émis. */
export class ChronologicalNumbering extends InvoiceNumbering {
  private rank = 0;
  private lastIssuedOn = "";
  readonly taken: string[] = [];
  next(legalEntityId: string, issuedOn: string): Promise<InvoiceNumber> {
    if (issuedOn < this.lastIssuedOn) {
      return Promise.reject(new InvoiceIssuedBeforePreviousError(legalEntityId, issuedOn));
    }
    this.rank += 1;
    this.lastIssuedOn = issuedOn;
    const number = InvoiceNumber.compose(Number(issuedOn.slice(0, 4)), this.rank);
    this.taken.push(number.value);
    return Promise.resolve(number);
  }
}

export class FakeCardReader extends CardInvoicingReader {
  readonly orders = new Map<string, CardInvoiceCandidate>();
  constructor(
    private readonly invoices: MemoryInvoices,
    private readonly refunds: MemoryRefunds,
  ) {
    super();
  }
  candidate(orderId: string): Promise<CardInvoiceCandidate | null> {
    const order = this.orders.get(orderId);
    if (order === undefined) {
      return Promise.resolve(null);
    }
    const invoiced = this.invoices.inserted.some(
      (invoice) =>
        !invoice.isCreditNote && invoice.toState().orders.some((o) => o.orderId === orderId),
    );
    const refundedCents = this.refunds.rows
      .filter((row) => row.orderId === orderId)
      .reduce((sum, row) => sum + row.amountCents, 0);
    return Promise.resolve({ ...order, invoiced, refundedCents });
  }
}

export class RecordingLock extends OrderInvoicingLock {
  readonly locked: string[] = [];
  lock(orderId: string): Promise<void> {
    this.locked.push(orderId);
    return Promise.resolve();
  }
}

export interface CardOutcomeRow {
  readonly key: CardInvoiceOutcomeKey;
  readonly invoiceId: string | null;
  readonly message: string | null;
}

export class MemoryCardOutcomes extends CardInvoiceOutcomes {
  readonly rows = new Map<string, CardOutcomeRow>();
  recordIssued(key: CardInvoiceOutcomeKey, invoiceId: string): Promise<void> {
    this.rows.set(key.orderId, { key, invoiceId, message: null });
    return Promise.resolve();
  }
  recordBlocked(key: CardInvoiceOutcomeKey, message: string): Promise<void> {
    this.rows.set(key.orderId, { key, invoiceId: null, message });
    return Promise.resolve();
  }
}

export class MemoryOrderInvoices extends OrderInvoicesReader {
  constructor(private readonly invoices: MemoryInvoices) {
    super();
  }
  ofOrder(orderId: string): Promise<readonly Invoice[]> {
    return Promise.resolve(
      this.invoices.inserted.filter((invoice) =>
        invoice.toState().orders.some((order) => order.orderId === orderId),
      ),
    );
  }
}

interface RefundRow extends CreditableRefund {
  readonly orderId: string;
}

/** Les remboursements réussis, et leurs liens vers l'avoir — les deux ports. */
export class MemoryRefunds extends RefundsToCreditReader {
  rows: RefundRow[] = [];
  readonly links = new MemoryRefundLinks(this);
  add(orderId: string, refundId: string, amountCents: number): void {
    this.rows.push({ orderId, refundId, amountCents, creditNoteId: null });
  }
  succeededOf(orderId: string): Promise<readonly CreditableRefund[]> {
    return Promise.resolve(this.rows.filter((row) => row.orderId === orderId));
  }
}

export class MemoryRefundLinks extends RefundCreditLinks {
  constructor(private readonly refunds: MemoryRefunds) {
    super();
  }
  link(refundId: string, creditNoteId: string): Promise<void> {
    this.refunds.rows = this.refunds.rows.map((row) =>
      row.refundId === refundId ? { ...row, creditNoteId } : row,
    );
    return Promise.resolve();
  }
}

/** Tout le monde câblé sur la même mémoire et la même horloge, avançable. */
export function cardWorld(at: Date, issuers: readonly InvoiceSellerFacts[] = [SELLER_FACTS]) {
  const invoices = new MemoryInvoices();
  const refunds = new MemoryRefunds();
  const reader = new FakeCardReader(invoices, refunds);
  const outcomes = new MemoryCardOutcomes();
  const numbering = new ChronologicalNumbering();
  const journal = new RecordingJournal();
  const events = new RecordingPublisher();
  const durable = new RecordingDurable();
  const lock = new RecordingLock();
  const clock = new FixedClock(at);
  const uow = new DirectUnitOfWork();
  const ids = new UlidSequence();
  const issuer = new InvoiceIssuer(numbering, invoices, clock, events, uow, durable);
  const reconciler = new RefundReconciler(
    new MemoryOrderInvoices(invoices),
    refunds,
    refunds.links,
    issuer,
    journal,
    events,
    ids,
    clock,
  );
  const handler = new IssueCardInvoiceHandler(
    lock,
    reader,
    new FixedCreditors(CREDITOR),
    new FixedIssuers(issuers),
    new FixedBuyers(),
    issuer,
    outcomes,
    reconciler,
    journal,
    ids,
    clock,
    uow,
  );
  const reconcile = new ReconcileRefundsHandler(lock, reconciler, uow);
  return {
    invoices,
    refunds,
    reader,
    outcomes,
    numbering,
    journal,
    events,
    durable,
    lock,
    handler,
    reconcile,
    clock,
  };
}
