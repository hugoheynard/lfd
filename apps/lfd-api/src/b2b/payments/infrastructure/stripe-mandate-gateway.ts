import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

import { AppConfig, type StripeConfig } from "../../../platform/config/app-config.js";
import type { RegisteredMandate } from "../domain/entities/payment-mandate.js";
import { PaymentGatewayUnavailableError } from "../domain/errors/payment-errors.js";
import { MandateGateway, type MandateToRegister } from "../domain/mandate-gateway.js";

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

  async registerMandate(input: MandateToRegister): Promise<RegisteredMandate> {
    const client = this.requireClient();
    const customerId = await this.resolveCustomer(client, input);

    const setup = await client.setupIntents.create(
      {
        customer: customerId,
        payment_method: input.paymentMethodId,
        payment_method_types: ["sepa_debit"],
        // Le mandat sert à des prélèvements déclenchés sans le client devant
        // l'écran : c'est tout l'objet de l'enregistrement.
        usage: "off_session",
        confirm: true,
        mandate_data: {
          customer_acceptance: {
            type: "offline",
            accepted_at: Math.floor(input.acceptedAt.getTime() / 1000),
          },
        },
        metadata: { companyId: input.companyId },
      },
      // La création est **rejouable** : si le réseau lâche entre l'appel et la
      // réponse, un second essai ne crée pas un second mandat chez Stripe.
      { idempotencyKey: `mandate_${input.companyId}_${input.paymentMethodId}` },
    );

    const method = await client.paymentMethods.retrieve(input.paymentMethodId);
    return {
      stripeCustomerId: customerId,
      paymentMethodId: input.paymentMethodId,
      reference: await this.mandateReference(client, setup),
      last4: method.sepa_debit?.last4 ?? "",
      bankCode: method.sepa_debit?.bank_code ?? "",
      country: method.sepa_debit?.country ?? "",
      status: setup.status === "succeeded" ? "active" : "pending",
    };
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

  /** Le client Stripe de la société — réutilisé s'il existe, créé sinon. */
  private async resolveCustomer(client: Stripe, input: MandateToRegister): Promise<string> {
    if (input.existingCustomerId !== null) {
      return input.existingCustomerId;
    }
    const customer = await client.customers.create({
      name: input.companyName,
      email: input.email,
      metadata: { companyId: input.companyId },
    });
    return customer.id;
  }

  /**
   * La référence opposable (RUM) portée par le mandat créé.
   *
   * Vide plutôt qu'une erreur si Stripe ne l'a pas encore rendue : le mandat
   * existe, et refuser de l'enregistrer pour une référence manquante ferait
   * perdre une autorisation valide au commercial qui est chez son client.
   */
  private async mandateReference(client: Stripe, setup: Stripe.SetupIntent): Promise<string> {
    if (typeof setup.mandate !== "string") {
      return "";
    }
    const mandate = await client.mandates.retrieve(setup.mandate);
    return mandate.payment_method_details?.sepa_debit?.reference ?? "";
  }

  private requireClient(): Stripe {
    if (this.client === null) {
      throw new PaymentGatewayUnavailableError("STRIPE_SECRET_KEY non configurée");
    }
    return this.client;
  }
}
