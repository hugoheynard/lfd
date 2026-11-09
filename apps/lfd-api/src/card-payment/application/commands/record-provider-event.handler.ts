import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import {
  CardPaymentCheckoutEvent,
  CardPaymentProviderRefundEvent,
  CardPaymentUnmatchedFact,
  type ProviderRefund,
} from "../../channels/facts/index.js";
import type { CardPayment } from "../../domain/entities/card-payment.js";
import {
  InvalidPaymentAccountError,
  UnknownCardAccountError,
} from "../../domain/errors/card-payment-errors.js";
import type {
  CardProviderEvent,
  CheckoutEvent,
  IntentFailedEvent,
  IntentPaidEvent,
  OtherProviderEvent,
  RefundEvent,
} from "../../domain/ports/card-provider-event.js";
import type { CardProvider } from "../../domain/ports/card-provider.js";
import { CardProviders } from "../../domain/ports/card-providers.js";
import { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import { IntentOutcomeRecorder } from "../intent-outcome-recorder.js";
import { ProviderPaymentResolver } from "../provider-payment-resolver.js";
import { RecordProviderEventCommand } from "./record-provider-event.command.js";

type Recording<E extends CardProviderEvent> = (account: PaymentAccount, event: E) => Promise<void>;

/**
 * **Le webhook d'un compte d'encaissement** (plan M2, §3.2, §3.3, §3.6).
 *
 * Le compte du chemin est confronté au registre — inconnu, **400** et
 * journalisé ; la signature, vérifiée avec le secret DE CE COMPTE — invalide,
 * **400**, rien n'est traité. Puis, dans UNE unité de travail :
 *
 * - **encaissé / refusé** : le paiement est retrouvé par `(compte,
 *   référence)`, ou revendiqué par un sujet (§4.6) ; l'issue est appliquée
 *   dans l'ordre du §3.6 (`IntentOutcomeRecorder`) ; personne : `unmatched` ;
 * - **remboursement** : relayé à `b2b/orders` par le fait transitoire
 *   `provider_refund_event` (§4.2) — ou `unmatched`, que `b2b/payments` sonne ;
 * - **page hébergée d'un lien** : relayée à `b2b/payments` (`checkout_event`,
 *   §4.5) — jamais un 200 muet ;
 * - **tout le reste** : `unmatched`, avec son type.
 *
 * @sans-journal Projection d'un événement du prestataire, pas un acte d'un
 * humain — comme `ConfirmOrderPaymentHandler` qu'il remplace. Ses traces sont
 * ses faits durables, écrits dans la même transaction ; le catalogue du
 * journal de `card-payment` (`packages/contracts/src/journal-facts/`) arrive
 * avec P1 (plan M2, §15 bis).
 */
@CommandHandler(RecordProviderEventCommand)
export class RecordProviderEventHandler implements ICommandHandler<
  RecordProviderEventCommand,
  void
> {
  private readonly logger = new Logger(RecordProviderEventHandler.name);

  private readonly recordings: {
    readonly [K in CardProviderEvent["kind"]]: Recording<Extract<CardProviderEvent, { kind: K }>>;
  } = {
    paid: (account, event) => this.onIntent(account, event),
    payment_failed: (account, event) => this.onIntent(account, event),
    refund: (account, event) => this.onRefund(account, event),
    checkout: (account, event) => this.onCheckout(account, event),
    other: (account, event) => this.unmatched(account, event, null, null),
  };

  constructor(
    private readonly providers: CardProviders,
    private readonly resolver: ProviderPaymentResolver,
    private readonly outcomes: IntentOutcomeRecorder,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordProviderEventCommand): Promise<void> {
    const account = this.accountOf(command.account);
    const event = this.providerOf(account).parseWebhook(command.rawBody, command.signature);
    await this.uow.run(() => this.record(account, event));
  }

  private record<E extends CardProviderEvent>(account: PaymentAccount, event: E): Promise<void> {
    const recording = this.recordings[event.kind] as Recording<E>;
    return recording(account, event);
  }

  private async onIntent(
    account: PaymentAccount,
    event: IntentPaidEvent | IntentFailedEvent,
  ): Promise<void> {
    const payment = await this.resolver.resolve(account, event.providerRef);
    if (payment === null) {
      await this.unmatched(account, event, event.providerRef, null);
      return;
    }
    await (event.kind === "paid"
      ? this.outcomes.paid(payment, event.providerRef, event.eventId)
      : this.outcomes.failed(payment, event.providerRef, event.eventId));
  }

  private async onRefund(account: PaymentAccount, event: RefundEvent): Promise<void> {
    const refund: ProviderRefund = {
      refundId: event.refundId,
      amountCents: event.amountCents,
      currency: event.currency,
      status: event.status,
      refundedAt: event.createdAt,
    };
    const payment = await this.resolver.resolve(account, event.providerRef);
    if (payment === null) {
      await this.unmatched(account, event, event.providerRef, refund);
      return;
    }
    await this.durable.publish(refundRelay(account, event, payment, refund).durableFact());
  }

  private async onCheckout(account: PaymentAccount, event: CheckoutEvent): Promise<void> {
    await this.durable.publish(
      new CardPaymentCheckoutEvent(
        account.name,
        event.eventId,
        event.eventType,
        event.outcome,
        event.sessionId,
      ).durableFact(),
    );
  }

  private async unmatched(
    account: PaymentAccount,
    event: IntentPaidEvent | IntentFailedEvent | RefundEvent | OtherProviderEvent,
    providerRef: string | null,
    refund: ProviderRefund | null,
  ): Promise<void> {
    await this.durable.publish(
      new CardPaymentUnmatchedFact(
        account.name,
        event.eventId,
        event.eventType,
        providerRef,
        refund,
      ).durableFact(),
    );
  }

  /** Un nom mal formé ne nomme aucun compte : le même refus qu'un inconnu. */
  private accountOf(name: string): PaymentAccount {
    try {
      return PaymentAccount.of(name);
    } catch (error) {
      if (error instanceof InvalidPaymentAccountError) {
        throw this.unknown(name);
      }
      throw error;
    }
  }

  private providerOf(account: PaymentAccount): CardProvider {
    try {
      return this.providers.forAccount(account);
    } catch (error) {
      if (error instanceof UnknownCardAccountError) {
        throw this.unknown(account.name);
      }
      throw error;
    }
  }

  private unknown(name: string): UnknownCardAccountError {
    this.logger.warn(`Webhook refusé : compte d'encaissement inconnu (« ${name} »).`);
    return new UnknownCardAccountError(name);
  }
}

function refundRelay(
  account: PaymentAccount,
  event: RefundEvent,
  payment: CardPayment,
  refund: ProviderRefund,
): CardPaymentProviderRefundEvent {
  return new CardPaymentProviderRefundEvent(
    account.name,
    event.eventId,
    payment.id,
    event.providerRef,
    payment.subject.type,
    payment.subject.id,
    refund,
  );
}
