import { Injectable } from "@nestjs/common";

import { CardSettlementReader } from "../../../card-payment/channels/requests/index.js";
import { orderCardSubject } from "../application/services/order-card-subject.js";
import { SHORTFALL_REFUND_REASON } from "../application/services/shortfall-refund-money.js";
import { OrderShortfallRefundReader } from "../domain/ports/order-shortfall-refund.reader.js";

/**
 * Le gel du solde par le reste demandé (plan E9, § 4.7), lu au bloc
 * `card-payment` par son canal : toutes les demandes de la commande,
 * terminées comprises — une demande remboursée gèle autant qu'une ouverte.
 */
@Injectable()
export class CardOrderShortfallRefundReader extends OrderShortfallRefundReader {
  constructor(private readonly cards: CardSettlementReader) {
    super();
  }

  async hasShortfallRefund(orderId: string): Promise<boolean> {
    const [requests] = await this.cards.refundRequestsOf([orderCardSubject(orderId)]);
    return (requests?.requests ?? []).some((request) => request.reason === SHORTFALL_REFUND_REASON);
  }
}
