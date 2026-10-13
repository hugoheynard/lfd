import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { OrderRefundLedger } from "../../domain/entities/order-refund-ledger.js";
import { OrderRefundRequest } from "../../domain/entities/order-refund-request.js";
import {
  ORDER_REFUND_REVERSED,
  OrderRefundFailedFact,
} from "../../domain/events/order-refund-failed.fact.js";
import { CancellationSubjectReader } from "../../domain/ports/cancellation-subject.reader.js";
import { OrderRefundRequestRepository } from "../../domain/ports/order-refund-request.repository.js";
import { OrderRefundRepository } from "../../domain/ports/order-refund.repository.js";
import { RefundAttentionBell } from "../services/refund-attention-bell.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const REOPEN_REFUND_ON_REVERSAL = "orders.reopen-refund-on-reversal";

/**
 * **Un remboursement réussi qui échoue ensuite, sur une commande annulée**
 * (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.11 bis,
 * `vitruve` SÉRIEUX 5) : l'argent n'est plus rendu, et personne ne le
 * saurait. Dans l'unité de travail du reçu, sous le verrou `orders` :
 *
 * - sans demande, et un reste positif → une demande `refund_reversed`, qui
 *   ATTEND le bouton (aucune échéance : pas de relance Stripe automatique, Q3) ;
 * - avec une demande dont c'est le `re_…` → la génération suivante est
 *   ouverte, sans échéance non plus ;
 * - et la cloche, dans tous les cas où la commande est annulée.
 */
@Injectable()
@DurableHandler({ type: ORDER_REFUND_REVERSED, subscriber: REOPEN_REFUND_ON_REVERSAL })
export class ReopenRefundOnReversal implements DurableSubscriber {
  constructor(
    private readonly subjects: CancellationSubjectReader,
    private readonly ledgers: OrderRefundRepository,
    private readonly requests: OrderRefundRequestRepository,
    private readonly bell: RefundAttentionBell,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = OrderRefundFailedFact.fromPayload(ORDER_REFUND_REVERSED, delivery.payload);
    const subject = await this.subjects.find(fact.orderId);
    if (subject?.status !== "cancelled") {
      return;
    }
    const ledger = await this.ledgers.loadByOrder(fact.orderId);
    if (ledger === null) {
      return;
    }
    const request = await this.requests.load(fact.orderId);
    const rung =
      request === null ? await this.open(ledger) : await this.reopen(ledger, request, fact);
    if (rung !== null) {
      await this.bell.ring({
        ...rung,
        orderId: ledger.orderId,
        orderNumber: ledger.orderNumber,
        cause: "failed",
      });
    }
  }

  /** Rend la génération et le montant à annoncer, ou `null` s'il n'y a rien à rendre. */
  private async open(
    ledger: OrderRefundLedger,
  ): Promise<{ readonly generation: number; readonly announcedCents: number } | null> {
    const remainder = ledger.position().refundableCents;
    if (remainder <= 0) {
      return null;
    }
    const request = OrderRefundRequest.request({
      orderId: ledger.orderId,
      cause: "refund_reversed",
      announcedCents: remainder,
      requestedAt: this.clock.now(),
      requestedBy: null,
      firstAttemptAt: null,
    });
    await this.requests.save(request);
    return { generation: request.generation, announcedCents: remainder };
  }

  private async reopen(
    ledger: OrderRefundLedger,
    request: OrderRefundRequest,
    fact: OrderRefundFailedFact,
  ): Promise<{ readonly generation: number; readonly announcedCents: number }> {
    const generation = request.generation;
    if (request.stripeRefundId === fact.stripeRefundId) {
      request.reopenAfterFailure(ledger.statusOf(fact.stripeRefundId));
      await this.requests.save(request);
    }
    return { generation, announcedCents: request.announcedCents };
  }
}
