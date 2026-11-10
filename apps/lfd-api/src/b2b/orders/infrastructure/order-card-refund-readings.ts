import type { OrderView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  type CardRefundView,
  CardSettlementReader,
  type SubjectRefundPosition,
} from "../../../card-payment/channels/requests/index.js";
import { orderCardSubject } from "../application/services/order-card-subject.js";
import { refundPositionOf, type RefundPosition } from "../domain/value-objects/refund-position.js";

/** Ce qu'une `OrderView` porte de ses remboursements. */
export type OrderRefundsReading = Pick<OrderView, "refunds" | "refundedCents">;

/** Une commande sans remboursement — l'immense majorité. */
export const NO_REFUNDS: OrderRefundsReading = { refunds: [], refundedCents: 0 };

/**
 * **Les remboursements d'une commande, lus au bloc `card-payment`** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §5.1, lot P1.c) — ce que les relations `Order.refunds` et
 * `Order.refundRequest` donnaient aux lecteurs Prisma d'`orders`, retirées
 * du schéma. Par lot : une liste de commandes coûte deux lectures, jamais
 * une par commande.
 *
 * 🔴 **Une seule arithmétique** : `refundedCents` vient de `positionOf`,
 * jamais recalculé depuis `refundsOf`.
 */
@Injectable()
export class OrderCardRefundReadings {
  constructor(private readonly cards: CardSettlementReader) {}

  /** Le reste à rendre et l'argent en vol — ce que la règle de l'annulation lit. */
  async positionOf(orderId: string): Promise<RefundPosition> {
    const [position] = await this.cards.positionOf([orderCardSubject(orderId)]);
    return position === undefined ? refundPositionOf(0, 0, 0) : orderRefundPositionOf(position);
  }

  /** Les remboursements de chaque commande, et leur cumul réussi. */
  async readingsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderRefundsReading>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const subjects = orderIds.map(orderCardSubject);
    // Séquentiel, pas `Promise.all` : sous une unité de travail, les deux
    // lectures partageraient le client de la transaction (cf.
    // `prisma-card-invoicing.reader.ts`).
    const refunds = await this.cards.refundsOf(subjects);
    const positions = await this.cards.positionOf(subjects);
    const readings = new Map<string, OrderRefundsReading>();
    for (const [index, orderId] of orderIds.entries()) {
      readings.set(orderId, {
        refunds: (refunds[index]?.refunds ?? []).map(refundViewOf),
        refundedCents: positions[index]?.refundedCents ?? 0,
      });
    }
    return readings;
  }
}

/** L'argent en vol d'une `remainder` ou sans demande — jamais celui d'une `amount` (§6.2). */
export function orderRefundPositionOf(position: SubjectRefundPosition): RefundPosition {
  const inFlight = position.inFlightByForm.remainder + position.inFlightByForm.unattributed;
  return refundPositionOf(position.chargedCents, position.refundedCents, inFlight);
}

function refundViewOf(refund: CardRefundView): OrderView["refunds"][number] {
  return {
    amountCents: refund.amountCents,
    status: refund.status,
    refundedAt: refund.refundedAt.toISOString(),
    source: refund.source,
  };
}
