import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

import { AppConfig, type StripeConfig } from "../../../platform/config/app-config.js";
import {
  InvalidWebhookSignatureError,
  PaymentGatewayUnavailableError,
} from "../domain/errors/payment-errors.js";
import {
  PAYMENT_REFUND_STATUSES,
  PaymentGateway,
  type CreateIntentParams,
  type CreatedIntent,
  type IntentCancellation,
  type PaymentWebhookEvent,
  type RefundWebhookEvent,
  type RetrievedIntent,
} from "../domain/payment-gateway.js";
import {
  cancellationFromError,
  cancellationFromRefusedState,
  intentStateOf,
  refusedWithoutState,
} from "./stripe-intent-translation.js";
import { PAYMENT_LINK_METADATA_KEY } from "./stripe-checkout-gateway.js";
import { ACCEPTED_PAYMENT_METHOD_TYPES } from "./accepted-payment-methods.js";

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
      // La carte seule — Apple Pay en est un portefeuille (2026-10-09).
      payment_method_types: [...ACCEPTED_PAYMENT_METHOD_TYPES],
      metadata: { companyId: params.companyId ?? "personal" },
    });
    if (intent.client_secret === null) {
      throw new PaymentGatewayUnavailableError("client_secret absent de la PaymentIntent");
    }
    return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
  }

  async retrieveIntent(paymentIntentId: string): Promise<RetrievedIntent> {
    const client = this.requireClient();
    const intent = await client.paymentIntents.retrieve(paymentIntentId);
    if (intent.client_secret === null) {
      throw new PaymentGatewayUnavailableError("client_secret absent de la PaymentIntent relue");
    }
    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      state: intentStateOf(intent.status),
    };
  }

  /**
   * Un canal non configuré est une issue (`unavailable`), pas une exception :
   * le port promet de ne jamais lever, et la clôture ne doit pas s'arrêter
   * parce que Stripe manque.
   */
  async cancelIntent(paymentIntentId: string): Promise<IntentCancellation> {
    if (this.client === null) {
      return { kind: "unavailable", reason: "STRIPE_SECRET_KEY non configurée" };
    }
    try {
      await this.client.paymentIntents.cancel(paymentIntentId);
      return { kind: "cancelled" };
    } catch (error) {
      if (refusedWithoutState(error)) {
        return this.cancellationFromCurrentState(paymentIntentId);
      }
      return cancellationFromError(error);
    }
  }

  /** Relit l'intention pour dire pourquoi Stripe a refusé de l'annuler. Ne lève jamais. */
  private async cancellationFromCurrentState(paymentIntentId: string): Promise<IntentCancellation> {
    try {
      const intent = await this.requireClient().paymentIntents.retrieve(paymentIntentId);
      return cancellationFromRefusedState(intent.status);
    } catch (error) {
      return cancellationFromError(error);
    }
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

/** Stripe date ses objets en secondes Unix. */
const MS_PER_SECOND = 1000;

/** Réduit un événement Stripe à la forme domaine ; tout le reste est `ignored`. */
function reduceEvent(event: Stripe.Event): PaymentWebhookEvent {
  if (event.type === "payment_intent.succeeded") {
    return { kind: "succeeded", paymentIntentId: event.data.object.id };
  }
  if (event.type === "payment_intent.payment_failed") {
    return { kind: "failed", paymentIntentId: event.data.object.id };
  }
  if (
    event.type === "refund.created" ||
    event.type === "refund.updated" ||
    event.type === "refund.failed"
  ) {
    return reduceRefund(event.data.object) ?? { kind: "ignored" };
  }
  // `charge.refunded` tombe ici, dans `ignored`, et c'est voulu : son objet ne
  // porte plus la liste des remboursements depuis l'API 2022-11-15.
  return reduceCheckoutEvent(event);
}

/**
 * Un remboursement réduit à la forme domaine, ou `null` quand il ne nous
 * concerne pas : sans intention de paiement (un remboursement d'une charge
 * ancienne, sans `PaymentIntent`), ou sous un statut que le port ne connaît
 * pas — le faire passer pour un autre serait pire que l'ignorer.
 */
function reduceRefund(refund: Stripe.Refund): RefundWebhookEvent | null {
  const intent = refund.payment_intent;
  const paymentIntentId = typeof intent === "string" ? intent : (intent?.id ?? null);
  const status = PAYMENT_REFUND_STATUSES.find((known) => known === refund.status);
  if (paymentIntentId === null || status === undefined) {
    return null;
  }
  return {
    kind: "refund",
    refundId: refund.id,
    paymentIntentId,
    amountCents: refund.amount,
    currency: refund.currency,
    status,
    createdAt: new Date(refund.created * MS_PER_SECOND),
  };
}

/**
 * Les trois événements d'une page hébergée, **limités aux liens libres** : une
 * session sans `paymentLinkId` en métadonnée n'a pas été ouverte par nous.
 *
 * `completed` ne vaut paiement que si `payment_status = paid` — un moyen
 * différé termine la page avant d'encaisser, et c'est
 * `async_payment_succeeded` qui dira le reste.
 */
function reduceCheckoutEvent(event: Stripe.Event): PaymentWebhookEvent {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    return isPaymentLink(session) && session.payment_status === "paid"
      ? { kind: "link_paid", sessionId: session.id }
      : { kind: "ignored" };
  }
  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    return isPaymentLink(session)
      ? { kind: "link_paid", sessionId: session.id }
      : { kind: "ignored" };
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    return isPaymentLink(session)
      ? { kind: "link_expired", sessionId: session.id }
      : { kind: "ignored" };
  }
  return { kind: "ignored" };
}

function isPaymentLink(session: Stripe.Checkout.Session): boolean {
  const id = session.metadata?.[PAYMENT_LINK_METADATA_KEY];
  return id !== undefined && id !== "";
}
