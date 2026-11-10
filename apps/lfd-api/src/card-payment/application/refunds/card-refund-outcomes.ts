import { Injectable } from "@nestjs/common";

import type { DurableEvent } from "../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { CardSettlementReader } from "../../channels/requests/card-settlement.reader.js";
import {
  CARD_PAYMENT_REFUND_FAILED,
  CARD_PAYMENT_REFUND_REVERSED,
  CARD_PAYMENT_REFUND_SUCCEEDED,
  CardPaymentFullyRefundedFact,
  CardPaymentRefundFact,
  type CardPaymentRefundFactType,
} from "../../channels/facts/index.js";
import type {
  SubjectRefundOutcome,
  SubjectRefundOutcomeDraft,
} from "../../channels/subjects/index.js";
import type { SubjectRefundPosition } from "../../channels/requests/card-settlement.reader.js";
import type { LockedPayment } from "./card-refund-scope.js";

/** Les genres qui font changer de sort une ligne du carnet, et le fait qu'ils écrivent. */
const LINE_FACTS: Partial<Record<SubjectRefundOutcome["kind"], CardPaymentRefundFactType>> = {
  succeeded: CARD_PAYMENT_REFUND_SUCCEEDED,
  settled_elsewhere: CARD_PAYMENT_REFUND_SUCCEEDED,
  failed: CARD_PAYMENT_REFUND_FAILED,
  reversed: CARD_PAYMENT_REFUND_REVERSED,
};

/**
 * **Après l'écriture** (plan M2, §3.6, étapes 3 et 4) : les faits durables
 * de `card-payment`, puis le canal `onRefundOutcome`, chaque issue avec la
 * position **recalculée** — lue dans la transaction, donc après ce qu'elle
 * vient d'écrire. Le sujet pose sa vue et publie ses faits.
 */
@Injectable()
export class CardRefundOutcomes {
  constructor(
    private readonly reader: CardSettlementReader,
    private readonly durable: DurablePublisher,
  ) {}

  async publish(
    locked: LockedPayment,
    drafts: readonly SubjectRefundOutcomeDraft[],
  ): Promise<void> {
    if (drafts.length === 0) {
      return;
    }
    const [position] = await this.reader.positionOf([locked.subject]);
    if (position === undefined) {
      return;
    }
    for (const draft of drafts) {
      for (const fact of this.factsOf(locked, draft, position)) {
        await this.durable.publish(fact.durableFact());
      }
    }
    for (const draft of drafts) {
      const outcome: SubjectRefundOutcome = { ...draft, position };
      await locked.settlement.onRefundOutcome(locked.subject, outcome);
    }
  }

  private factsOf(
    locked: LockedPayment,
    draft: SubjectRefundOutcomeDraft,
    position: SubjectRefundPosition,
  ): DurableEvent[] {
    const type = LINE_FACTS[draft.kind];
    const refundId = "refundId" in draft ? draft.refundId : null;
    const line = refundId === null ? null : locked.ledger.lineById(refundId);
    if (type === undefined || refundId === null || line === null) {
      return [];
    }
    const { subject, ledger } = locked;
    const facts: DurableEvent[] = [
      new CardPaymentRefundFact(type, {
        subjectType: subject.type,
        subjectId: subject.id,
        paymentId: ledger.paymentId,
        refundId,
        requestId: line.requestId,
        nature: line.nature,
        amountCents: line.amountCents,
      }),
    ];
    if (type === CARD_PAYMENT_REFUND_SUCCEEDED && isFullyRefunded(position)) {
      facts.push(
        new CardPaymentFullyRefundedFact(
          subject.type,
          subject.id,
          refundId,
          position.refundedCents,
        ),
      );
    }
    return facts;
  }
}

/** Le remboursé atteint l'encaissé — un sujet sans encaissement n'est jamais « remboursé ». */
export function isFullyRefunded(position: SubjectRefundPosition): boolean {
  return position.chargedCents > 0 && position.refundedCents >= position.chargedCents;
}
