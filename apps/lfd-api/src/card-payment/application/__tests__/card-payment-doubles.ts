import { CardAccountDefaults } from "../../../platform/config/card-accounts.js";
import type { CardAccountName } from "../../../platform/config/card-accounts.js";
import type { DurableFact } from "../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import {
  type CardSubject,
  type SubjectClaim,
  type SubjectDescription,
  type SubjectPaidOutcome,
  type SubjectReference,
  SubjectSettlement,
} from "../../channels/subjects/index.js";
import { CardPayment } from "../../domain/entities/card-payment.js";
import {
  CardAccountUnavailableError,
  UnknownCardAccountError,
} from "../../domain/errors/card-payment-errors.js";
import type { CardProviderEvent } from "../../domain/ports/card-provider-event.js";
import { CardProvider } from "../../domain/ports/card-provider.js";
import type {
  CreateIntentParams,
  CreatedIntent,
  IntentCancellation,
  RefundIssuance,
  RefundLookup,
  RefundRemainderParams,
  RetrievedIntent,
} from "../../domain/ports/card-provider-types.js";
import { CardPaymentRepository } from "../../domain/ports/card-payment.repository.js";
import { CardProviders } from "../../domain/ports/card-providers.js";
import { TakeoverReader } from "../../domain/ports/takeover.reader.js";
import { PaymentAccount } from "../../domain/value-objects/payment-account.js";

/**
 * **La chronologie partagée** : chaque double y écrit ce qu'il fait, pour que
 * les tests éprouvent l'ORDRE du §3.6 (le canal avant l'écriture).
 */
export class Timeline {
  readonly steps: string[] = [];

  note(step: string): void {
    this.steps.push(step);
  }
}

/** Les paiements en mémoire — mêmes unicités que la base (référence par compte, un `first` par sujet). */
export class InMemoryCardPayments extends CardPaymentRepository {
  readonly rows = new Map<string, CardPayment>();

  constructor(private readonly timeline = new Timeline()) {
    super();
  }

  seed(payment: CardPayment): void {
    this.rows.set(payment.id, CardPayment.rehydrate(payment.toPersistence()));
  }

  state(paymentId: string): string | undefined {
    return this.rows.get(paymentId)?.state;
  }

  load(paymentId: string): Promise<CardPayment | null> {
    this.timeline.note(`repo.load:${paymentId}`);
    return Promise.resolve(this.copy(this.rows.get(paymentId)));
  }

  findByProviderRef(account: PaymentAccount, providerRef: string): Promise<CardPayment | null> {
    const found = [...this.rows.values()].find(
      (row) => row.account.name === account.name && row.providerRef === providerRef,
    );
    return Promise.resolve(this.copy(found));
  }

  unsettledCreatedBefore(subjectType: string, before: Date): Promise<readonly CardPayment[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter(
          (row) =>
            row.subject.type === subjectType &&
            (row.state === "pending" || row.state === "failed") &&
            row.createdAt < before,
        )
        .map((row) => CardPayment.rehydrate(row.toPersistence())),
    );
  }

  addIfAbsent(payment: CardPayment): Promise<boolean> {
    const taken = [...this.rows.values()].some(
      (row) =>
        row.id === payment.id ||
        (row.account.name === payment.account.name && row.providerRef === payment.providerRef) ||
        (payment.role === "first" && row.role === "first" && row.subject.equals(payment.subject)),
    );
    if (taken) {
      return Promise.resolve(false);
    }
    this.timeline.note(`repo.add:${payment.id}:${payment.state}`);
    this.seed(payment);
    return Promise.resolve(true);
  }

  save(payment: CardPayment): Promise<void> {
    this.timeline.note(`repo.save:${payment.id}:${payment.state}`);
    this.seed(payment);
    return Promise.resolve();
  }

  private copy(payment: CardPayment | undefined): CardPayment | null {
    return payment === undefined ? null : CardPayment.rehydrate(payment.toPersistence());
  }
}

/** Le prestataire doublé : il rend ce qu'on lui a dit, et note chaque appel. */
export class RecordingCardProvider extends CardProvider {
  readonly calls: string[] = [];
  event: CardProviderEvent = { kind: "other", eventId: "evt_0", eventType: "charge.succeeded" };
  cancellation: IntentCancellation = { kind: "cancelled" };
  signatureRefused: Error | null = null;
  createdRef = "pi_new";

  constructor(private readonly key = "pk_test_1") {
    super();
  }

  createIntent(params: CreateIntentParams): Promise<CreatedIntent> {
    this.calls.push(`createIntent:${String(params.amountCents)}:${params.currency}:${params.tag}`);
    return Promise.resolve({
      providerRef: this.createdRef,
      clientSecret: `${this.createdRef}_secret`,
    });
  }

  retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    this.calls.push(`retrieveIntent:${providerRef}`);
    return Promise.resolve({
      providerRef,
      clientSecret: `${providerRef}_secret`,
      state: "awaiting_payment",
    });
  }

  cancelIntent(providerRef: string): Promise<IntentCancellation> {
    this.calls.push(`cancelIntent:${providerRef}`);
    return Promise.resolve(this.cancellation);
  }

  publishableKey(): string {
    return this.key;
  }

  parseWebhook(rawBody: Buffer, signature: string): CardProviderEvent {
    this.calls.push(`parseWebhook:${rawBody.toString("utf8")}:${signature}`);
    if (this.signatureRefused !== null) {
      throw this.signatureRefused;
    }
    return this.event;
  }

  refundRemainder(providerRef: string, params: RefundRemainderParams): Promise<RefundIssuance> {
    this.calls.push(`refundRemainder:${providerRef}:${params.key}`);
    return Promise.resolve({ kind: "nothing_left" });
  }

  findRefund(providerRef: string, params: RefundRemainderParams): Promise<RefundLookup> {
    this.calls.push(`findRefund:${providerRef}:${params.requestId}`);
    return Promise.resolve({ kind: "none" });
  }
}

/** Le registre doublé : les comptes connus, et ceux qui sont instanciés. */
export class StaticCardProviders extends CardProviders {
  constructor(
    private readonly instantiated: ReadonlyMap<string, CardProvider>,
    private readonly known: readonly string[] = ["lfc-stripe"],
  ) {
    super();
  }

  forAccount(account: PaymentAccount): CardProvider {
    if (!this.known.includes(account.name)) {
      throw new UnknownCardAccountError(account.name);
    }
    const provider = this.instantiated.get(account.name);
    if (provider === undefined) {
      throw new CardAccountUnavailableError(account.name);
    }
    return provider;
  }

  accounts(): readonly PaymentAccount[] {
    return [...this.instantiated.keys()].map((name) => PaymentAccount.of(name));
  }
}

/** `order → lfc-stripe`, comme `appBootstrap/` le posera. */
export class OrderDefaults extends CardAccountDefaults {
  accountFor(subjectType: string): CardAccountName | null {
    return subjectType === "order" ? "lfc-stripe" : null;
  }
}

/** Un implémenteur du canal retour, réglable, qui note ses appels dans la chronologie. */
export class TestSubjectSettlement extends SubjectSettlement {
  readonly subjectType: string;
  paidOutcome: SubjectPaidOutcome = "applied";
  claims = new Map<string, SubjectClaim>();
  references: SubjectReference[] = [];
  cancelled = new Set<string>();
  referencesAskedSince: Date | null = null;

  constructor(
    private readonly timeline: Timeline,
    subjectType = "order",
  ) {
    super();
    this.subjectType = subjectType;
  }

  onPaid(
    subject: CardSubject,
    paymentId: string,
    amountCents: number,
  ): Promise<SubjectPaidOutcome> {
    this.timeline.note(`channel.onPaid:${subject.id}:${paymentId}:${String(amountCents)}`);
    return Promise.resolve(this.paidOutcome);
  }

  onPaymentFailed(subject: CardSubject, paymentId: string): Promise<void> {
    this.timeline.note(`channel.onPaymentFailed:${subject.id}:${paymentId}`);
    return Promise.resolve();
  }

  isCancelled(subject: CardSubject): Promise<boolean> {
    return Promise.resolve(this.cancelled.has(subject.id));
  }

  describe(subject: CardSubject): Promise<SubjectDescription> {
    return Promise.resolve({ label: `Commande ${subject.id}`, link: `/commandes/${subject.id}` });
  }

  claim(account: string, providerRef: string): Promise<SubjectClaim | null> {
    this.timeline.note(`channel.claim:${account}:${providerRef}`);
    return Promise.resolve(this.claims.get(providerRef) ?? null);
  }

  referencesSince(since: Date): Promise<readonly SubjectReference[]> {
    this.referencesAskedSince = since;
    return Promise.resolve(this.references);
  }
}

/** Les faits durables, dans l'ordre, et dans la chronologie. */
export class RecordingDurable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  constructor(private readonly timeline = new Timeline()) {
    super();
  }

  publish(fact: DurableFact): Promise<void> {
    this.timeline.note(`fact:${fact.type}`);
    this.facts.push(fact);
    return Promise.resolve();
  }

  types(): string[] {
    return this.facts.map((fact) => fact.type);
  }
}

/** Le témoin de reprise, posé ou absent. */
export class StaticTakeover extends TakeoverReader {
  constructor(private readonly at: Date | null) {
    super();
  }

  migratedAt(): Promise<Date | null> {
    return Promise.resolve(this.at);
  }
}
