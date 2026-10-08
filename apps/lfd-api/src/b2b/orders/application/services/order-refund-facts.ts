import type { JournalFact } from "../../../../platform/journal/journal-fact.js";
import type {
  OrderRefundLedger,
  RefundRecording,
} from "../../domain/entities/order-refund-ledger.js";
import type { RefundReport } from "../../domain/entities/order-refund.js";
import type { RefundRejection } from "../../domain/errors/order-refund-errors.js";

/** Le sujet des faits de remboursement : la commande, sous son numéro. */
const ORDER_SUBJECT = "order";

type Recorded = Extract<RefundRecording, { kind: "recorded" }>;

/**
 * Les faits d'un remboursement constaté : `order.refund_recorded`, et
 * `order.fully_refunded` quand le cumul atteint le total. Aucun identifiant
 * Stripe dans la charge (cf. `@lfd/contracts/journal-facts`, `order-refunds.ts`).
 */
export function recordedFacts(ledger: OrderRefundLedger, recorded: Recorded): JournalFact[] {
  const subject = { subjectType: ORDER_SUBJECT, subjectId: ledger.orderId } as const;
  const facts: JournalFact[] = [
    {
      type: "order.refund_recorded",
      ...subject,
      payload: {
        subjectLabel: ledger.orderNumber,
        amountCents: recorded.refund.amountCents,
        refundedCents: recorded.refundedCents,
        status: recorded.refund.status,
      },
    },
  ];
  if (recorded.settlement === "fully_refunded") {
    facts.push({
      type: "order.fully_refunded",
      ...subject,
      payload: { subjectLabel: ledger.orderNumber, refundedCents: recorded.refundedCents },
    });
  }
  return facts;
}

/** Le fait d'un remboursement refusé : rien n'a été écrit, et cela doit se lire. */
export function rejectedFact(
  ledger: OrderRefundLedger,
  report: RefundReport,
  reason: RefundRejection,
): JournalFact {
  return {
    type: "order.refund_rejected",
    subjectType: ORDER_SUBJECT,
    subjectId: ledger.orderId,
    payload: {
      subjectLabel: ledger.orderNumber,
      amountCents: report.amountCents,
      currency: report.currency,
      status: report.status,
      reason,
    },
  };
}
