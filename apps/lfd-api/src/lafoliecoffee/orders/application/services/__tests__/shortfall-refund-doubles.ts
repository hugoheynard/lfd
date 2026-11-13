import {
  type AmountRefundRequest,
  type CardPaymentLine,
  CardRefunds,
  type CardSettlementPosition,
  CardSettlementReader,
  type RequestedCardRefund,
  type SubjectCardRefundRequests,
  type SubjectCardRefunds,
  type SucceededCardRefund,
} from "../../../../../card-payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../card-payment/channels/subjects/index.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { OrderCardAdoption } from "../../../domain/ports/order-card-payments.js";
import type { CardIncreaseProposal } from "../../../revision/domain/entities/card-increase-proposal.js";
import { CardIncreaseProposalReader } from "../../../revision/domain/ports/card-increase-proposal.reader.js";
import {
  ShortfallRefundSubjectLock,
  ShortfallRefundSubjectReader,
} from "../../../domain/ports/shortfall-refund-subject.js";
import type { ShortfallRefundSubject } from "../../../domain/services/shortfall-refund.js";
import { cardRefundRequest } from "../../commands/__tests__/refund-doubles.js";
import { RefundablePayments } from "../refundable-payments.js";
import { ShortfallRefundMoneyReader } from "../shortfall-refund-money.js";
import { ShortfallRefunding } from "../shortfall-refunding.js";

/**
 * **Les doubles du reste d'un départ incomplet** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2) — la
 * commande verrouillée, et le bloc `card-payment` joué par UN carnet en
 * mémoire : une demande écrite par `requestAmount` est relue par la position
 * suivante, ce qui rend le rejeu observable.
 */

/** La commande décidée, encaissée, soldée à 600 ; chaque relecture est tracée. */
export function refundSubject(
  overrides: Partial<ShortfallRefundSubject> = {},
): ShortfallRefundSubject {
  return {
    orderId: "ord_1",
    reference: "ORD-0001",
    partial: true,
    regime: "paid",
    billableTotalCents: 600,
    invoiced: false,
    increasePending: false,
    ...overrides,
  };
}

export class FixedShortfallRefundSubjects
  implements ShortfallRefundSubjectLock, ShortfallRefundSubjectReader
{
  constructor(
    public subject: ShortfallRefundSubject | null,
    private readonly trace: string[] = [],
  ) {}

  lock(orderId: string): Promise<ShortfallRefundSubject | null> {
    this.trace.push(`lock:${orderId}`);
    return Promise.resolve(this.subject);
  }

  read(orderId: string): Promise<ShortfallRefundSubject | null> {
    this.trace.push(`read:${orderId}`);
    return Promise.resolve(this.subject);
  }
}

/** Une demande du carnet, telle que le double la garde. */
export interface LedgerRequest {
  readonly id: string;
  readonly paymentId: string;
  readonly nature: "return" | "adjustment";
  readonly state: "to_issue" | "issued" | "refunded" | "stopped" | "settled_elsewhere";
  readonly reason: string;
  readonly announcedCents: number;
}

const OPEN = new Set(["to_issue", "issued", "stopped"]);

/** Le carnet carte de la commande : paiements, réussis, demandes. */
export class CardMoneyLedger extends CardSettlementReader {
  readonly requests: LedgerRequest[] = [];
  readonly succeeded: SucceededCardRefund[] = [];

  constructor(readonly payments: CardPaymentLine[]) {
    super();
  }

  positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    const byNature = { return: 0, adjustment: 0, unattributed: 0 };
    for (const refund of this.succeeded) {
      byNature[refund.nature ?? "unattributed"] += refund.amountCents;
    }
    const charged = this.payments
      .filter((payment) => payment.state === "paid")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    return Promise.resolve(
      subjects.map((subject) => ({
        subject,
        payments: this.payments,
        chargedCents: charged,
        refundedCents: byNature.return + byNature.adjustment + byNature.unattributed,
        refundedByNature: byNature,
        inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
        openRequests: this.requests
          .filter((request) => OPEN.has(request.state))
          .map((request) => ({
            requestId: request.id,
            paymentId: request.paymentId,
            form: "amount" as const,
            nature: request.nature,
            state: request.state,
          })),
      })),
    );
  }

  succeededRefundsOf(): Promise<readonly SucceededCardRefund[]> {
    return Promise.resolve(this.succeeded);
  }

  refundsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectCardRefunds[]> {
    return Promise.resolve(subjects.map((subject) => ({ subject, refunds: [] })));
  }

  refundRequestsOf(
    subjects: readonly CardSubject[],
  ): Promise<readonly SubjectCardRefundRequests[]> {
    return Promise.resolve(
      subjects.map((subject) => ({
        subject,
        requests: this.requests.map((request) =>
          cardRefundRequest({
            id: request.id,
            paymentId: request.paymentId,
            form: "amount",
            nature: request.nature,
            state: request.state,
            reason: request.reason,
            announcedCents: request.announcedCents,
          }),
        ),
      })),
    );
  }

  /** Encaissé − réussi − annoncé par les demandes ouvertes, comme le bloc. */
  remainderOf(paymentId: string): Promise<number> {
    const payment = this.payments.find((line) => line.paymentId === paymentId);
    if (payment?.state !== "paid") {
      return Promise.resolve(0);
    }
    const refunded = this.succeeded
      .filter((refund) => refund.paymentId === paymentId)
      .reduce((sum, refund) => sum + refund.amountCents, 0);
    const announced = this.requests
      .filter((request) => request.paymentId === paymentId && OPEN.has(request.state))
      .reduce((sum, request) => sum + request.announcedCents, 0);
    return Promise.resolve(Math.max(0, payment.amountCents - refunded - announced));
  }
}

