import type {
  CardPaymentLine,
  CardSettlementPosition,
  OpenCardRefundRequest,
} from "../channels/requests/card-settlement.reader.js";
import type { CardSubject } from "../channels/subjects/index.js";
import type { CardRefundLine } from "../domain/entities/card-refund-ledger.js";
import type { CardRefundRequest } from "../domain/entities/card-refund-request.js";
import { isOpenRefundStatus } from "../domain/value-objects/card-refund-values.js";

/**
 * **La position d'un sujet, calculée** — pure, sur les lignes déjà lues : la
 * seule arithmétique du remboursé (§3.3, « une seule arithmétique »). Le
 * lecteur la sert ; le canal la reçoit recalculée après chaque écriture.
 */

/** Ce qu'il faut d'un sujet pour calculer sa position. */
export interface SubjectLines {
  readonly payments: readonly CardPaymentLine[];
  readonly refunds: readonly CardRefundLine[];
  readonly requests: readonly CardRefundRequest[];
}

const NON_TERMINAL = new Set(["to_issue", "issued", "stopped"]);

export function positionFrom(subject: CardSubject, lines: SubjectLines): CardSettlementPosition {
  const formOf = new Map(lines.requests.map((request) => [request.id, request.view.form]));
  const refundedByNature = { return: 0, adjustment: 0, unattributed: 0 };
  const inFlightByForm = { remainder: 0, amount: 0, unattributed: 0 };
  for (const refund of lines.refunds) {
    if (refund.status === "succeeded") {
      refundedByNature[refund.nature ?? "unattributed"] += refund.amountCents;
    } else if (isOpenRefundStatus(refund.status)) {
      const form = refund.requestId === null ? undefined : formOf.get(refund.requestId);
      inFlightByForm[form ?? "unattributed"] += refund.amountCents;
    }
  }
  return {
    subject,
    payments: lines.payments,
    chargedCents: chargedOf(lines.payments),
    refundedCents:
      refundedByNature.return + refundedByNature.adjustment + refundedByNature.unattributed,
    refundedByNature,
    inFlightByForm,
    openRequests: lines.requests.filter((request) => NON_TERMINAL.has(request.current)).map(openOf),
  };
}

/** **Encaissé** : `Σ montant` des paiements `paid`. */
export function chargedOf(payments: readonly CardPaymentLine[]): number {
  return payments
    .filter((payment) => payment.state === "paid")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}

function openOf(request: CardRefundRequest): OpenCardRefundRequest {
  const { id, paymentId, form, nature, state } = request.view;
  return { requestId: id, paymentId, form, nature, state };
}

/** La clé d'un sujet dans une table de lot. */
export const subjectKey = (type: string, id: string): string => `${type}\u0000${id}`;

/** Une clause par type de sujet : `(subject_type, subject_id IN …)`. */
export function byType(
  subjects: readonly CardSubject[],
): { subjectType: string; subjectId: { in: string[] } }[] {
  const ids = new Map<string, string[]>();
  for (const subject of subjects) {
    ids.set(subject.type, [...(ids.get(subject.type) ?? []), subject.id]);
  }
  return [...ids].map(([subjectType, list]) => ({ subjectType, subjectId: { in: list } }));
}

/** Range des éléments sous la clé de leur sujet. */
export function groupBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string | undefined,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== undefined) {
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
  }
  return grouped;
}
