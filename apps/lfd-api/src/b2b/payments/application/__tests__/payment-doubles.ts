import { Buffer } from "node:buffer";

import type { SetCompanyBankAccountPayload } from "@lfd/contracts";

import type { CreditorSnapshot } from "../../../accounting/domain/creditor-snapshot.js";
import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { SecretGenerator } from "../../../../platform/secret/secret-generator.js";
import { DocumentStorageUnavailableError } from "../../../../platform/shared/errors/storage-errors.js";
import { DocumentStore, type StoredDocument } from "../../../../platform/storage/document-store.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CompanyBankAccount } from "../../domain/entities/company-bank-account.js";
import {
  PaymentMandate,
  type MandateSnapshot,
  type MandateToCreate,
} from "../../domain/entities/payment-mandate.js";
import { MandateDraftAlreadyExistsError } from "../../domain/errors/mandate-errors.js";
import { MandateProofChangedError } from "../../domain/errors/mandate-proof-errors.js";
import {
  PaymentMandateRepository,
  type MandateHolder,
} from "../../domain/payment-mandate.repository.js";
import {
  BankAccountGuardReader,
  type BankAccountRole,
} from "../../domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "../../domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "../../domain/ports/customer-mandate-gate.js";

/**
 * Doublés partagés des handlers du **mandat** et du **RIB**.
 *
 * Tous écrivent dans UN journal de bord commun (`Steps`), sur le modèle de
 * `feature-access-doubles.ts` : c'est ce qui permet d'affirmer l'ORDRE — le mur
 * avant le drapeau, le rangement avant la transaction, la trace à l'intérieur
 * de l'unité de travail, la cloche après.
 *
 * Chacun hérite du port abstrait : un port qui change fait rougir ici, pas en
 * production.
 */
export class Steps {
  readonly log: string[] = [];
}

/** IBAN d'exemple de la documentation bancaire française — clé mod-97 correcte. */
export const IBAN = "FR1420041010050500013M02606";

export const RIB_PAYLOAD: SetCompanyBankAccountPayload = {
  iban: IBAN,
  bic: "CEPAFRPP751",
  holder: "Refuge du Col SARL",
  holderLegalForm: "SARL",
  line1: "12 rue des Alpages",
  line2: "",
  postalCode: "73150",
  city: "Val d'Isère",
  countryCode: "FR",
};

export const HOLDER: MandateHolder = {
  companyName: "Refuge du Col SARL",
  email: "compta@refuge.fr",
  reference: "C-9P2X4B",
  siren: "732829320",
};

