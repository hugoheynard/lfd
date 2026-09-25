import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { CheckoutSession } from "../domain/entities/payment-link.js";
import { PaymentGatewayUnavailableError } from "../domain/errors/payment-errors.js";
import { CheckoutGateway, type CheckoutSessionRequest } from "../domain/ports/checkout-gateway.js";

/**
 * La clé de métadonnée qui marque une session ouverte pour un lien libre. Le
 * webhook ne rapproche QUE les sessions qui la portent.
 */
export const PAYMENT_LINK_METADATA_KEY = "paymentLinkId";

/**
 * Adaptateur **Stripe Checkout** du port {@link CheckoutGateway}.
 *
 * Page **hébergée** par Stripe, et pas une page de la boutique : le lien part
 * chez un client qui peut n'avoir aucun compte connecté (son comptable), et une
 * page publique de notre côté serait une surface de plus à sécuriser (plan
 * §2b). Canal optionnel comme `StripePaymentGateway` : sans configuration,
 * chaque appel refuse par une `PaymentGatewayUnavailableError`.
 */
@Injectable()
export class StripeCheckoutGateway extends CheckoutGateway {
  private readonly client: Stripe | null;

  constructor(appConfig: AppConfig) {
    super();
    const config = appConfig.stripeConfig();
    this.client = config === null ? null : new Stripe(config.secretKey);
  }

  async createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession> {
    const metadata = {
      [PAYMENT_LINK_METADATA_KEY]: request.paymentLinkId,
      companyId: request.companyId,
    };
    const session = await this.requireClient().checkout.sessions.create({
      mode: "payment",
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
