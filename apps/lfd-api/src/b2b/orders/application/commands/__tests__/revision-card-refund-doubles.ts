import {
  type AmountRefundRequest,
  type CardPaymentLine,
  CardRefunds,
  type CardSettlementPosition,
  CardSettlementReader,
  type OpenCardRefundRequest,
  type RequestedCardRefund,
  type SubjectCardRefundRequests,
  type SubjectCardRefunds,
  type SucceededCardRefund,
} from "../../../../../card-payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../card-payment/channels/subjects/index.js";
import type { CardIncreaseProposal } from "../../../domain/entities/card-increase-proposal.js";
import { CardIncreaseProposalReader } from "../../../domain/ports/card-increase-proposal.reader.js";
import { CardIncreaseProposalRepository } from "../../../domain/ports/card-increase-proposal.repository.js";
import { OrderCardAdoption } from "../../../domain/ports/order-card-payments.js";
import { RevisionCardRefund } from "../../services/revision-card-refund.js";

/**
 * Doubles de l'argent d'une baisse carte dans M1 (plan
 * `documentation/commandes/modification/plan-s1-la-baisse.md`, R3 à R6),
 * écrits à la main en héritant des ports. Chaque geste est posé au `trace`
 * de la scène de révision : l'ordre lire → refuser → écrire → demander se
 * lit dessus.
 */

/** Ce que le bloc carte et les projets rendent pour la commande de la scène. */
export interface CardRefundSetup {
  /** Le projet vivant (`awaiting_payment | ready | stalled`), hors verrou puis sous lui. */
  readonly live?: CardIncreaseProposal | null;
  /** Né entre la lecture hors verrou et le verrou : seul `lockLiveOf` le voit. */
  readonly liveUnderLock?: CardIncreaseProposal | null;
  /** Les paiements du sujet, du plus ancien au plus récent. */
  readonly payments?: readonly CardPaymentLine[];
  /** Le reste de chaque paiement ; absent = son montant entier. */
  readonly remainders?: Readonly<Record<string, number>>;
  readonly openRequests?: readonly OpenCardRefundRequest[];
  /** Les paiements des compléments `applied`. */
  readonly applied?: readonly string[];
  /** Le premier paiement que l'adoption rend ; `undefined` = celui de `payments`. */
  readonly adoptedFirst?: CardPaymentLine | null;
}

/** Un paiement encaissé du sujet. */
export function paidLine(
  paymentId: string,
  amountCents: number,
  role: CardPaymentLine["role"] = "first",
): CardPaymentLine {
  return {
    paymentId,
    account: "lfc-stripe",
    providerRef: `pi_${paymentId}`,
    role,
    state: "paid",
    amountCents,
    paidAt: null,
  };
}

/** Les projets lus sans verrou. */
class SetupProposalReader extends CardIncreaseProposalReader {
  constructor(
    private readonly setup: CardRefundSetup,
    private readonly trace: string[],
  ) {
    super();
  }

  liveOf(orderId: string): Promise<CardIncreaseProposal | null> {
    this.trace.push(`liveOf:${orderId}`);
    return Promise.resolve(this.setup.live ?? null);
  }

  find(): Promise<CardIncreaseProposal | null> {
    return Promise.resolve(null);
  }

  appliedPaymentsOf(orderId: string): Promise<readonly string[]> {
    this.trace.push(`appliedPaymentsOf:${orderId}`);
    return Promise.resolve(this.setup.applied ?? []);
  }
}

/** Le dépôt des projets : seul `lockLiveOf` sert M1. */
class SetupProposalRepository extends CardIncreaseProposalRepository {
  constructor(
    private readonly setup: CardRefundSetup,
    private readonly trace: string[],
  ) {
    super();
  }

  lockByPayment(): Promise<CardIncreaseProposal | null> {
    return Promise.reject(new Error("lockByPayment : hors du périmètre de M1"));
  }

  lockLiveOf(orderId: string): Promise<CardIncreaseProposal | null> {
    this.trace.push(`lockLiveOf:${orderId}`);
    return Promise.resolve(this.setup.liveUnderLock ?? this.setup.live ?? null);
  }

  save(): Promise<boolean> {
    return Promise.reject(new Error("save : M1 n'écrit aucun projet"));
  }
}

/** L'adoption du premier paiement. */
class SetupAdoption extends OrderCardAdoption {
  constructor(
    private readonly setup: CardRefundSetup,
    private readonly trace: string[],
  ) {
    super();
  }

  ensureFirst(orderId: string): Promise<CardPaymentLine | null> {
    this.trace.push(`ensureFirst:${orderId}`);
    if (this.setup.adoptedFirst !== undefined) {
      return Promise.resolve(this.setup.adoptedFirst);
    }
    return Promise.resolve(this.setup.payments?.find((line) => line.role === "first") ?? null);
  }
}

/** La position du sujet et les restes, tels que posés. */
class SetupPositions extends CardSettlementReader {
  constructor(
    private readonly setup: CardRefundSetup,
    private readonly trace: string[],
  ) {
    super();
  }

  positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    this.trace.push("positionOf");
    return Promise.resolve(
      subjects.map((subject) => ({
        subject,
        payments: this.setup.payments ?? [],
        chargedCents: 0,
        refundedCents: 0,
        refundedByNature: { return: 0, adjustment: 0, unattributed: 0 },
        inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
        openRequests: this.setup.openRequests ?? [],
      })),
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

  remainderOf(paymentId: string): Promise<number> {
    this.trace.push(`remainderOf:${paymentId}`);
    const line = this.setup.payments?.find((each) => each.paymentId === paymentId);
    return Promise.resolve(this.setup.remainders?.[paymentId] ?? line?.amountCents ?? 0);
  }
}

/** Les demandes `amount`, notées dans l'ordre. */
export class RecordingAmountRefunds extends CardRefunds {
  readonly amounts: AmountRefundRequest[] = [];

  constructor(private readonly trace: string[]) {
    super();
  }

  requestRemainder(): Promise<readonly RequestedCardRefund[]> {
    return Promise.reject(new Error("requestRemainder : une baisse rend un montant"));
  }

  requestAmount(request: AmountRefundRequest): Promise<RequestedCardRefund> {
    this.trace.push(`requestAmount:${request.paymentId}:${String(request.amountCents)}`);
    this.amounts.push(request);
    return Promise.resolve({
      requestId: `req_${String(this.amounts.length)}`,
      paymentId: request.paymentId,
      form: "amount",
      announcedCents: request.amountCents,
      state: "to_issue",
    });
  }

  retry(): Promise<void> {
    return Promise.reject(new Error("retry : hors du périmètre de M1"));
  }
}

/** Le service de M1 monté sur ces doubles, et ses demandes. */
export function cardRefundOf(setup: CardRefundSetup, trace: string[]) {
  const refunds = new RecordingAmountRefunds(trace);
  const service = new RevisionCardRefund(
    new SetupProposalReader(setup, trace),
    new SetupProposalRepository(setup, trace),
    new SetupAdoption(setup, trace),
    new SetupPositions(setup, trace),
    refunds,
  );
  return { service, refunds };
}
