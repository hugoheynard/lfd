import Stripe from "stripe";

import type {
  CardAccountSecrets,
  CardProviderType,
} from "../../../../platform/config/card-accounts.js";
import { assertOutsideTransaction } from "../../../../platform/database/outside-transaction.js";
import {
  CardProviderUnavailableError,
  InvalidProviderSignatureError,
} from "../../domain/errors/card-payment-errors.js";
import type { CardProviderEvent } from "../../domain/ports/card-provider-event.js";
import { CardProvider } from "../../domain/ports/card-provider.js";
import type {
  CardCollection,
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

/** Le prestataire, tel que la page le lit pour choisir son formulaire. */
const STRIPE_PROVIDER: CardProviderType = "stripe";

/**
 * Les moyens de paiement acceptés : **la carte, et elle seule** (Hugo,
 * 2026-10-09) — Apple Pay et Google Pay en sont des portefeuilles. Énumérer
 * `card` plutôt que laisser Stripe choisir retire Klarna, Link et tout moyen
 * activé plus tard dans le tableau de bord sans qu'on l'ait décidé ici.
 */
const ACCEPTED_PAYMENT_METHOD_TYPES = ["card"] as const;

/**
 * **L'adaptateur Stripe d'UN compte** (plan M2, §3.2) — copié de
 * `StripePaymentGateway` et `StripePaymentRefunder` (`lafoliecoffee/payments/`) le
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
    return { providerRef: intent.id, collection: this.embedded(intent.client_secret) };
  }

  async retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    assertOutsideTransaction("Stripe.paymentIntents.retrieve");
    const intent = await this.client.paymentIntents.retrieve(providerRef);
    if (intent.client_secret === null) {
      throw new CardProviderUnavailableError("client_secret absent de la PaymentIntent relue");
    }
    return {
      providerRef: intent.id,
      collection: this.embedded(intent.client_secret),
      state: intentStateOf(intent.status),
    };
  }

  /**
   * Stripe se paie dans notre page : le Payment Element se monte avec la clé
   * publique du compte et le `client_secret` de la PaymentIntent.
   */
  private embedded(clientSecret: string): CardCollection {
    return {
      kind: "embedded",
      provider: STRIPE_PROVIDER,
      publishableKey: this.secrets.publishableKey,
      token: clientSecret,
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
