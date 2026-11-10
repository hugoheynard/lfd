import Stripe from "stripe";

import type { CardAccountSecrets } from "../../../platform/config/card-accounts.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";
import {
  CardProviderUnavailableError,
  InvalidProviderSignatureError,
} from "../../domain/errors/card-payment-errors.js";
import type { CardProviderEvent } from "../../domain/ports/card-provider-event.js";
import { CardProvider } from "../../domain/ports/card-provider.js";
import type {
  CreateIntentParams,
  CreatedIntent,
  IntentCancellation,
  RefundIssuance,
  RefundLookup,
  RefundLookupParams,
  RefundParams,
  RetrievedIntent,
} from "../../domain/ports/card-provider-types.js";
import { reduceEvent } from "./stripe-event-reduction.js";
import {
  cancellationFromError,
  cancellationFromRefusedState,
  intentStateOf,
  refusedWithoutState,
} from "./stripe-intent-translation.js";
import { StripeRefundCalls } from "./stripe-refund-calls.js";

/**
 * Les moyens de paiement acceptés : **la carte, et elle seule** (Hugo,
 * 2026-10-09) — Apple Pay et Google Pay en sont des portefeuilles. Copié de
 * `b2b/payments/infrastructure/accepted-payment-methods.ts` le 2026-11-09.
 */
const ACCEPTED_PAYMENT_METHOD_TYPES = ["card"] as const;

/**
 * **L'adaptateur Stripe d'UN compte** (plan M2, §3.2) — copié de
 * `StripePaymentGateway` et `StripePaymentRefunder` (`b2b/payments/`) le
 * 2026-11-09 ; le lot c2 retire les originaux.
 *
 * Il naît avec les secrets de son compte : `RegistryCardProviders` ne
 * l'instancie pas sans eux. Plus de canal « non configuré » à refuser ici.
 */
export class StripeCardProvider extends CardProvider {
  private readonly client: Stripe;
  private readonly refunds: StripeRefundCalls;

  constructor(
    private readonly secrets: CardAccountSecrets,
    client?: Stripe,
  ) {
    super();
    this.client = client ?? new Stripe(secrets.secretKey);
    this.refunds = new StripeRefundCalls(this.client);
  }

  async createIntent(params: CreateIntentParams): Promise<CreatedIntent> {
    assertOutsideTransaction("Stripe.paymentIntents.create");
    const intent = await this.client.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      payment_method_types: [...ACCEPTED_PAYMENT_METHOD_TYPES],
      // La métadonnée d'avant le bloc, inchangée (§4.2).
      metadata: { companyId: params.tag },
    });
    if (intent.client_secret === null) {
      throw new CardProviderUnavailableError("client_secret absent de la PaymentIntent");
    }
    return { providerRef: intent.id, clientSecret: intent.client_secret };
  }

  async retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    assertOutsideTransaction("Stripe.paymentIntents.retrieve");
    const intent = await this.client.paymentIntents.retrieve(providerRef);
    if (intent.client_secret === null) {
      throw new CardProviderUnavailableError("client_secret absent de la PaymentIntent relue");
    }
    return {
      providerRef: intent.id,
      clientSecret: intent.client_secret,
      state: intentStateOf(intent.status),
    };
  }

  async cancelIntent(providerRef: string): Promise<IntentCancellation> {
    assertOutsideTransaction("Stripe.paymentIntents.cancel");
    try {
      await this.client.paymentIntents.cancel(providerRef);
      return { kind: "cancelled" };
    } catch (error) {
      if (refusedWithoutState(error)) {
        return this.cancellationFromCurrentState(providerRef);
      }
      return cancellationFromError(error);
    }
  }

  /** Relit l'intention pour dire pourquoi Stripe a refusé de l'annuler. Ne lève jamais. */
  private async cancellationFromCurrentState(providerRef: string): Promise<IntentCancellation> {
    try {
      const intent = await this.client.paymentIntents.retrieve(providerRef);
      return cancellationFromRefusedState(intent.status);
    } catch (error) {
      return cancellationFromError(error);
    }
  }

  publishableKey(): string {
    return this.secrets.publishableKey;
  }

  parseWebhook(rawBody: Buffer, signature: string): CardProviderEvent {
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(rawBody, signature, this.secrets.webhookSecret);
    } catch (cause) {
      // Toute erreur de `constructEvent` = signature ou corps non conforme : on
      // rejette sans jamais traiter l'événement (garantie d'origine).
      throw new InvalidProviderSignatureError(cause);
    }
    return reduceEvent(event);
  }

  refund(providerRef: string, params: RefundParams): Promise<RefundIssuance> {
    return this.refunds.refund(providerRef, params);
  }

  findRefund(providerRef: string, params: RefundLookupParams): Promise<RefundLookup> {
    return this.refunds.findRefund(providerRef, params);
  }
}
