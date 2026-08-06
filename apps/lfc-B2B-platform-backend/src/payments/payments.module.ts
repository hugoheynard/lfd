import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { PaymentGateway } from "./domain/payment-gateway.js";
import { StripePaymentGateway } from "./infrastructure/stripe-payment-gateway.js";
import { PaymentsWebhookController } from "./http/payments-webhook.controller.js";

/**
 * Contexte **paiement** : l'encaissement carte des commandes `per_order` (Stripe).
 *
 * Il **expose** le port `PaymentGateway` (consommé par le contexte `orders` pour
 * créer une intention à la passation) et **héberge** le contrôleur de webhook, qui
 * — après vérification de signature — dispatche `ConfirmOrderPaymentCommand` sur le
 * bus (le handler vit dans `orders`, propriétaire de la commande). Il ne dépend
 * donc PAS d'`OrdersModule` : le couplage passe par le bus CQRS, pas par un import.
 */
@Module({
  imports: [CqrsModule],
  controllers: [PaymentsWebhookController],
  providers: [{ provide: PaymentGateway, useClass: StripePaymentGateway }],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