/** Un émetteur complet : il peut imprimer un mandat. */
export const CREDITOR: CreditorSnapshot = {
  legalEntityId: "ent_1",
  name: "Crazeativity",
  legalForm: "SAS",
  siren: "900000001",
  vatNumber: "",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["Route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ900001",
  creditorIban: "FR7630006000011234567890189",
  creditorBic: "CEPAFRPP751",
  accountHolder: "CRAZEATIVITY",
  accountAddressLines: ["Route de la Balme", "73150 Val d'Isère", "FR"],
  preNotificationDays: 14,
  mandateContractDescription: "Fourniture de pains et viennoiseries",
  mandatePaymentType: "recurrent",
  mandateScheme: "B2B",
};

export const PDF = Buffer.from("%PDF-1.4\nmandat signé", "latin1");

/** Un mandat reconstitué — brouillon par défaut, sans pièce. */
export function mandate(overrides: Partial<MandateSnapshot> = {}): PaymentMandate {
  return PaymentMandate.reconstitute({
    id: "mdt_1",
    companyId: "cmp_1",
    stripeCustomerId: null,
    paymentMethodId: null,
    reference: "LFC-9P2X4B-260914-K7M3QT",
    scheme: "B2B",
    paymentType: "recurrent",
    last4: "",
    bankCode: "",
    country: "",
    status: "draft",
    acceptedAt: null,
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
    creditorId: "ent_1",
    ...overrides,
  });
}

/** Un mandat actif, signé et prouvé. Date comparée à aucune horloge. */
export function activeMandate(overrides: Partial<MandateSnapshot> = {}): PaymentMandate {
  return mandate({
    id: "mdt_actif",
    status: "active",
    acceptedAt: new Date("2026-01-15T00:00:00.000Z"),
    proofStorageKey: "companies/cmp_1/mandates/mdt_actif/mandat-signe-1",
    proofFileName: "mandat-actif.pdf",
    ...overrides,
  });
}

/** Le RIB recopié d'une société. */
export function bankAccount(companyId = "cmp_1"): CompanyBankAccount {
  return CompanyBankAccount.reconstitute({
    id: "cba_1",
    companyId,
    holder: RIB_PAYLOAD.holder,
    holderLegalForm: "SARL",
    addressLine1: RIB_PAYLOAD.line1,
    addressLine2: RIB_PAYLOAD.line2,
    postalCode: RIB_PAYLOAD.postalCode,
    city: RIB_PAYLOAD.city,
    countryCode: RIB_PAYLOAD.countryCode,
    iban: IBAN,
    bic: RIB_PAYLOAD.bic,
    debtorReference: "",
    contractNumber: "",
  });
}

/** Le même RIB, déposé par un écran qui ne connaissait pas la forme juridique du titulaire. */
export function bankAccountWithoutLegalForm(companyId = "cmp_1"): CompanyBankAccount {
  return CompanyBankAccount.reconstitute({
    ...bankAccount(companyId).toPersistence(),
    holderLegalForm: "",
  });
}

/** Les mandats en mémoire : un courant, un brouillon, et de quoi simuler l'index. */
export class InMemoryMandates extends PaymentMandateRepository {
  current: PaymentMandate | null = null;
  draft: PaymentMandate | null = null;
  holder: MandateHolder | null = HOLDER;
  /**
   * Simule deux frappes simultanées : `create` bute comme sur l'index partiel,
   * et ce brouillon-là apparaît à la relecture suivante.
   */
  raceWinner: PaymentMandate | null = null;
  readonly created: MandateToCreate[] = [];
  readonly saved: PaymentMandate[] = [];

  constructor(private readonly steps: Steps) {
    super();
  }

  findCurrent(): Promise<PaymentMandate | null> {
    this.steps.log.push("mandate:find-current");
    return Promise.resolve(this.current ?? this.draft);
  }

  findById(mandateId: string): Promise<PaymentMandate | null> {
    const known = [this.current, this.draft].find((candidate) => candidate?.id === mandateId);
    return Promise.resolve(known ?? null);
  }

  findDraft(): Promise<PaymentMandate | null> {
    this.steps.log.push("mandate:find-draft");
    return Promise.resolve(this.draft);
  }

  findAwaitingProof(): Promise<PaymentMandate | null> {
    return Promise.resolve(this.draft ?? this.current);
  }

  create(snapshot: MandateToCreate): Promise<string> {
    if (this.raceWinner !== null) {
      this.draft = this.raceWinner;
      return Promise.reject(new MandateDraftAlreadyExistsError(null));
    }
    this.steps.log.push("mandate:create");
    this.created.push(snapshot);
    return Promise.resolve("mdt_neuf");
  }

  save(saved: PaymentMandate): Promise<void> {
    this.steps.log.push(`mandate:save:${saved.status}`);
    this.saved.push(saved);
    return Promise.resolve();
  }

  /**
   * Ce que la base porte À L'INSTANT de l'écriture, quand un autre geste est
   * passé depuis la lecture. `null` : rien n'a bougé, l'écriture tient.
   */
  concurrent: {
    readonly status: MandateSnapshot["status"];
    readonly proofStorageKey: string | null;
  } | null = null;

  depositProof(deposited: PaymentMandate, previousProofKey: string | null): Promise<void> {
    const base = this.concurrent;
    if (base !== null && (base.status !== "draft" || base.proofStorageKey !== previousProofKey)) {
      this.steps.log.push("mandate:deposit-refused");
      return Promise.reject(new MandateProofChangedError());
    }
    this.steps.log.push("mandate:deposit");
    this.saved.push(deposited);
    return Promise.resolve();
  }

  findHolder(): Promise<MandateHolder | null> {
    return Promise.resolve(this.holder);
  }

  findStripeCustomerId(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

/** Le RIB en mémoire. */
export class InMemoryBankAccounts extends CompanyBankAccountRepository {
  stored: CompanyBankAccount | null = null;
  readonly saved: CompanyBankAccount[] = [];
  reads = 0;

  constructor(private readonly steps: Steps) {
    super();
  }

  findByCompany(): Promise<CompanyBankAccount | null> {
    this.reads += 1;
    return Promise.resolve(this.stored);
  }

  save(account: CompanyBankAccount): Promise<void> {
    this.steps.log.push("account:save");
    this.saved.push(account);
    this.stored = account;
    return Promise.resolve();
  }
}

/** Le mur : rend le rôle qu'on lui donne, et marque sa lecture. */
export class FixedGuard extends BankAccountGuardReader {
  constructor(
    private readonly steps: Steps,
    private readonly role: BankAccountRole | null,
  ) {
    super();
  }

  roleOf(): Promise<BankAccountRole | null> {
    this.steps.log.push("guard");
    return Promise.resolve(this.role);
  }
}

/** Le drapeau `customerMandate` : ouvert ou fermé, et marque sa lecture. */
export class FixedGate extends CustomerMandateGate {
  constructor(
    private readonly steps: Steps,
    private readonly open: boolean,
  ) {
    super();
  }

  isOpen(): Promise<boolean> {
    this.steps.log.push("gate");
    return Promise.resolve(this.open);
  }
}

export class StepUnitOfWork extends UnitOfWork {
  constructor(private readonly steps: Steps) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.steps.log.push("uow:begin");
    const result = await work();
    this.steps.log.push("uow:end");
    return result;
  }
}

export class StepPublisher extends DomainEventPublisher {
  readonly traced: JournaledEvent[] = [];

  constructor(private readonly steps: Steps) {
    super();
  }

  publish(): void {
    this.steps.log.push("publish");
  }

  publishTraced(event: JournaledEvent): Promise<void> {
    this.traced.push(event);
    this.steps.log.push(`journal:${event.journalFact().type}`);
    return Promise.resolve();
  }
}

/** La cloche : garde les annonces, ou tombe en panne sur demande. */
export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];
  broken = false;

  constructor(private readonly steps: Steps) {
    super();
  }

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.steps.log.push("bell");
    if (this.broken) {
      return Promise.reject(new Error("cloche en panne (doublé)"));
    }
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

export class FixedCreditors extends CreditorReader {
  constructor(private readonly issuer: CreditorSnapshot | null = CREDITOR) {
    super();
  }

  snapshot(): Promise<CreditorSnapshot | null> {
    return Promise.resolve(this.issuer);
  }

  soleIssuer(): Promise<CreditorSnapshot | null> {
    return Promise.resolve(this.issuer);
  }
}

export class FixedSecrets extends SecretGenerator {
  next(): string {
    return "K7M3QT9Z";
  }
}

/** Un coffre en mémoire, qui marque chaque rangement. */
export class MemoryStore extends DocumentStore {
  readonly objects = new Map<string, StoredDocument>();

  constructor(private readonly steps: Steps) {
    super();
  }

  save(key: string, document: StoredDocument): Promise<string> {
    this.steps.log.push("store");
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? Buffer.alloc(0));
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.objects.get(key)?.bytes ?? null);
  }

  /** Tombe en panne sur demande — ce que fait un bucket dont le jeton a expiré. */
  failDeletes = false;

  delete(key: string): Promise<void> {
    this.steps.log.push(`store:delete:${key}`);
    if (this.failDeletes) {
      return Promise.reject(new DocumentStorageUnavailableError("suppression refusée (doublé)."));
    }
    this.objects.delete(key);
    return Promise.resolve();
  }
}
