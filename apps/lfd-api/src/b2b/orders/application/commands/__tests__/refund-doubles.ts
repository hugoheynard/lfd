import { currentTransaction } from "../../../../../platform/database/transaction.store.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  PaymentRefunder,
  type IssuedRefund,
  type RefundIssuance,
  type RefundLookup,
  type RefundRequestParams,
} from "../../../../payments/domain/payment-refunder.js";
import {
  OrderRefundLedger,
  type LedgerPaymentStatus,
} from "../../../domain/entities/order-refund-ledger.js";
import type { OrderRefundState } from "../../../domain/entities/order-refund.js";
import {
  OrderRefundRequest,
  type OrderRefundRequestState,
} from "../../../domain/entities/order-refund-request.js";
import { RefundRequestConflictError } from "../../../domain/errors/order-refund-request-errors.js";
import { OrderRefundRequestLease } from "../../../domain/ports/order-refund-request.lease.js";
import {
  OrderRefundRequestReader,
  type RefundRequestSnapshot,
} from "../../../domain/ports/order-refund-request.reader.js";
import { OrderRefundRequestRepository } from "../../../domain/ports/order-refund-request.repository.js";
import { OrderRefundRepository } from "../../../domain/ports/order-refund.repository.js";
import { OrderRefundDispatch } from "../../services/order-refund-dispatch.js";

/**
 * Doubles du lot C4 (la demande de remboursement), écrits à la main en
 * héritant des ports — jamais `jest.fn()`. Ils partagent UN magasin
 * ({@link RefundStore}) : une seule commande, son carnet et sa demande, avec
 * la sémantique des écritures conditionnées de l'adaptateur Prisma.
 */

export const ORDER_ID = "ord_1";
export const INTENT = "pi_1";

/** La commande, son carnet et sa demande — ce que la base porterait. */
export class RefundStore {
  request: OrderRefundRequestState | null = null;
  refunds: OrderRefundState[] = [];
  paymentStatus: LedgerPaymentStatus = "paid";
  readonly trace: string[] = [];

  constructor(readonly chargedCents = 2_340) {}

  /** Une demande neuve, due dès `at` — l'instant de l'annulation. */
  seedRequest(at: Date, overrides: Partial<OrderRefundRequestState> = {}): void {
    const fresh = OrderRefundRequest.request({
      orderId: ORDER_ID,
      cause: "cancellation",
      announcedCents: this.chargedCents,
      requestedAt: at,
      requestedBy: "fiche-marie",
      firstAttemptAt: at,
    }).toPersistence().state;
    this.request = { ...fresh, ...overrides };
  }
}

export class InMemoryRefundRequests extends OrderRefundRequestRepository {
  constructor(private readonly store: RefundStore) {
    super();
  }

  load(orderId: string): Promise<OrderRefundRequest | null> {
    const state = orderId === ORDER_ID ? this.store.request : null;
    return Promise.resolve(state === null ? null : OrderRefundRequest.reconstitute(state));
  }

  save(request: OrderRefundRequest): Promise<void> {
    const { state, expected } = request.toPersistence();
    const current = this.store.request;
    if (expected === null ? current !== null : !matches(current, expected)) {
      return Promise.reject(new RefundRequestConflictError(state.orderId));
    }
    this.store.trace.push(`save:g${String(state.generation)}:r${String(state.round)}`);
    this.store.request = state;
    return Promise.resolve();
  }
}

function matches(
  current: OrderRefundRequestState | null,
  expected: { readonly generation: number; readonly claimToken: string | null },
): boolean {
  return (
    current !== null &&
    current.generation === expected.generation &&
    current.claimToken === expected.claimToken
  );
}

export class InMemoryLease extends OrderRefundRequestLease {
  constructor(private readonly store: RefundStore) {
    super();
  }

  claim(orderId: string, token: string, until: Date, wallNow: Date): Promise<boolean> {
    const current = this.store.request;
    const free =
      current !== null &&
      orderId === ORDER_ID &&
      (current.claimedUntil === null || current.claimedUntil.getTime() < wallNow.getTime());
    if (!free) {
      return Promise.resolve(false);
    }
    this.store.trace.push(`claim:${token}`);
    this.store.request = { ...current, claimedUntil: until, claimToken: token };
    return Promise.resolve(true);
  }
}

