import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

import { AppConfig, type StripeConfig } from "../../infra/config/app-config.js";
import {
  InvalidWebhookSignatureError,
  PaymentGatewayUnavailableError,
} from "../domain/errors/payment-errors.js";
import {
  PaymentGateway,
  type CreateIntentParams,
  type CreatedIntent,
  type PaymentWebhookEvent,
} from "../domain/payment-gateway.js";

/**
 * Adaptateur **Stripe** du port {@link PaymentGateway}.
 *
 * Le canal est **optionnel** (comme le stockage et le M2M) : si
 * `AppConfig.stripeConfig()` est `null`, l'adaptateur existe mais **refuse**
 * chaque opération par une `PaymentGatewayUnavailableError` — le reste de la
 * plateforme (panier, commandes sur terme différé) tourne sans Stripe. Aucune
 * lecture d'`process.env` ici : tout passe par `AppConfig`.
 */
@Injectable()
export class StripePaymentGateway extends PaymentGateway {
  private readonly config: StripeConfig | null;
  private readonly client: Stripe | null;

  constructor(appConfig: AppConfig) {
    super();
    this.config = appConfig.stripeConfig();
    this.client = this.config === null ? null : new Stripe(this.config.secretKey);
  }

  async createIntent(params: CreateIntentParams): Promise<CreatedIntent> {
    const client = this.requireClient();
    const intent = await client.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      // Stripe choisit les moyens de paiement activés sur le compte (carte…),
      // sans que le serveur ait à les énumérer.
      automatic_payment_methods: { enabled: true },
      metadata: { companyId: params.companyId ?? "personal" },
    });
    if (intent.client_secret === null) {
      throw new PaymentGatewayUnavailableError("client_secret absent de la PaymentIntent");
    }
    return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
  }

  publishableKey(): string {
    return this.requireConfig().publishableKey;
  }

  parseWebhook(rawBody: Buffer, signature: string): PaymentWebhookEvent {
    const client = this.requireClient();
    const secret = this.requireConfig().webhookSecret;
    let event: Stripe.Event;
    try {
      event = client.webhooks.constructEvent(rawBody, signature, secret);
    } catch (cause) {
      // Toute erreur de `constructEvent` = signature/corps non conforme : on
      // rejette sans jamais traiter l'événement (garantie d'origine Stripe).
      throw new InvalidWebhookSignatureError(cause);
    }
    return reduceEvent(event);
  }

  private requireClient(): Stripe {
    if (this.client === null) {
      throw new PaymentGatewayUnavailableError("STRIPE_SECRET_KEY non configurée");
    }
    return this.client;
  }

  private requireConfig(): StripeConfig {
    if (this.config === null) {
      throw new PaymentGatewayUnavailableError("configuration Stripe absente");
    }
    return this.config;
  }
}

/** Réduit un événement Stripe à la forme domaine ; tout le reste est `ignored`. */
function reduceEvent(event: Stripe.Event): PaymentWebhookEvent {
  if (event.type === "payment_intent.succeeded") {
    return { kind: "succeeded", paymentIntentId: event.data.object.id };
  }
  if (event.type === "payment_intent.payment_failed") {
    return { kind: "failed", paymentIntentId: event.data.object.id };
  }
  return { kind: "ignored" };
}
