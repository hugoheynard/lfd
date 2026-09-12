import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

import { AppConfig, type StripeConfig } from "../../../platform/config/app-config.js";
import { PaymentGatewayUnavailableError } from "../domain/errors/payment-errors.js";
import { MandateGateway } from "../domain/mandate-gateway.js";

/**
 * Adaptateur **Stripe** du port {@link MandateGateway}.
 *
 * La séquence est en trois temps : un **client** Stripe (réutilisé d'un mandat au
 * suivant pour la même société), un **SetupIntent** confirmé côté serveur avec le
 * moyen de paiement rendu par l'IBAN Element, et la lecture du **mandat** créé —
 * c'est lui qui porte la référence opposable (RUM).
 *
 * L'acceptation est déclarée **hors ligne** (`customer_acceptance.type =
 * "offline"`) : le client n'a rien cliqué, nous affirmons détenir son mandat
 * signé. Stripe l'autorise précisément pour ce cas — une clientèle reprise dont
 * les mandats existent sur papier. La contrepartie est entière pour nous : en
 * contestation, c'est notre scan qui répond, pas leur horodatage.
 *
 * Comme `StripePaymentGateway`, le canal est **optionnel** : sans configuration,
 * l'adaptateur existe et refuse clairement.
 */
@Injectable()
export class StripeMandateGateway extends MandateGateway {
  private readonly config: StripeConfig | null;
  private readonly client: Stripe | null;

  constructor(appConfig: AppConfig) {
    super();
    this.config = appConfig.stripeConfig();
    this.client = this.config === null ? null : new Stripe(this.config.secretKey);
  }

  async revokeMandate(paymentMethodId: string): Promise<void> {
    const client = this.requireClient();
    try {
      await client.paymentMethods.detach(paymentMethodId);
    } catch (cause) {
      // Un moyen déjà détaché n'est pas un échec de révocation : l'état visé est
      // atteint. Laisser remonter bloquerait une fiche sur un mandat fantôme.
      if (!(cause instanceof Stripe.errors.StripeInvalidRequestError)) {
        throw new PaymentGatewayUnavailableError(cause);
      }
    }
  }

  private requireClient(): Stripe {
    if (this.client === null) {
      throw new PaymentGatewayUnavailableError("STRIPE_SECRET_KEY non configurée");
    }
    return this.client;
  }
}