export class InMemoryRefundReader extends OrderRefundRequestReader {
  constructor(
    private readonly store: RefundStore,
    private readonly intent: string | null = INTENT,
  ) {
    super();
  }

  dueForSweep(wallNow: Date, limit: number): Promise<readonly string[]> {
    const request = this.store.request;
    const due =
      request !== null &&
      request.stripeRefundId === null &&
      request.nextAttemptAt !== null &&
      request.nextAttemptAt.getTime() <= wallNow.getTime();
    return Promise.resolve(due ? [ORDER_ID].slice(0, limit) : []);
  }

  paymentIntentOf(): Promise<string | null> {
    return Promise.resolve(this.intent);
  }

  snapshotOf(orderId: string): Promise<RefundRequestSnapshot | null> {
    const request = this.store.request;
    if (orderId !== ORDER_ID || request === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      request,
      orderNumber: "CMD-0001",
      chargedCents: this.store.chargedCents,
      refunds: this.store.refunds,
    });
  }
}

export class InMemoryLedgers extends OrderRefundRepository {
  constructor(private readonly store: RefundStore) {
    super();
  }

  loadByPaymentIntent(paymentIntentId: string): Promise<OrderRefundLedger | null> {
    return paymentIntentId === INTENT ? this.loadByOrder(ORDER_ID) : Promise.resolve(null);
  }

  loadByOrder(orderId: string): Promise<OrderRefundLedger | null> {
    if (orderId !== ORDER_ID) {
      return Promise.resolve(null);
    }
    this.store.trace.push("lock:orders");
    return Promise.resolve(
      OrderRefundLedger.reconstitute({
        orderId: ORDER_ID,
        orderNumber: "CMD-0001",
        chargedCents: this.store.chargedCents,
        paymentStatus: this.store.paymentStatus,
        refunds: this.store.refunds,
      }),
    );
  }

  save(ledger: OrderRefundLedger): Promise<void> {
    const { paymentStatus, refunds } = ledger.toPersistence();
    this.store.paymentStatus = paymentStatus;
    this.store.refunds = [...refunds];
    return Promise.resolve();
  }
}

/**
 * Stripe : des issues écrites d'avance, rendues dans l'ordre, et les appels
 * vus. 🔴 Refuse d'être appelé sous une transaction ambiante (C4.7).
 */
export class ScriptedRefunder extends PaymentRefunder {
  readonly calls: RefundRequestParams[] = [];
  readonly lookups: RefundRequestParams[] = [];
  /** Joué pendant l'appel — pour faire avancer l'horloge murale, par exemple. */
  during: (() => void) | null = null;

  constructor(
    private readonly issuances: RefundIssuance[],
    private readonly found: RefundLookup = { kind: "none" },
  ) {
    super();
  }

  refundRemainder(params: RefundRequestParams): Promise<RefundIssuance> {
    if (currentTransaction() !== undefined) {
      return Promise.reject(new Error("Stripe appelé sous une transaction"));
    }
    this.calls.push(params);
    this.during?.();
    return Promise.resolve(this.issuances.shift() ?? { kind: "unavailable", reason: "épuisé" });
  }

  findRefund(params: RefundRequestParams): Promise<RefundLookup> {
    this.lookups.push(params);
    return Promise.resolve(this.found);
  }
}

/** Un `re_…` tel que Stripe le rend. Instant comparé à rien — exception étroite du §5. */
export function stripeRefund(overrides: Partial<IssuedRefund> = {}): IssuedRefund {
  return {
    refundId: "re_1",
    amountCents: 2_340,
    currency: "eur",
    status: "pending",
    createdAt: new Date(Date.UTC(2030, 0, 10, 9)),
    ...overrides,
  };
}

export class RecordingDispatch extends OrderRefundDispatch {
  readonly dispatched: string[] = [];
  readonly issued: string[] = [];

  /** `failing` : `issueNow` lève pour cette commande. */
  constructor(private readonly failing: string | null = null) {
    super();
  }

  afterCommitFor(orderId: string): void {
    this.dispatched.push(orderId);
  }

  issueNow(orderId: string): Promise<void> {
    this.issued.push(orderId);
    return orderId === this.failing ? Promise.reject(new Error("panne")) : Promise.resolve();
  }
}

export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}
