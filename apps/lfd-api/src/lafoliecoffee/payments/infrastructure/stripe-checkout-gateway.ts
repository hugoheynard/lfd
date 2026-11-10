import { Inject, Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { CheckoutSession } from "../domain/entities/payment-link.js";
import {
  InvalidWebhookSignatureError,
  PaymentGatewayUnavailableError,
  PaymentLinksWebhookNotConfiguredError,
} from "../domain/errors/payment-errors.js";
import {
  CheckoutGateway,
  type CheckoutSessionRequest,
  type PaymentLinkWebhookEvent,
} from "../domain/ports/checkout-gateway.js";
import { ACCEPTED_PAYMENT_METHOD_TYPES } from "./accepted-payment-methods.js";
import { PAYMENT_LINK_METADATA_KEY, reduceLinkEvent } from "./stripe-link-webhook-reduction.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";

/**
 * Adaptateur **Stripe Checkout** du port {@link CheckoutGateway}.
 *
 * Page **hébergée** par Stripe, et pas une page de la boutique : le lien part
 * chez un client qui peut n'avoir aucun compte connecté (son comptable), et une
 * page publique de notre côté serait une surface de plus à sécuriser (plan
 * §2b). Canal optionnel : sans configuration, chaque appel refuse par une
 * `PaymentGatewayUnavailableError`.
 *
 * Il garde `stripeConfig()` — les mêmes variables que le compte `lfc-stripe`
 * du registre des cartes, pour qu'une rotation de clé n'ait qu'un endroit
 * (plan M2, §3.1) — et vérifie le webhook DES LIENS avec son propre secret
 * (`STRIPE_LINKS_WEBHOOK_SECRET`, §4.5).
 */
@Injectable()
export class StripeCheckoutGateway extends CheckoutGateway {
  private readonly logger = new Logger(StripeCheckoutGateway.name);
  private readonly client: Stripe | null;
  private readonly linksWebhookSecret: string | null;

  constructor(
    @Inject(AppConfig) appConfig: Pick<AppConfig, "stripeConfig" | "stripeLinksWebhookSecret">,
  ) {
    super();
    const config = appConfig.stripeConfig();
    this.client = config === null ? null : new Stripe(config.secretKey);
    this.linksWebhookSecret = appConfig.stripeLinksWebhookSecret();
  }

  /**
   * La vérification ne demande que le secret de l'endpoint : elle passe par
   * le `webhooks` statique du SDK, sans client ni appel réseau.
   */
  parseLinkWebhook(rawBody: Buffer, signature: string): PaymentLinkWebhookEvent {
    if (this.linksWebhookSecret === null) {
      this.logger.warn(
        "Webhook des liens refusé : STRIPE_LINKS_WEBHOOK_SECRET absent — " +
          "créer l'endpoint chez Stripe, puis poser son secret.",
      );
      throw new PaymentLinksWebhookNotConfiguredError();
    }
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, this.linksWebhookSecret);
    } catch (cause) {
      throw new InvalidWebhookSignatureError(cause);
    }
    return reduceLinkEvent(event);
  }

  async createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession> {
    assertOutsideTransaction("Stripe.checkout.sessions.create");
    const metadata = {
      [PAYMENT_LINK_METADATA_KEY]: request.paymentLinkId,
      companyId: request.companyId,
    };
    const session = await this.requireClient().checkout.sessions.create({
      mode: "payment",
      payment_method_types: [...ACCEPTED_PAYMENT_METHOD_TYPES],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: request.currency,
            unit_amount: request.amountCents,
            product_data: { name: request.label },
          },
        },
      ],
      metadata,
      // Recopiée sur l'intention : c'est elle qu'on retrouve dans le tableau de
      // bord Stripe à côté du virement, pas la session.
      payment_intent_data: { metadata },
    });
    if (session.url === null) {
      throw new PaymentGatewayUnavailableError("url absente de la session Checkout");
    }
    return { sessionId: session.id, url: session.url };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    assertOutsideTransaction("Stripe.checkout.sessions.expire");
    try {
      await this.requireClient().checkout.sessions.expire(sessionId);
    } catch (cause) {
      throw new PaymentGatewayUnavailableError(cause);
    }
  }

  private requireClient(): Stripe {
    if (this.client === null) {
      throw new PaymentGatewayUnavailableError("STRIPE_SECRET_KEY non configurée");
    }
    return this.client;
  }
}
