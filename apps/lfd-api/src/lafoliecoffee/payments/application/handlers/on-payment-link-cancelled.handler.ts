import { Injectable } from "@nestjs/common";

import {
  type CardPaymentCancellation,
  CardPayments,
  CardSettlementReader,
} from "../../../../payment/channels/requests/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  PaymentLinkIntentNotCancelledError,
  PaymentLinkNotFoundError,
} from "../../domain/errors/payment-link-errors.js";
import {
  PAYMENT_LINK_CANCELLED_FACT,
  PaymentLinkCancelledFact,
} from "../../domain/events/payment-link-cancelled.fact.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { freeChargeSubject } from "../free-charge/free-charge-subject.js";
import { PaymentLinkBell, ringingOf } from "../payment-link-bell.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_PAYMENT_LINK_CANCELLED = "b2b.payments.cancel-payment-link-intent";

/**
 * **Une demande de paiement libre annulée : son intention de paiement aussi** (plan du
 * lien vers un sujet, §5.3 et §5.6). Son lien est déjà révoqué, dans la
 * transaction de l'annulation ; reste une page peut-être encore ouverte chez
 * un client, qui pourrait confirmer. Hors transaction, l'abonné annule le
 * premier paiement chez le prestataire, s'il en existe un.
 *
 * - annulé, ou déjà annulé : fini ;
 * - **déjà payé** : c'est le cas « payé après annulation » — la cloche sonne
 *   (la même clé que celle du webhook, qui la dédoublonne), et rien n'est
 *   relancé : l'argent est gardé, l'équipe décide ;
 * - en cours, ou prestataire injoignable : l'abonné lève, la boîte d'envoi
 *   rejoue.
 */
@Injectable()
@DurableHandler({ type: PAYMENT_LINK_CANCELLED_FACT, subscriber: ON_PAYMENT_LINK_CANCELLED })
export class OnPaymentLinkCancelled implements DurableSubscriber {
  constructor(
    private readonly settlements: CardSettlementReader,
    private readonly cards: CardPayments,
    private readonly links: PaymentLinkRepository,
    private readonly bell: PaymentLinkBell,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const { paymentLinkId } = PaymentLinkCancelledFact.fromPayload(delivery.payload);
    const [position] = await this.settlements.positionOf([freeChargeSubject(paymentLinkId)]);
    const first = position?.payments.find((payment) => payment.role === "first");
    if (first === undefined) {
      return;
    }
    await this.follow(paymentLinkId, await this.cards.cancel(first.paymentId));
  }

  private async follow(paymentLinkId: string, outcome: CardPaymentCancellation): Promise<void> {
    switch (outcome.kind) {
      case "cancelled":
      case "already_cancelled":
        return;
      case "already_paid":
        await this.ringPaidAfterCancel(paymentLinkId);
        return;
      case "in_progress":
        throw new PaymentLinkIntentNotCancelledError(paymentLinkId, "paiement en cours");
      case "unavailable":
        throw new PaymentLinkIntentNotCancelledError(paymentLinkId, outcome.reason);
    }
  }

  private async ringPaidAfterCancel(paymentLinkId: string): Promise<void> {
    const link = await this.links.load(paymentLinkId);
    if (link === null) {
      throw new PaymentLinkNotFoundError(paymentLinkId);
    }
    await this.bell.paidAfterCancel(ringingOf(link));
  }
}
