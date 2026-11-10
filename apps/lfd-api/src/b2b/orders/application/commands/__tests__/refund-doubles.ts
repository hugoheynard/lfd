import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  type AmountRefundRequest,
  type CardPaymentLine,
  type CardRefundRequestView,
  CardRefunds,
  type CardRefundTarget,
  type CardSettlementPosition,
  CardSettlementReader,
  type RemainderRefundRequest,
  type RequestedCardRefund,
  type SubjectCardRefundRequests,
  type SubjectCardRefunds,
  type SucceededCardRefund,
} from "../../../../../card-payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../card-payment/channels/subjects/index.js";
import { OrderCardAdoption } from "../../../domain/ports/order-card-payments.js";

/**
 * Doubles du remboursement par carte vu du commerce (lot C4, rebâti au lot
 * P1.c du plan M2), écrits à la main en héritant des ports — jamais
 * `jest.fn()`. Le remboursement lui-même vit dans `card-payment` ; ici, on
 * n'éprouve que ce que le commerce lui DEMANDE, et dans quel ordre.
 */

/** Le compte que la ligne du premier paiement porte, dans les doubles. */
export const CARD_ACCOUNT = "lfc-stripe";

/** Une demande `remainder` vue par l'appelant : la cible et ce qu'il a dit. */
export interface RemainderCall {
  readonly target: CardRefundTarget;
  readonly request: RemainderRefundRequest;
}

/**
 * `CardRefunds` doublé : chaque `requestRemainder` est noté (et posé au
 * `trace` partagé, pour vérifier qu'il part SOUS le verrou), et rend une
 * demande qui annonce `announcedCents` — aucune quand il vaut 0, comme le
 * bloc quand il ne reste rien à rendre.
 */
export class RecordingCardRefunds extends CardRefunds {
  readonly remainders: RemainderCall[] = [];

  constructor(
    private readonly announcedCents = 2_340,
    private readonly trace: string[] | null = null,
  ) {
    super();
  }

  requestRemainder(
    target: CardRefundTarget,
    request: RemainderRefundRequest,
  ): Promise<readonly RequestedCardRefund[]> {
    this.remainders.push({ target, request });
    const label = "subject" in target ? target.subject.id : target.paymentId;
    this.trace?.push(`refund:${label}`);
    if (this.announcedCents <= 0) {
      return Promise.resolve([]);
    }
    return Promise.resolve([
      {
        requestId: "req_1",
        paymentId: "pay_1",
        form: "remainder",
        announcedCents: this.announcedCents,
        state: "to_issue",
      },
    ]);
  }

  requestAmount(_request: AmountRefundRequest): Promise<RequestedCardRefund> {
    return Promise.reject(new Error("requestAmount : hors du périmètre de ces doubles"));
  }

  retry(_requestId: string): Promise<void> {
    return Promise.reject(new Error("retry : hors du périmètre de ces doubles"));
  }
}

/**
 * Le premier paiement de la commande, tel que le bloc `card-payment` le
 * rendrait (plan M2, P0.c2) — sur `providerRef`, ou aucun (`null`). L'appel
 * est posé au `trace` partagé : l'adoption précède la demande.
 */
export class FixedCardAdoption extends OrderCardAdoption {
  constructor(
    private readonly providerRef: string | null,
    private readonly trace: string[] | null = null,
  ) {
    super();
  }

  ensureFirst(orderId: string): Promise<CardPaymentLine | null> {
    this.trace?.push(`adopt:${orderId}`);
    if (this.providerRef === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      paymentId: "pay_1",
      account: CARD_ACCOUNT,
      providerRef: this.providerRef,
      role: "first",
      state: "paid",
      amountCents: 2_340,
      paidAt: null,
    });
  }
}

/**
 * Les demandes de remboursement que le bloc `card-payment` rendrait pour
 * chaque sujet — le bandeau du détail staff. Le reste de la position est
 * vide : ces doubles ne servent que `refundRequestsOf`.
 */
export class FixedCardRefundRequests extends CardSettlementReader {
  constructor(private readonly requests: readonly CardRefundRequestView[] = []) {
    super();
  }

  positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    return Promise.resolve(
      subjects.map((subject) => ({
        subject,
        payments: [],
        chargedCents: 0,
        refundedCents: 0,
        refundedByNature: { return: 0, adjustment: 0, unattributed: 0 },
        inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
        openRequests: [],
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
    return Promise.resolve(subjects.map((subject) => ({ subject, requests: this.requests })));
  }
}

/** Une demande telle que le bloc la rend ; instants comparés à rien — exception étroite du §5. */
export function cardRefundRequest(
  overrides: Partial<CardRefundRequestView> = {},
): CardRefundRequestView {
  return {
    id: "req_1",
    paymentId: "pay_1",
    form: "remainder",
    nature: "return",
    state: "to_issue",
    reason: "cancellation",
    announcedCents: 2_340,
    issuedCents: null,
    requestedAt: new Date(Date.UTC(2030, 0, 10, 9)),
    issuedAt: null,
    attempts: 0,
    generation: 1,
    lastFailure: null,
    retryable: false,
    ...overrides,
  };
}

export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}
