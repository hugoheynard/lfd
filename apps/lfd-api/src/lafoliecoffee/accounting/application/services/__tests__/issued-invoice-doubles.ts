import { Buffer } from "node:buffer";

import { CustomerDocumentStore } from "../../../../../platform/storage/customer-document-store.js";
import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import type { Invoice } from "../../../domain/entities/invoice.js";
import { CompanyInvoicesReader } from "../../../domain/ports/company-invoices.reader.js";
import { InvoicePeriodsReader } from "../../../domain/ports/invoice-periods.reader.js";
import {
  InvoiceSettlementFactsReader,
  type InvoiceCollectionFacts,
} from "../../../domain/ports/invoice-settlement-facts.reader.js";
import type { BillingCycle } from "../../../domain/services/billing-cycle.js";
import { InvoiceReader } from "../../../domain/ports/invoice.reader.js";
import { PayerNoticeContactsReader } from "../../../domain/ports/payer-notice-contacts.reader.js";
import {
  UnpaidAccessReader,
  type UnpaidAccessRole,
} from "../../../domain/ports/unpaid-access.reader.js";
import type { PayerNoticeContacts } from "../../../domain/services/collection-notice-recipient.js";

/** Doublés des lectures de factures émises (E6), chacun héritant de son port. */

export class MemoryInvoiceReader extends InvoiceReader {
  constructor(private readonly invoices: readonly Invoice[]) {
    super();
  }
  byId(invoiceId: string): Promise<Invoice | null> {
    return Promise.resolve(this.invoices.find((invoice) => invoice.id === invoiceId) ?? null);
  }
  byPayer(payerCompanyId: string): Promise<readonly Invoice[]> {
    return Promise.resolve(
      this.invoices.filter((invoice) => invoice.toState().buyer.companyId === payerCompanyId),
    );
  }
  byEntityAndYear(): Promise<readonly Invoice[]> {
    return Promise.resolve(this.invoices);
  }
}

/**
 * Le mur de « Mes factures » en mémoire : l'acheteur, ou la société qui a
 * passé un des bons (`orderCompanies` : bon → société ; absent = le payeur).
 */
export class MemoryCompanyInvoices extends CompanyInvoicesReader {
  /** Chaque lecture de liste, avec sa sélection : prouve qu'il n'y en a qu'une. */
  readonly listCalls: (readonly string[] | undefined)[] = [];
  oneCalls = 0;
  constructor(
    private readonly invoices: readonly Invoice[],
    private readonly orderCompanies: ReadonlyMap<string, string> = new Map(),
  ) {
    super();
  }
  visibleTo(companyId: string, onlyIds?: readonly string[]): Promise<readonly Invoice[]> {
    this.listCalls.push(onlyIds);
    return Promise.resolve(
      this.invoices.filter(
        (invoice) =>
          this.sees(invoice, companyId) && (onlyIds === undefined || onlyIds.includes(invoice.id)),
      ),
    );
  }
  oneVisibleTo(invoiceId: string, companyId: string): Promise<Invoice | null> {
    this.oneCalls += 1;
    const invoice = this.invoices.find((candidate) => candidate.id === invoiceId);
    return Promise.resolve(invoice !== undefined && this.sees(invoice, companyId) ? invoice : null);
  }
  private sees(invoice: Invoice, companyId: string): boolean {
    const state = invoice.toState();
    return (
      state.buyer.companyId === companyId ||
      state.orders.some((order) => this.orderCompanies.get(order.orderId) === companyId)
    );
  }
}

/** La période de septembre 2026 (mensuel au 1er) — dates comparées entre elles seulement. */
export const SEPTEMBER_2026: BillingCycle = {
  startsAt: new Date("2026-08-31T22:00:00.000Z"),
  closesAt: new Date("2026-09-30T22:00:00.000Z"),
};

export class FixedInvoicePeriods extends InvoicePeriodsReader {
  constructor(private readonly periods: ReadonlyMap<string, BillingCycle>) {
    super();
  }
  periodsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, BillingCycle>> {
    return Promise.resolve(
      new Map([...this.periods].filter(([invoiceId]) => invoiceIds.includes(invoiceId))),
    );
  }
}

/** Les faits de prélèvement par pièce ; compte les lectures pour prouver qu'elles vont par lot. */
export class FixedSettlementFacts extends InvoiceSettlementFactsReader {
  readonly calls: (readonly string[])[] = [];
  constructor(private readonly facts: ReadonlyMap<string, InvoiceCollectionFacts> = new Map()) {
    super();
  }
  factsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, InvoiceCollectionFacts>> {
    this.calls.push(invoiceIds);
    return Promise.resolve(
      new Map([...this.facts].filter(([invoiceId]) => invoiceIds.includes(invoiceId))),
    );
  }
}

export class FixedPayerContacts extends PayerNoticeContactsReader {
  constructor(private readonly contacts: ReadonlyMap<string, PayerNoticeContacts>) {
    super();
  }
  contactsOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, PayerNoticeContacts>> {
    return Promise.resolve(
      new Map([...this.contacts].filter(([companyId]) => companyIds.includes(companyId))),
    );
  }
}

/** Le rôle de chaque (utilisateur, société) ; absent = non membre. */
export class FixedRoles extends UnpaidAccessReader {
  constructor(private readonly roles: ReadonlyMap<string, UnpaidAccessRole>) {
    super();
  }
  roleOf(userId: string, companyId: string): Promise<UnpaidAccessRole | null> {
    return Promise.resolve(this.roles.get(`${userId}:${companyId}`) ?? null);
  }
}

/** Le seau des pièces gardées, en mémoire — sans `delete`, comme le port. */
export class MemoryKeptStore extends CustomerDocumentStore {
  readonly objects = new Map<string, StoredDocument>();
  readonly saved: string[] = [];

  save(key: string, document: StoredDocument): Promise<string> {
    this.saved.push(key);
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  readonly readKeys: string[] = [];

  read(key: string): Promise<Buffer> {
    this.readKeys.push(key);
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new Error(`objet absent : ${key}`))
      : Promise.resolve(Buffer.from(found.bytes));
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }
}
