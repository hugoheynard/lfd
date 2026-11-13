import { Injectable } from "@nestjs/common";

import { CardSettlementReader } from "../../../../card-payment/channels/requests/index.js";
import type { ShortfallRefundMoney } from "../../domain/services/shortfall-refund.js";
import { orderCardSubject } from "./order-card-subject.js";
import { RefundablePayments, type RefundablesMode } from "./refundable-payments.js";

export { SHORTFALL_REFUND_REASON } from "../../domain/services/shortfall-refunded.js";

/**
 * **L'argent carte d'une commande, pour le reste d'un départ incomplet** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2) — la
 * position (encaissé, remboursé par nature), les paiements qui se rendent,
 * toutes les demandes et les remboursements réussis avec la demande qui les a
 * émis. Tout se lit au bloc `card-payment`, par son canal ; sous le verrou de
 * l'appelant en `adopt`, sans en `read`.
 */
@Injectable()
export class ShortfallRefundMoneyReader {
  constructor(
    private readonly refundables: RefundablePayments,
    private readonly cards: CardSettlementReader,
  ) {}

  async of(orderId: string, mode: RefundablesMode): Promise<ShortfallRefundMoney> {
    const subject = orderCardSubject(orderId);
    const { payments, unpaid, position } = await this.refundables.of(orderId, mode);
    const [requests] = await this.cards.refundRequestsOf([subject]);
    const succeeded = await this.cards.succeededRefundsOf(subject);
    return {
      chargedCents: position?.chargedCents ?? 0,
      adjustmentRefundedCents: position?.refundedByNature.adjustment ?? 0,
      unattributedRefundedCents: position?.refundedByNature.unattributed ?? 0,
      payments,
      unpaid,
      requests: (requests?.requests ?? []).map((request) => ({
        requestId: request.id,
        paymentId: request.paymentId,
        form: request.form,
        nature: request.nature,
        state: request.state,
        reason: request.reason,
        announcedCents: request.announcedCents,
      })),
      succeeded: succeeded.map((refund) => ({
        requestId: refund.requestId,
        amountCents: refund.amountCents,
      })),
    };
  }
}
