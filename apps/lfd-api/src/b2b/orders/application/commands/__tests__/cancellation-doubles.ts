import {
  PaymentGateway,
  type CreatedIntent,
  type IntentCancellation,
  type PaymentWebhookEvent,
  type RetrievedIntent,
} from "../../../../payments/domain/payment-gateway.js";
import {
  PackingWithdrawalDesk,
  type PackingWithdrawalOutcome,
} from "../../../../../packing/channels/commerce/index.js";
import {
  OrderInscriptionReader,
  OrderWithdrawalDesk,
  type OrderWithdrawalAllowance,
  type OrderWithdrawalOutcome,
  type ServiceDay,
} from "../../../../../production/channels/commerce/index.js";
import type { CancellationAllowance } from "../../../domain/services/cancellation-allowance.js";
import { OrderWorkshopWithdrawal } from "../../services/order-workshop-withdrawal.js";
import {
  AccountOrderEngagement,
  type AccountEngagement,
} from "../../../domain/ports/account-order-engagement.js";
import { DeliveryNoteFollowing } from "../../../domain/ports/delivery-note-following.js";
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
    orderNumber: "ORD-0001",
    placedByUserId: "usr_1",
    companyId: null,
    fulfillmentMethod: "pickup",
    status: "placed",
    paymentStatus: "pending",
    totalCents: 2_110,
    serviceDay: "2026-10-13",
    cancelledAt: null,
    stripePaymentIntentId: "pi_1",
    loyaltyVoucherId: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    ...overrides,
  };
}

/** La lecture sans verrou : la commande telle qu'elle est au premier regard. */
export class FixedSubjects extends CancellationSubjectReader {
  constructor(
    private readonly subject: CancellationSubject | null,
    /** D'autres commandes, par id — celle qui porte un reliquat (lot C3b, cas 5). */
    private readonly others: Readonly<Record<string, CancellationSubject>> = {},
  ) {
    super();
  }

  find(orderId: string): Promise<CancellationSubject | null> {
    return Promise.resolve(this.others[orderId] ?? this.subject);
  }
}

/** Le fournil doublé : le jour où il a inscrit chaque commande, ou rien. */
export class FixedInscriptions extends OrderInscriptionReader {
  constructor(private readonly days: Readonly<Record<string, string>> = {}) {
    super();
  }

  inscribedDayOf(orderId: string): Promise<string | null> {
    return Promise.resolve(this.days[orderId] ?? null);
  }
}

/**
 * La ligne `orders`, en mémoire, avec la sémantique du `where` conditionné :
 * seule une `placed` en carte non encaissée ou à total nul franchit — et une
 * `confirmed` sous `before_packing` (plan A1).
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

  cancel(
    orderId: string,
    record: CancellationRecord,
    allowance: CancellationAllowance,
  ): Promise<boolean> {
    this.trace.push(`cancel:${orderId}`);
    const current = this.current;
    const reachable =
      current !== null &&
      (current.status === "placed" ||
        (allowance.allowance === "before_packing" && current.status === "confirmed"));
    if (this.refuseWrite || current === null || !reachable) {
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
  /** L'autorisation reçue à chaque retrait (plan A1). */
  readonly allowances: OrderWithdrawalAllowance[] = [];

  constructor(
    private readonly outcome: OrderWithdrawalOutcome = "withdrawn",
    private readonly trace: string[] = [],
  ) {
    super();
  }

  withdraw(
    day: ServiceDay,
    orderId: string,
    allowance: OrderWithdrawalAllowance,
  ): Promise<OrderWithdrawalOutcome> {
    this.trace.push(`withdraw:${day.value}:${orderId}`);
    this.allowances.push(allowance);
    return Promise.resolve(this.outcome);
  }
}

/** Le guichet du colisage (plan A1) : une issue écrite d'avance, et les retraits demandés. */
export class ScriptedPackingDesk extends PackingWithdrawalDesk {
  readonly calls: { readonly day: string; readonly orderId: string; readonly by: string }[] = [];

  constructor(
    private readonly outcome: PackingWithdrawalOutcome = "withdrawn",
    private readonly trace: string[] = [],
  ) {
    super();
  }

  withdraw(day: string, orderId: string, withdrawnBy: string): Promise<PackingWithdrawalOutcome> {
    this.trace.push(`packing:${day}:${orderId}`);
    this.calls.push({ day, orderId, by: withdrawnBy });
    return Promise.resolve(this.outcome);
  }
}

/** Les deux ateliers, doublés ensemble — le fournil puis le colisage. */
export function workshops(
  bakery: OrderWithdrawalDesk = new ScriptedDesk(),
  packing: PackingWithdrawalDesk = new ScriptedPackingDesk(),
): OrderWorkshopWithdrawal {
  return new OrderWorkshopWithdrawal(bakery, packing);
}

/**
 * La comptabilité doublée (lot C5) : l'engagement lu HORS verrou, puis SOUS
 * verrou (`underLock`, s'il diffère — un lot constitué entre les deux), et
 * les fermetures demandées. Tracé dans l'ordre des gestes.
 */
export class ScriptedEngagements extends AccountOrderEngagement {
  readonly closed: { orderId: string; amountCents: number; at: Date }[] = [];
  private reads = 0;

  constructor(
    private readonly first: AccountEngagement | null = { kind: "free" },
    private readonly trace: string[] = [],
    private readonly underLock: AccountEngagement | null = first,
  ) {
    super();
  }

  engagementOf(orderId: string): Promise<AccountEngagement | null> {
    this.trace.push(`engagement:${orderId}`);
    this.reads += 1;
    return Promise.resolve(this.reads === 1 ? this.first : this.underLock);
  }

  closeForCancellation(orderId: string, amountCents: number, at: Date): Promise<void> {
    this.trace.push(`close:${orderId}`);
    this.closed.push({ orderId, amountCents, at });
    return Promise.resolve();
  }
}

/**
 * Le bon de livraison doublé (plans E1, E2) : les annulations de BL non remis
 * demandées. Les autres gestes du port ne sont pas ceux de l'annulation. Hors de la `trace` partagée par défaut, pour que les suites
 * d'avant E1 gardent leurs séquences ; une `trace` passée l'y inscrit.
 */
export class RecordingNoteVoiding extends DeliveryNoteFollowing {
  readonly voided: { orderId: string; at: Date }[] = [];

  constructor(private readonly trace: string[] | null = null) {
    super();
  }

  voidLiveFor(orderId: string, at: Date): Promise<void> {
    this.trace?.push(`void-note:${orderId}`);
    this.voided.push({ orderId, at });
    return Promise.resolve();
  }

  planConfirmed(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'annulation"));
  }

  prepare(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'annulation"));
  }

  handOver(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'annulation"));
  }

  followRevision(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'annulation"));
  }

  followDecision(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par l'annulation"));
  }
}
