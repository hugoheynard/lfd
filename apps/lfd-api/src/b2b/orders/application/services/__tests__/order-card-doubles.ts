import {
  type AttachedCardPayment,
  type CardPaymentCancellation,
  type CardPaymentLine,
  type CardPaymentPreparation,
  CardPayments,
  type CardSettlementPosition,
  CardSettlementReader,
  type RetrievedCardPayment,
} from "../../../../../card-payment/channels/requests/index.js";
import type {
  CardSubject,
  SubjectPaymentRole,
  SubjectSettledState,
} from "../../../../../card-payment/channels/subjects/index.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import type { OrderCardSettled } from "../../../domain/services/order-card-settled.js";
import {
  OrderCardStandingReader,
  type OrderCardStanding,
} from "../../../domain/ports/order-card-standing.reader.js";
import { OrderLock } from "../../../domain/ports/order-lock.js";
import type { OrderRepository } from "../../../domain/ports/order.repository.js";

/**
 * Doubles du canal des cartes côté commerce (plan M2, P0.c2), écrits à la
 * main en héritant des ports — jamais `jest.fn()`. Une chronologie commune
 * dit l'ORDRE du §3.6 : le verrou de la commande avant toute écriture.
 */
export class Steps {
  readonly seen: string[] = [];
}

/** Une commande carte non payée — ce que la ligne `orders` porterait. */
export function standing(overrides: Partial<OrderCardStanding> = {}): OrderCardStanding {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-0001",
    providerRef: "pi_1",
    totalCents: 2_340,
    cancelled: false,
    settled: "pending" satisfies OrderCardSettled,
    ...overrides,
  };
}

export class RecordingLock extends OrderLock {
  constructor(private readonly steps: Steps) {
    super();
  }

  lock(orderId: string): Promise<void> {
    this.steps.seen.push(`lock:${orderId}`);
    return Promise.resolve();
  }
}

export class FixedStandings extends OrderCardStandingReader {
  readonly sinceAsked: Date[] = [];

  constructor(private readonly rows: readonly OrderCardStanding[]) {
    super();
  }

  ofOrder(orderId: string): Promise<OrderCardStanding | null> {
    return Promise.resolve(this.rows.find((row) => row.orderId === orderId) ?? null);
  }

  ofIntent(providerRef: string): Promise<OrderCardStanding | null> {
    return Promise.resolve(this.rows.find((row) => row.providerRef === providerRef) ?? null);
  }

  withIntentCreatedSince(since: Date): Promise<readonly OrderCardStanding[]> {
    this.sinceAsked.push(since);
    return Promise.resolve(this.rows);
  }
}

/**
 * Le dépôt, réduit aux deux bascules de règlement : il note l'intention
 * demandée et rend ce que la base rendrait — l'identifiant de la commande au
 * franchissement, `null` quand rien n'était dans l'état d'origine.
 */
export function settlingRepo(steps: Steps, crossed: string | null): OrderRepository {
  return {
    place: () => Promise.reject(new Error("non utilisé")),
    markPaid: (providerRef) => {
      steps.seen.push(`markPaid:${providerRef}`);
      return Promise.resolve(crossed);
    },
    markPaymentFailed: (providerRef) => {
      steps.seen.push(`markPaymentFailed:${providerRef}`);
      return Promise.resolve(crossed);
    },
    markFulfilled: () => Promise.reject(new Error("non utilisé")),
    markReady: () => Promise.reject(new Error("non utilisé")),
    absorbIntoPlan: () => Promise.reject(new Error("non utilisé")),
    markAbandoned: () => Promise.reject(new Error("non utilisé")),
    failAtClosing: () => Promise.reject(new Error("non utilisé")),
  };
}

/**
 * Le bloc `card-payment`, par ses deux ports du canal : une position par
 * commande (une ligne `first` connue, ou aucune), et chaque geste noté.
 * `adopt` fait naître la ligne, comme la base.
 */
export class ScriptedCardPayments extends CardPayments {
  readonly calls: string[] = [];
  cancellation: CardPaymentCancellation = { kind: "cancelled" };
  failure: Error | null = null;

  constructor(readonly lines: Map<string, CardPaymentLine> = new Map()) {
    super();
  }

  prepare(): Promise<CardPaymentPreparation> {
    return Promise.reject(new Error("non utilisé"));
  }

  attach(): Promise<AttachedCardPayment> {
    return Promise.reject(new Error("non utilisé"));
  }

  release(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  retrieve(paymentId: string): Promise<RetrievedCardPayment> {
    this.calls.push(`retrieve:${paymentId}`);
    return Promise.resolve({
      paymentId,
      providerRef: "pi_1",
      clientSecret: "pi_1_secret",
      publishableKey: "pk_test",
      state: "awaiting_payment",
    });
  }

  cancel(paymentId: string): Promise<CardPaymentCancellation> {
    this.calls.push(`cancel:${paymentId}`);
    return this.failure === null
      ? Promise.resolve(this.cancellation)
      : Promise.reject(this.failure);
  }

  adopt(
    subject: CardSubject,
    providerRef: string,
    amountCents: number,
    role: SubjectPaymentRole,
    settled: SubjectSettledState,
  ): Promise<string> {
    this.calls.push(`adopt:${subject.id}:${providerRef}:${String(amountCents)}:${role}:${settled}`);
    this.lines.set(subject.id, {
      paymentId: "pay_adopted",
      account: "lfc-stripe",
      providerRef,
      role,
      state: settled,
      amountCents,
      paidAt: null,
    });
    return Promise.resolve("pay_adopted");
  }
}

/** Les positions, lues sur les lignes du double ci-dessus. */
export class LinePositions extends CardSettlementReader {
  constructor(private readonly payments: ScriptedCardPayments) {
    super();
  }

  positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    return Promise.resolve(
      subjects.map((subject) => {
        const line = this.payments.lines.get(subject.id);
        return { subject, payments: line === undefined ? [] : [line], chargedCents: 0 };
      }),
    );
  }
}

/** Une ligne `first` connue du bloc. */
export function firstLine(paymentId = "pay_1"): CardPaymentLine {
  return {
    paymentId,
    account: "lfc-stripe",
    providerRef: "pi_1",
    role: "first",
    state: "pending",
    amountCents: 2_340,
    paidAt: null,
  };
}

/** Une unité de travail qui note où elle s'ouvre et se ferme, dans la même chronologie. */
export class TracingUnitOfWork extends UnitOfWork {
  constructor(private readonly calls: string[]) {
    super();
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.calls.push("uow:begin");
    const result = await work();
    this.calls.push("uow:end");
    return result;
  }
}
