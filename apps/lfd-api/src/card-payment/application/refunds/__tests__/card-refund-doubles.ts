import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  CardSettlementReader,
  type CardSettlementPosition,
  type SubjectCardRefundRequests,
  type SubjectCardRefunds,
  type SucceededCardRefund,
} from "../../../channels/requests/card-settlement.reader.js";
import type { CardSubject } from "../../../channels/subjects/index.js";
import {
  CardRefundLedger,
  type CardRefundLine,
} from "../../../domain/entities/card-refund-ledger.js";
import {
  CardRefundRequest,
  type CardRefundRequestSnapshot,
} from "../../../domain/entities/card-refund-request.js";
import { CardRefundRequestConflictError } from "../../../domain/errors/card-refund-errors.js";
import { CardRefundLedgerRepository } from "../../../domain/ports/card-refund-ledger.repository.js";
import { CardRefundRequestLease } from "../../../domain/ports/card-refund-request.lease.js";
import { CardRefundRequestRepository } from "../../../domain/ports/card-refund-request.repository.js";
import { CardRefundSweepReader } from "../../../domain/ports/card-refund-sweep.reader.js";
import { refundableCentsOf } from "../../../domain/services/refund-siblings.js";
import type { PaymentSubject } from "../../../domain/value-objects/payment-subject.js";
import { positionFrom } from "../../../infrastructure/settlement-position.js";
import type { InMemoryCardPayments, Timeline } from "../../__tests__/card-payment-doubles.js";
import { CardRefundDispatch } from "../card-refund-dispatch.js";

/**
 * **Le carnet et les demandes en mémoire** (plan M2, lot P1.b), écrits à la
 * main en héritant des ports — jamais `jest.fn()`. Ils lisent les paiements du
 * double `InMemoryCardPayments`, notent leurs verrous dans la chronologie
 * commune (l'ORDRE du §3.6 est le sujet de plusieurs tests), et tiennent les
 * mêmes conditions que la base : l'écriture conditionnée de la demande, et
 * l'index « une seule `remainder` en cours par paiement ».
 */
export class RefundStore {
  readonly lines = new Map<string, CardRefundLine[]>();
  readonly requests = new Map<string, CardRefundRequestSnapshot>();

  constructor(
    readonly payments: InMemoryCardPayments,
    readonly timeline: Timeline,
  ) {}

  linesOf(paymentId: string): readonly CardRefundLine[] {
    return this.lines.get(paymentId) ?? [];
  }

  request(id: string): CardRefundRequestSnapshot | undefined {
    return this.requests.get(id);
  }

  /** Une demande posée telle quelle, comme si elle avait été écrite avant. */
  seedRequest(snapshot: CardRefundRequestSnapshot): void {
    this.requests.set(snapshot.id, snapshot);
  }

  /** L'index unique partiel `refund_request_remainder_in_progress_key`, comme la base. */
  assertOneRemainderInProgress(next: CardRefundRequestSnapshot): void {
    const clash = [...this.requests.values()].some(
      (other) =>
        other.id !== next.id &&
        other.paymentId === next.paymentId &&
        other.form === "remainder" &&
        next.form === "remainder" &&
        ["to_issue", "issued"].includes(other.state) &&
        ["to_issue", "issued"].includes(next.state),
    );
    if (clash) {
      throw new Error(`refund_request_remainder_in_progress_key : ${next.paymentId}`);
    }
  }
}

export class StoreLedgers extends CardRefundLedgerRepository {
  constructor(private readonly store: RefundStore) {
    super();
  }

  subjectOf(paymentId: string): Promise<PaymentSubject | null> {
    return Promise.resolve(this.store.payments.rows.get(paymentId)?.subject ?? null);
  }

  loadByPayment(paymentId: string): Promise<CardRefundLedger | null> {
    this.store.timeline.note(`payment.lock:${paymentId}`);
    const payment = this.store.payments.rows.get(paymentId);
    if (payment === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      CardRefundLedger.rehydrate({
        paymentId,
        subject: payment.subject,
        account: payment.account.name,
        paymentRef: payment.providerRef,
        amountCents: payment.amountCents,
        paid: payment.state === "paid",
        lines: this.store.linesOf(paymentId),
      }),
    );
  }

  save(ledger: CardRefundLedger): Promise<void> {
    const { created, updated } = ledger.toPersistence();
    if (created.length + updated.length > 0) {
      this.store.timeline.note(`ledger.save:${ledger.paymentId}`);
    }
    const byId = new Map(this.store.linesOf(ledger.paymentId).map((line) => [line.id, line]));
    for (const line of [...created, ...updated]) {
      byId.set(line.id, line);
    }
    this.store.lines.set(ledger.paymentId, [...byId.values()]);
    return Promise.resolve();
  }
}

export class StoreRequests extends CardRefundRequestRepository {
  constructor(private readonly store: RefundStore) {
    super();
  }

  paymentOf(requestId: string): Promise<string | null> {
    return Promise.resolve(this.store.request(requestId)?.paymentId ?? null);
  }

  load(requestId: string): Promise<CardRefundRequest | null> {
    this.store.timeline.note(`request.load:${requestId}`);
    const row = this.store.request(requestId);
    return Promise.resolve(row === undefined ? null : CardRefundRequest.rehydrate(row));
  }

  ofPayment(paymentId: string): Promise<readonly CardRefundRequest[]> {
    return Promise.resolve(
      [...this.store.requests.values()]
        .filter((row) => row.paymentId === paymentId)
        .sort(
          (a, b) => a.requestedAt.getTime() - b.requestedAt.getTime() || a.id.localeCompare(b.id),
        )
        .map((row) => CardRefundRequest.rehydrate(row)),
    );
  }

