import { Injectable, Logger } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import {
  CARD_PAYMENT_CHECKOUT_EVENT,
  CardPaymentCheckoutEvent,
} from "../../../../card-payment/channels/facts/index.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";
import { paymentLinkCommandFor } from "../payment-link-outcome-commands.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_CARD_CHECKOUT_EVENT = "b2b.payments.payment-link-from-card-webhook";

/**
 * **Une page de lien relayée par le webhook des cartes** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §4.5) — l'abonné TRANSITOIRE du fait `card_payment.checkout_event`, tant
 * que l'endpoint Stripe des liens ne reçoit pas seul les `checkout.*` ;
 * retiré avec le relais (P2).
 *
 * Les deux chemins peuvent apporter le même événement : `settle` et `expire`
 * sont idempotents (`already_paid`), le second passage ne réécrit rien. Un
 * refus déterministe est absorbé et journalisé ; une panne lève, et la boîte
 * d'envoi rejoue (§3.3).
 */
@Injectable()
@DurableHandler({ type: CARD_PAYMENT_CHECKOUT_EVENT, subscriber: ON_CARD_CHECKOUT_EVENT })
export class OnCardCheckoutEvent implements DurableSubscriber {
  private readonly logger = new Logger(OnCardCheckoutEvent.name);

  constructor(private readonly commands: CommandBus) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = CardPaymentCheckoutEvent.fromPayload(delivery.payload);
    try {
      await this.commands.execute(paymentLinkCommandFor(event.outcome, event.sessionId));
    } catch (error) {
      if (!(error instanceof DomainError || error instanceof BusinessError)) {
        throw error;
      }
      this.logger.warn(
        `Lien de paiement (session ${event.sessionId}, ${event.eventType}) non projeté : ` +
          `${error.message}`,
      );
    }
  }
}
