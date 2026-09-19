import { Module } from "@nestjs/common";

import { AccountingModule } from "../accounting/accounting.module.js";
import { FeatureAccessModule } from "../feature-access/feature-access.module.js";

import { PaymentGateway } from "./domain/payment-gateway.js";
import { PaymentMandateRepository } from "./domain/payment-mandate.repository.js";
import { BankAccountGuardReader } from "./domain/ports/bank-account-guard.reader.js";
import { CompanyBankAccountRepository } from "./domain/ports/company-bank-account.repository.js";
import { CustomerMandateGate } from "./domain/ports/customer-mandate-gate.js";
import { AttachMyCompanyMandateProofHandler } from "./application/commands/attach-my-company-mandate-proof.handler.js";
import { MintMyCompanyMandateHandler } from "./application/commands/mint-my-company-mandate.handler.js";
import { SetMyCompanyMandateOptionsHandler } from "./application/commands/set-my-company-mandate-options.handler.js";
import { GetMyCompanyMandateDocumentHandler } from "./application/queries/get-my-company-mandate-document.handler.js";
import { GetMyCompanyMandateHandler } from "./application/queries/get-my-company-mandate.handler.js";
import { GetMyCompanyMandateOptionsHandler } from "./application/queries/get-my-company-mandate-options.handler.js";
import { FeatureAccessCustomerMandateGate } from "./infrastructure/feature-access-customer-mandate-gate.js";
import { CompanyMandateController } from "./http/company-mandate.controller.js";
import { MintMandateHandler } from "./application/commands/mint-mandate.handler.js";
import { SendMandateHandler } from "./application/commands/send-mandate.handler.js";
import { SignMandateHandler } from "./application/commands/sign-mandate.handler.js";
import { SetCompanyBankAccountHandler } from "./application/commands/set-company-bank-account.handler.js";
import { SetMyCompanyBankAccountHandler } from "./application/commands/set-my-company-bank-account.handler.js";
import { SetMandateOptionsHandler } from "./application/commands/set-mandate-options.handler.js";
import { GetCompanyBankAccountHandler } from "./application/queries/get-company-bank-account.handler.js";
import { GetMyCompanyBankAccountHandler } from "./application/queries/get-my-company-bank-account.handler.js";
import { GetMandateProofHandler } from "./application/queries/get-mandate-proof.handler.js";
import { GetMandateMintBlockersHandler } from "./application/queries/get-mandate-mint-blockers.handler.js";
import { PreviewCustomerMandateHandler } from "./application/queries/preview-customer-mandate.handler.js";
import { AttachMandateProofHandler } from "./application/commands/attach-mandate-proof.handler.js";
import { RevokeMandateHandler } from "./application/commands/revoke-mandate.handler.js";
import { GetCompanyMandateHandler } from "./application/queries/get-company-mandate.handler.js";
import { PrismaBankAccountGuardReader } from "./infrastructure/prisma-bank-account-guard.reader.js";
import { PrismaCompanyBankAccountRepository } from "./infrastructure/prisma-company-bank-account.repository.js";
import { PrismaPaymentMandateRepository } from "./infrastructure/prisma-payment-mandate.repository.js";
import { StripePaymentGateway } from "./infrastructure/stripe-payment-gateway.js";
import { AdminCompanyBankAccountController } from "./http/admin-company-bank-account.controller.js";
import { CompanyBankAccountController } from "./http/company-bank-account.controller.js";
import { AdminMandatesController } from "./http/admin-mandates.controller.js";
import { PaymentsWebhookController } from "./http/payments-webhook.controller.js";

/**
 * Contexte **paiement** : l'encaissement d'une commande par carte, et le
 * mandat de prélèvement SEPA.
 *
 * `PaymentGateway` encaisse une commande ponctuelle (intention + webhook) ; il
 * est **exporté** car `orders` le consomme à la passation. Le mandat, lui, ne
 * passe par aucun prestataire : il est frappé et rangé ici, et traité
 * directement avec la banque (`documentation/comptabilite/prelevement-sepa.md`).
 * Le port Stripe des mandats (`MandateGateway`) a été supprimé le 2026-09-19 :
 * aucun mandat Stripe en production (Hugo).
 *
 * ⚠️ « le mandat est un geste de back-office » était écrit ici jusqu'au
 * 2026-09-14 : le client génère et renvoie désormais le sien
 * (`CompanyMandateController`).
 *
 * Le contrôleur de webhook ne dépend pas d'`OrdersModule` : après vérification
 * de signature, il dispatche sur le bus CQRS. Le couplage passe par le bus, pas
 * par un import.
 */
@Module({
  // 🔴 `payments` importe `accounting`, et jamais l'inverse. Le mandat est le
  // document de l'émetteur ; ce contexte-ci y ajoute le côté client. Le sens de
  // la flèche est ce qui empêche les deux de se tenir l'un l'autre.
  // `feature-access` pour le seul drapeau `customerMandate`, lu par un
  // adaptateur : les handlers du mandat n'en voient qu'un port booléen.
  imports: [AccountingModule, FeatureAccessModule],
  controllers: [
    PaymentsWebhookController,
    AdminMandatesController,
    AdminCompanyBankAccountController,
    CompanyBankAccountController,
    CompanyMandateController,
  ],
  providers: [
    { provide: PaymentGateway, useClass: StripePaymentGateway },
    { provide: PaymentMandateRepository, useClass: PrismaPaymentMandateRepository },
    {
      provide: CompanyBankAccountRepository,
      useClass: PrismaCompanyBankAccountRepository,
    },
    { provide: BankAccountGuardReader, useClass: PrismaBankAccountGuardReader },
    { provide: CustomerMandateGate, useClass: FeatureAccessCustomerMandateGate },
    MintMandateHandler,
    SignMandateHandler,
    SendMandateHandler,
    RevokeMandateHandler,
    AttachMandateProofHandler,
    GetCompanyMandateHandler,
    GetMandateProofHandler,
    GetMandateMintBlockersHandler,
    SetCompanyBankAccountHandler,
    SetMandateOptionsHandler,
    GetCompanyBankAccountHandler,
    SetMyCompanyBankAccountHandler,
    GetMyCompanyBankAccountHandler,
    PreviewCustomerMandateHandler,
    MintMyCompanyMandateHandler,
    AttachMyCompanyMandateProofHandler,
    GetMyCompanyMandateHandler,
    GetMyCompanyMandateDocumentHandler,
    SetMyCompanyMandateOptionsHandler,
    GetMyCompanyMandateOptionsHandler,
  ],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
