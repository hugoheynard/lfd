import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import {
  CARD_PAYMENT_PROVIDER_REFUND_EVENT,
  CardPaymentProviderRefundEvent,
} from "../../../../card-payment/channels/facts/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { RecordOrderRefundCommand } from "../commands/record-order-refund.command.js";
import { ORDER_CARD_SUBJECT_TYPE } from "../services/order-card-subject.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_CARD_PROVIDER_REFUND_EVENT = "b2b.orders.record-refund-from-card-payment";

/**
 * **Un remboursement annoncé par le prestataire, sur un paiement de
 * commande** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §4.2) — l'abonné TRANSITOIRE du fait `card_payment.provider_refund_event`,
 * retiré en P1 quand le constat déménage dans `card-payment`.
 *
 * Le webhook des cartes appartient au bloc `card-payment` ; le constat, lui,
 * reste en P0 à `b2b/orders`, sur ses tables : la charge relayée est
 * exactement celle que `RecordOrderRefundCommand` lisait du webhook d'avant
 * (vérifié le 2026-11-09), et rien ne change de type.
 *
 * Un refus DÉTERMINISTE (une erreur métier ou de forme) est absorbé et
 * journalisé : le rejouer donnerait le même refus, trois jours durant. Une
 * panne lève, et la boîte d'envoi rejoue (§3.3).
 */
@Injectable()
@DurableHandler({
  type: CARD_PAYMENT_PROVIDER_REFUND_EVENT,
  subscriber: ON_CARD_PROVIDER_REFUND_EVENT,
})
export class OnCardProviderRefundEvent implements DurableSubscriber {
  private readonly logger = new Logger(OnCardProviderRefundEvent.name);

  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = CardPaymentProviderRefundEvent.fromPayload(delivery.payload);
    if (event.subjectType !== ORDER_CARD_SUBJECT_TYPE) {
      return;
    }
    const { refund } = event;
    try {
      await this.commands.execute<RecordOrderRefundCommand, void>(
        new RecordOrderRefundCommand(event.providerRef, {
          stripeRefundId: refund.refundId,
          amountCents: refund.amountCents,
          currency: refund.currency,
          status: refund.status,
          refundedAt: refund.refundedAt,
        }),
      );
    } catch (error) {
      if (!(error instanceof DomainError || error instanceof BusinessError)) {
        throw error;
      }
      this.logger.warn(
        `Remboursement ${refund.refundId} (commande ${event.subjectId}) non constaté : ` +
          `${error.message}`,
      );
    }
  }
}
