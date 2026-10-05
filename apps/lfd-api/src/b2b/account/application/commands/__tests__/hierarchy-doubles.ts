import type { BillingAddressPayload, CompanyFollowAspect } from "@lfd/contracts";

import type { Company } from "../../../domain/entities/company.js";
import { DeliveryAddressBook } from "../../../domain/entities/delivery-address-book.js";
import { SubAccountFollows } from "../../../domain/entities/sub-account-follows.js";
import { AccountHierarchyLock } from "../../../domain/ports/account-hierarchy.lock.js";
import { CompanyAddressRepository } from "../../../domain/ports/company-address.repository.js";
import { CompanyFollowsReader } from "../../../domain/ports/company-follows.reader.js";
import {
  PricingFollowJournal,
  type PricingFollowEntry,
} from "../../../domain/ports/pricing-follow.journal.js";
import { CompanyFollowsRepository } from "../../../domain/ports/company-follows.repository.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import type { FollowPeriod } from "../../../domain/value-objects/follow-period.js";

/**
 * Les doubles des gestes de la hiérarchie des comptes — des classes qui
 * héritent des ports, et un JOURNAL d'appels partagé : l'ordre « verrou, puis
 * lectures » est le sujet de ces tests.
 */
export class CallLog {
  readonly calls: string[] = [];
}

export class RecordingHierarchyLock extends AccountHierarchyLock {
  constructor(private readonly log: CallLog) {
    super();
  }
  acquire(): Promise<void> {
    this.log.calls.push("lock");
    return Promise.resolve();
  }
}

export class InMemoryCompanies extends CompanyRepository {
  readonly saved: Company[] = [];
  readonly declared: Company[] = [];

  constructor(
    private readonly log: CallLog,
    private readonly byId: Map<string, Company>,
  ) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(companyId: string): Promise<Company | null> {
    this.log.calls.push(`load:${companyId}`);
    return Promise.resolve(this.byId.get(companyId) ?? null);
  }
  save(company: Company): Promise<void> {
    this.log.calls.push(`save:${company.id ?? "new"}`);
    this.saved.push(company);
    return Promise.resolve();
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("owned");
  }
  declareUnowned(company: Company): Promise<string> {
    this.log.calls.push("declare");
    this.declared.push(company);
    return Promise.resolve("sub_new");
  }
  kbisLocation(): Promise<KbisLocation | null> {
    return Promise.resolve(null);
  }
}

export class InMemoryAddresses extends CompanyAddressRepository {
  readonly books: DeliveryAddressBook[] = [];
  saveBilling(_companyId: string, _payload: BillingAddressPayload): Promise<void> {
    return Promise.resolve();
  }
  loadDeliveryBook(companyId: string): Promise<DeliveryAddressBook> {
    return Promise.resolve(
      DeliveryAddressBook.reconstitute({ companyId, entries: [], defaultId: null }),
    );
  }
  saveDeliveryBook(book: DeliveryAddressBook): Promise<void> {
    this.books.push(book);
    return Promise.resolve();
  }
}

export class InMemoryFollows extends CompanyFollowsRepository {
  readonly saved: SubAccountFollows[] = [];
  constructor(
    private readonly log: CallLog,
    private readonly byCompany: Map<string, SubAccountFollows> = new Map(),
  ) {
    super();
  }
  load(companyId: string): Promise<SubAccountFollows> {
    this.log.calls.push(`follows:${companyId}`);
    return Promise.resolve(this.byCompany.get(companyId) ?? SubAccountFollows.none(companyId));
  }
  save(follows: SubAccountFollows): Promise<void> {
    this.log.calls.push(`saveFollows:${follows.companyId}`);
    this.saved.push(follows);
    this.byCompany.set(follows.companyId, follows);
    return Promise.resolve();
  }
}

/** Le lecteur à date, adossé au même agrégat que le dépôt. */
export class FollowsReaderOver extends CompanyFollowsReader {
  constructor(private readonly follows: InMemoryFollows) {
    super();
  }
  async followsAt(
    companyId: string,
    aspect: CompanyFollowAspect,
    at: Date,
  ): Promise<FollowPeriod | null> {
    return (await this.follows.load(companyId)).followsAt(aspect, at);
  }
}

/** Le journal des prix tel que les gestes le voient : il note ce qu'on lui inscrit. */
export class RecordingPricingJournal extends PricingFollowJournal {
  readonly started: PricingFollowEntry[] = [];
  readonly ended: (PricingFollowEntry & { readonly validTo: Date })[] = [];

  followStarted(entry: PricingFollowEntry): Promise<void> {
    this.started.push(entry);
    return Promise.resolve();
  }
  followEnded(entry: PricingFollowEntry & { readonly validTo: Date }): Promise<void> {
    this.ended.push(entry);
    return Promise.resolve();
  }
}