  save(request: CardRefundRequest): Promise<void> {
    const { state, expected } = request.toPersistence();
    const stored = this.store.request(state.id);
    if (
      expected !== null &&
      (stored === undefined ||
        stored.generation !== expected.generation ||
        stored.claimToken !== expected.claimToken)
    ) {
      throw new CardRefundRequestConflictError(state.id);
    }
    this.write(state);
    return Promise.resolve();
  }

  transition(request: CardRefundRequest): Promise<boolean> {
    const { state, expected } = request.toPersistence();
    const stored = this.store.request(state.id);
    if (
      expected === null ||
      stored === undefined ||
      stored.state !== expected.state ||
      stored.generation !== expected.generation
    ) {
      return Promise.resolve(false);
    }
    this.write({ ...state, claimedUntil: stored.claimedUntil, claimToken: stored.claimToken });
    return Promise.resolve(true);
  }

  private write(state: CardRefundRequestSnapshot): void {
    this.store.assertOneRemainderInProgress(state);
    this.store.timeline.note(`request.save:${state.id}:${state.state}`);
    this.store.requests.set(state.id, state);
  }
}

export class StoreLease extends CardRefundRequestLease {
  constructor(private readonly store: RefundStore) {
    super();
  }

  claim(requestId: string, token: string, until: Date, wallNow: Date): Promise<boolean> {
    const row = this.store.request(requestId);
    const free =
      row !== undefined &&
      row.state === "to_issue" &&
      (row.claimedUntil === null || row.claimedUntil.getTime() < wallNow.getTime());
    if (free) {
      this.store.requests.set(requestId, { ...row, claimedUntil: until, claimToken: token });
    }
    return Promise.resolve(free);
  }
}

export class StoreSweep extends CardRefundSweepReader {
  constructor(private readonly store: RefundStore) {
    super();
  }

  dueForSweep(wallNow: Date, limit: number): Promise<readonly string[]> {
    return Promise.resolve(
      [...this.store.requests.values()]
        .filter(
          (row) =>
            row.state === "to_issue" &&
            row.nextAttemptAt !== null &&
            row.nextAttemptAt.getTime() <= wallNow.getTime(),
        )
        .slice(0, limit)
        .map((row) => row.id),
    );
  }
}

/** Les positions, calculées par LA fonction du lecteur réel sur ce que la mémoire porte. */
export class StorePositions extends CardSettlementReader {
  constructor(private readonly store: RefundStore) {
    super();
  }

  positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    return Promise.resolve(
      subjects.map((subject) => {
        const payments = [...this.store.payments.rows.values()].filter(
          (payment) => payment.subject.type === subject.type && payment.subject.id === subject.id,
        );
        const ids = new Set(payments.map((payment) => payment.id));
        return positionFrom(subject, {
          payments: payments.map((payment) => ({
            paymentId: payment.id,
            account: payment.account.name,
            providerRef: payment.providerRef,
            role: payment.role,
            state: payment.state,
            amountCents: payment.amountCents,
            paidAt: payment.paidAt,
          })),
          refunds: [...ids].flatMap((id) => this.store.linesOf(id)),
          requests: [...this.store.requests.values()]
            .filter((row) => ids.has(row.paymentId))
            .map((row) => CardRefundRequest.rehydrate(row)),
        });
      }),
    );
  }

  succeededRefundsOf(): Promise<readonly SucceededCardRefund[]> {
    return Promise.resolve([]);
  }

  refundsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectCardRefunds[]> {
    return Promise.resolve(subjects.map((subject) => ({ subject, refunds: [] })));
  }

  refundRequestsOf(
    subjects: readonly CardSubject[],
  ): Promise<readonly SubjectCardRefundRequests[]> {
    return Promise.resolve(subjects.map((subject) => ({ subject, requests: [] })));
  }

  /** Le reste d'un paiement, par LA règle du lecteur réel (`refundableCentsOf`). */
  remainderOf(paymentId: string): Promise<number> {
    const payment = this.store.payments.rows.get(paymentId);
    if (payment === undefined) {
      return Promise.resolve(0);
    }
    const ledger = CardRefundLedger.rehydrate({
      paymentId,
      subject: payment.subject,
      account: payment.account.name,
      paymentRef: payment.providerRef,
      amountCents: payment.amountCents,
      paid: payment.state === "paid",
      lines: this.store.linesOf(paymentId),
    });
    const siblings = [...this.store.requests.values()]
      .filter((row) => row.paymentId === paymentId)
      .map((row) => CardRefundRequest.rehydrate(row));
    return Promise.resolve(refundableCentsOf(ledger, siblings));
  }
}

/** La cloche, enregistrée. */
export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }

  keys(): string[] {
    return this.notices.map((notice) => notice.idempotencyKey);
  }
}

/** Le départ de l'exécuteur, noté : après validation, ou tout de suite (le balayage). */
export class RecordingDispatch extends CardRefundDispatch {
  readonly afterCommit: string[] = [];
  readonly now: string[] = [];
  /** Ce que `issueNow` fait ; par défaut rien. */
  issue: (requestId: string) => Promise<void> = () => Promise.resolve();

  afterCommitFor(requestId: string): void {
    this.afterCommit.push(requestId);
  }

  issueNow(requestId: string): Promise<void> {
    this.now.push(requestId);
    return this.issue(requestId);
  }
}
