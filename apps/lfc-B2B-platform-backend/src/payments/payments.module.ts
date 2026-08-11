import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { MandateGateway } from "./domain/mandate-gateway.js";
import { PaymentGateway } from "./domain/payment-gateway.js";
import { PaymentMandateRepository } from "./domain/payment-mandate.repository.js";
import {
  AttachMandateProofHandler,
  GetCompanyMandateHandler,
  RegisterMandateHandler,
  RevokeMandateHandler,
} from "./application/mandate.handlers.js";
import { PrismaPaymentMandateRepository } from "./infrastructure/prisma-payment-mandate.repository.js";
import { StripeMandateGateway } from "./infrastructure/stripe-mandate-gateway.js";
import { StripePaymentGateway } from "./infrastructure/stripe-payment-gateway.js";
import { AdminMandatesController } from "./http/admin-mandates.controller.js";
import { PaymentsWebhookController } from "./http/payments-webhook.controller.js";

/**
 * Contexte **paiement** : deux métiers voisins, deux ports.
 *
 * `PaymentGateway` encaisse une commande ponctuelle (intention + webhook) ; il
 * est **exporté** car `orders` le consomme à la passation. `MandateGateway`
 * enregistre l'autorisation durable de prélever ; il ne sort pas d'ici — le
 * mandat est un geste de back-office, et personne d'autre n'a à le connaître.
 *
 * Le contrôleur de webhook ne dépend pas d'`OrdersModule` : après vérification
 * de signature, il dispatche sur le bus CQRS. Le couplage passe par le bus, pas
 * par un import.
 */
@Module({
  imports: [CqrsModule],
  controllers: [PaymentsWebhookController, AdminMandatesController],
  providers: [
    { provide: PaymentGateway, useClass: StripePaymentGateway },
    { provide: MandateGateway, useClass: StripeMandateGateway },
    { provide: PaymentMandateRepository, useClass: PrismaPaymentMandateRepository },
    RegisterMandateHandler,
    RevokeMandateHandler,
    AttachMandateProofHandler,
    GetCompanyMandateHandler,
  ],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
