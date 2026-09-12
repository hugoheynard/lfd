import { Module } from "@nestjs/common";

import { AccountingModule } from "../accounting/accounting.module.js";

import { MandateGateway } from "./domain/mandate-gateway.js";
import { PaymentGateway } from "./domain/payment-gateway.js";
import { PaymentMandateRepository } from "./domain/payment-mandate.repository.js";
import { CompanyBankAccountRepository } from "./domain/ports/company-bank-account.repository.js";
import { MintMandateHandler } from "./application/commands/mint-mandate.handler.js";
import { SetCompanyBankAccountHandler } from "./application/commands/set-company-bank-account.handler.js";
import { SetMandateOptionsHandler } from "./application/commands/set-mandate-options.handler.js";
import { GetCompanyBankAccountHandler } from "./application/queries/get-company-bank-account.handler.js";
import { PreviewCustomerMandateHandler } from "./application/queries/preview-customer-mandate.handler.js";
import {
  AttachMandateProofHandler,
  GetCompanyMandateHandler,
  RevokeMandateHandler,
} from "./application/mandate.handlers.js";
import { PrismaCompanyBankAccountRepository } from "./infrastructure/prisma-company-bank-account.repository.js";
import { PrismaPaymentMandateRepository } from "./infrastructure/prisma-payment-mandate.repository.js";
import { StripeMandateGateway } from "./infrastructure/stripe-mandate-gateway.js";
import { StripePaymentGateway } from "./infrastructure/stripe-payment-gateway.js";
import { AdminCompanyBankAccountController } from "./http/admin-company-bank-account.controller.js";
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
  // 🔴 `payments` importe `accounting`, et jamais l'inverse. Le mandat est le
  // document de l'émetteur ; ce contexte-ci y ajoute le côté client. Le sens de
  // la flèche est ce qui empêche les deux de se tenir l'un l'autre.
  imports: [AccountingModule],
  controllers: [
    PaymentsWebhookController,
    AdminMandatesController,
    AdminCompanyBankAccountController,
  ],
  providers: [
    { provide: PaymentGateway, useClass: StripePaymentGateway },
    { provide: MandateGateway, useClass: StripeMandateGateway },
    { provide: PaymentMandateRepository, useClass: PrismaPaymentMandateRepository },
    {
      provide: CompanyBankAccountRepository,
      useClass: PrismaCompanyBankAccountRepository,
    },
    MintMandateHandler,
    RevokeMandateHandler,
    AttachMandateProofHandler,
    GetCompanyMandateHandler,
    SetCompanyBankAccountHandler,
    SetMandateOptionsHandler,
    GetCompanyBankAccountHandler,
    PreviewCustomerMandateHandler,
  ],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
