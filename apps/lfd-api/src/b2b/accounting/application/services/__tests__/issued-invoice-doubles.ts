import { Buffer } from "node:buffer";

import { CustomerDocumentStore } from "../../../../../platform/storage/customer-document-store.js";
import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import type { Invoice } from "../../../domain/entities/invoice.js";
import { InvoicePeriodsReader } from "../../../domain/ports/invoice-periods.reader.js";
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

export class FixedInvoicePeriods extends InvoicePeriodsReader {
  constructor(private readonly periods: ReadonlyMap<string, string>) {
    super();
  }
  periodsOf(invoiceIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(
      new Map([...this.periods].filter(([invoiceId]) => invoiceIds.includes(invoiceId))),
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

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new Error(`objet absent : ${key}`))
      : Promise.resolve(Buffer.from(found.bytes));
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }
}