/** Un paiement de la position ; instants comparés à rien. */
export function paidLine(
  paymentId: string,
  amountCents: number,
  overrides: Partial<CardPaymentLine> = {},
): CardPaymentLine {
  return {
    paymentId,
    account: "lfc-stripe",
    providerRef: `pi_${paymentId}`,
    role: "first",
    state: "paid",
    amountCents,
    paidAt: null,
    ...overrides,
  };
}

/** `requestAmount` écrit au carnet ; `failOn` fait lever le n-ième appel (1 = le premier). */
export class LedgerCardRefunds extends CardRefunds {
  readonly amounts: AmountRefundRequest[] = [];

  constructor(
    private readonly ledger: CardMoneyLedger,
    private readonly trace: string[] = [],
    private readonly failOn: number | null = null,
  ) {
    super();
  }

  requestRemainder(): Promise<readonly RequestedCardRefund[]> {
    return Promise.reject(new Error("requestRemainder : hors du périmètre de ces doubles"));
  }

  requestAmount(request: AmountRefundRequest): Promise<RequestedCardRefund> {
    this.trace.push(`request:${request.paymentId}:${String(request.amountCents)}`);
    if (this.failOn === this.amounts.length + 1) {
      return Promise.reject(new Error("refus du bloc carte, forcé"));
    }
    this.amounts.push(request);
    const id = `req_${String(this.ledger.requests.length + 1)}`;
    this.ledger.requests.push({
      id,
      paymentId: request.paymentId,
      nature: request.nature,
      state: "to_issue",
      reason: request.reason,
      announcedCents: request.amountCents,
    });
    return Promise.resolve({
      requestId: id,
      paymentId: request.paymentId,
      form: "amount",
      announcedCents: request.amountCents,
      state: "to_issue",
    });
  }

  retry(): Promise<void> {
    return Promise.reject(new Error("retry : hors du périmètre de ces doubles"));
  }
}

/** Le premier paiement, adopté : l'appel est tracé, le paiement est celui du carnet. */
export class LedgerAdoption extends OrderCardAdoption {
  constructor(
    private readonly ledger: CardMoneyLedger,
    private readonly trace: string[] = [],
  ) {
    super();
  }

  ensureFirst(orderId: string): Promise<CardPaymentLine | null> {
    this.trace.push(`adopt:${orderId}`);
    return Promise.resolve(this.ledger.payments.find((line) => line.role === "first") ?? null);
  }
}

/** Les compléments `applied` de la commande : les seuls qui se rendent avec le premier paiement. */
export class AppliedProposals extends CardIncreaseProposalReader {
  constructor(private readonly applied: readonly string[] = []) {
    super();
  }

  liveOf(): Promise<CardIncreaseProposal | null> {
    return Promise.resolve(null);
  }

  find(): Promise<CardIncreaseProposal | null> {
    return Promise.resolve(null);
  }

  appliedPaymentsOf(): Promise<readonly string[]> {
    return Promise.resolve(this.applied);
  }
}

/** La scène montée : le service des deux phases sur le carnet, la trace et le journal. */
export function shortfallRefundScene(
  subject: ShortfallRefundSubject | null,
  payments: CardPaymentLine[] = [paidLine("pay_1", 1_000)],
  failOn: number | null = null,
  applied: readonly string[] = [],
) {
  const trace: string[] = [];
  const ledger = new CardMoneyLedger(payments);
  const subjects = new FixedShortfallRefundSubjects(subject, trace);
  const refunds = new LedgerCardRefunds(ledger, trace, failOn);
  const journal = new RecordingJournal();
  const money = new ShortfallRefundMoneyReader(
    new RefundablePayments(
      new LedgerAdoption(ledger, trace),
      new AppliedProposals(applied),
      ledger,
    ),
    ledger,
  );
  const refunding = new ShortfallRefunding(subjects, money, refunds, journal);
  return { trace, ledger, subjects, refunds, journal, money, refunding };
}
