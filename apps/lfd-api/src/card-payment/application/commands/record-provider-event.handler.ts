import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import {
  CardPaymentCheckoutEvent,
  CardPaymentUnmatchedFact,
  type ProviderRefund,
} from "../../channels/facts/index.js";
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
import { unmatchedFact } from "../refunds/card-refund-journal.js";
import { CardRefundObservation } from "../refunds/card-refund-observation.js";
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
 * - **remboursement** : constaté par le bloc lui-même (`CardRefundObservation`,
 *   §6.3), dans l'ordre du §3.6 — plus de relais `provider_refund_event`
 *   vers `b2b/orders` depuis P1 ; un paiement qu'aucun sujet ne porte :
 *   `unmatched`, que `b2b/payments` sonne ;
 * - **page hébergée d'un lien** : relayée à `b2b/payments` (`checkout_event`,
 *   §4.5) — jamais un 200 muet ;
 * - **tout le reste** : `unmatched`, avec son type.
 *
 * Le journal de `card-payment` s'écrit sous la même unité de travail :
 * `card_payment.unmatched` ici, les faits du remboursement par le constat.
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
    private readonly refunds: CardRefundObservation,
    private readonly durable: DurablePublisher,
    private readonly journal: Journal,
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
    if ((await this.refunds.observe(account, event)) === "unmatched") {
      await this.unmatched(account, event, event.providerRef, {
        refundId: event.refundId,
        amountCents: event.amountCents,
        currency: event.currency,
        status: event.status,
        refundedAt: event.createdAt,
      });
    }
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
    await this.journal.append(unmatchedFact(account.name, event.eventId, event.eventType));
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
