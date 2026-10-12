import {
  PaymentGateway,
  type CreatedIntent,
  type IntentCancellation,
  type PaymentWebhookEvent,
  type RetrievedIntent,
} from "../../../../payments/domain/payment-gateway.js";
import {
  OrderWithdrawalDesk,
  type OrderWithdrawalOutcome,
  type ServiceDay,
} from "../../../../../production/channels/commerce/index.js";
import {
  CancellationSubjectReader,
  type CancellationSubject,
} from "../../../domain/ports/cancellation-subject.reader.js";
import {
  OrderCancellationRepository,
  type CancellationRecord,
} from "../../../domain/ports/order-cancellation.repository.js";

/**
 * Doubles de l'annulation staff, écrits à la main en héritant des ports —
 * jamais `jest.fn()`. Ils partagent une `trace` pour éprouver l'ORDRE des
 * gestes : Stripe avant la transaction, verrou avant retrait avant écriture.
 */

/** Une commande carte non payée, d'un particulier, pour un jour de service. */
export function cancellationSubject(
  overrides: Partial<CancellationSubject> = {},
): CancellationSubject {
  return {
    orderId: "ord_1",
    orderNumber: "CMD-0001",
    placedByUserId: "usr_1",
    status: "placed",
    paymentStatus: "pending",
    totalCents: 2_110,
    serviceDay: "2026-10-13",
    cancelledAt: null,
    stripePaymentIntentId: "pi_1",
    loyaltyVoucherId: null,
    ...overrides,
  };
}

/** La lecture sans verrou : la commande telle qu'elle est au premier regard. */
export class FixedSubjects extends CancellationSubjectReader {
  constructor(private readonly subject: CancellationSubject | null) {
    super();
  }

  find(): Promise<CancellationSubject | null> {
    return Promise.resolve(this.subject);
  }
}

/**
 * La ligne `orders`, en mémoire, avec la sémantique du `where` conditionné :
 * seule une `placed` en carte non encaissée ou à total nul franchit.
 * `failures` fait échouer autant de verrous — une panne de base, pas un refus.
 * `refuseWrite` simule un `where` qui ne trouve rien.
 */
export class InMemoryCancellations extends OrderCancellationRepository {
  readonly records: CancellationRecord[] = [];
  failures = 0;
  refuseWrite = false;

  constructor(
    public current: CancellationSubject | null,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  lock(orderId: string): Promise<CancellationSubject | null> {
    this.trace.push(`lock:${orderId}`);
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error("la connexion à la base est tombée"));
    }
    return Promise.resolve(this.current);
  }

  cancel(orderId: string, record: CancellationRecord): Promise<boolean> {
    this.trace.push(`cancel:${orderId}`);
    const current = this.current;
    if (this.refuseWrite || current === null || current.status !== "placed") {
      return Promise.resolve(false);
    }
    this.records.push(record);
    this.current = { ...current, status: "cancelled", cancelledAt: record.cancelledAt };
    return Promise.resolve(true);
  }
}

/** Le prestataire : une issue d'annulation écrite d'avance, et les appels vus. */
export class ScriptedCancelGateway extends PaymentGateway {
  readonly cancelled: string[] = [];

  constructor(
    private readonly outcome: IntentCancellation,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  cancelIntent(paymentIntentId: string): Promise<IntentCancellation> {
    this.trace.push(`stripe:${paymentIntentId}`);
    this.cancelled.push(paymentIntentId);
    return Promise.resolve(this.outcome);
  }

  createIntent(): Promise<CreatedIntent> {
    return Promise.reject(new Error("non utilisé"));
  }

  retrieveIntent(): Promise<RetrievedIntent> {
    return Promise.reject(new Error("non utilisé"));
  }

  publishableKey(): string {
    return "pk_test";
  }

  parseWebhook(): PaymentWebhookEvent {
    return { kind: "ignored" };
  }
}

/** Le guichet du fournil : une issue écrite d'avance, et les retraits demandés. */
export class ScriptedDesk extends OrderWithdrawalDesk {
  constructor(
    private readonly outcome: OrderWithdrawalOutcome = "withdrawn",
    private readonly trace: string[] = [],
  ) {
    super();
  }

  withdraw(day: ServiceDay, orderId: string): Promise<OrderWithdrawalOutcome> {
    this.trace.push(`withdraw:${day.value}:${orderId}`);
    return Promise.resolve(this.outcome);
  }
}
