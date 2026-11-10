import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { AccountingModule } from "../accounting/accounting.module.js";
import { FeatureAccessModule } from "../feature-access/feature-access.module.js";

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
import { GetMyCompanyBilledToHandler } from "./application/queries/get-my-company-billed-to.handler.js";
import { GetMandateProofHandler } from "./application/queries/get-mandate-proof.handler.js";
import { GetMandateMintBlockersHandler } from "./application/queries/get-mandate-mint-blockers.handler.js";
import { PreviewCustomerMandateHandler } from "./application/queries/preview-customer-mandate.handler.js";
import { AttachMandateProofHandler } from "./application/commands/attach-mandate-proof.handler.js";
import { RevokeMandateHandler } from "./application/commands/revoke-mandate.handler.js";
import { GetCompanyMandateHandler } from "./application/queries/get-company-mandate.handler.js";
import { PrismaBankAccountGuardReader } from "./infrastructure/prisma-bank-account-guard.reader.js";
import { BankAccountReadingGuard } from "./domain/ports/bank-account-reading-guard.js";
import { PrismaBankAccountReadingGuard } from "./infrastructure/prisma-bank-account-reading-guard.js";
import { PrismaCompanyBankAccountRepository } from "./infrastructure/prisma-company-bank-account.repository.js";
import { MandateDebtorReader } from "./domain/ports/mandate-debtor.reader.js";
import { PrismaMandateDebtorReader } from "./infrastructure/prisma-mandate-debtor.reader.js";
import { SiteMandatesReader } from "./domain/ports/site-mandates.reader.js";
import { PrismaSiteMandatesReader } from "./infrastructure/prisma-site-mandates.reader.js";
import { SiteMandateRevoker } from "./application/site-mandate-revoker.js";
import { PrismaPaymentMandateRepository } from "./infrastructure/prisma-payment-mandate.repository.js";
import { AdminCompanyBankAccountController } from "./http/admin-company-bank-account.controller.js";
import { CompanyBankAccountController } from "./http/company-bank-account.controller.js";
import { AdminMandatesController } from "./http/admin-mandates.controller.js";
import { PaymentLinksWebhookController } from "./http/payment-links-webhook.controller.js";
import { AdminAccountingSettingsController } from "./http/admin-accounting-settings.controller.js";
import { AdminPaymentLinksController } from "./http/admin-payment-links.controller.js";
import {
  AccountingSettingsReader,
  AccountingSettingsWriter,
} from "./domain/ports/accounting-settings.store.js";
import { CheckoutGateway } from "./domain/ports/checkout-gateway.js";
import { PaymentLinkCompanyReader } from "./domain/ports/payment-link-company.reader.js";
import { PaymentLinkReader } from "./domain/ports/payment-link.reader.js";
import { PaymentLinkRepository } from "./domain/ports/payment-link.repository.js";
import { CancelPaymentLinkHandler } from "./application/commands/cancel-payment-link.handler.js";
import { CreatePaymentLinkHandler } from "./application/commands/create-payment-link.handler.js";
import { ExpirePaymentLinkHandler } from "./application/commands/expire-payment-link.handler.js";
import { SetAccountingSettingsHandler } from "./application/commands/set-accounting-settings.handler.js";
import { SettlePaymentLinkHandler } from "./application/commands/settle-payment-link.handler.js";
import { OnRefundWithoutOrder } from "./application/handlers/on-refund-without-order.handler.js";
import { OnCardCheckoutEvent } from "./application/handlers/on-card-checkout-event.handler.js";
import { RecordPaymentLinkEventHandler } from "./application/commands/record-payment-link-event.handler.js";
import { GetAccountingSettingsHandler } from "./application/queries/get-accounting-settings.handler.js";
import { ListPaymentLinksHandler } from "./application/queries/list-payment-links.handler.js";
import { PrismaAccountingSettingsStore } from "./infrastructure/prisma-accounting-settings.store.js";
import { PrismaPaymentLinkCompanyReader } from "./infrastructure/prisma-payment-link-company.reader.js";
import { PrismaPaymentLinkReader } from "./infrastructure/prisma-payment-link.reader.js";
import { PrismaPaymentLinkRepository } from "./infrastructure/prisma-payment-link.repository.js";
import { StripeCheckoutGateway } from "./infrastructure/stripe-checkout-gateway.js";

/**
 * Contexte **paiement** : le mandat de prélèvement SEPA, et les liens de
 * paiement libres.
 *
 * ⚠️ L'encaissement d'une commande par carte (`PaymentGateway`, son webhook,
 * son remboursement chez Stripe) vivait ici jusqu'au 2026-11-09 : il est au
 * bloc `card-payment` depuis le lot P0.c2 du plan M2
 * (`documentation/commandes/modification/plan-m2-historique-de-transactions.md`),
 * et `orders` l'atteint par son canal. Le mandat, lui, ne
 * passe par aucun prestataire : il est frappé et rangé ici, et traité
 * directement avec la banque (`documentation/comptabilite/prelevement/prelevement-sepa.md`).
 * Le port Stripe des mandats (`MandateGateway`) a été supprimé le 2026-09-19 :
 * aucun mandat Stripe en production (Hugo).
 *
 * ⚠️ « le mandat est un geste de back-office » était écrit ici jusqu'au
 * 2026-09-14 : le client génère et renvoie désormais le sien
 * (`CompanyMandateController`).
 *
 * Le webhook des liens (`POST /payments/links/webhook`) a son endpoint et son
 * secret à lui (§4.5) ; pendant P0, les `checkout.*` arrivent aussi par le
 * relais du webhook des cartes (`card_payment.checkout_event`), et les deux
 * projections sont idempotentes.
 */
@Module({
  // 🔴 `payments` importe `accounting`, et jamais l'inverse. Le mandat est le
  // document de l'émetteur ; ce contexte-ci y ajoute le côté client. Le sens de
  // la flèche est ce qui empêche les deux de se tenir l'un l'autre.
  // `feature-access` pour le seul drapeau `customerMandate`, lu par un
  // adaptateur : les handlers du mandat n'en voient qu'un port booléen.
  // `AccountModule` depuis N4d (2026-10-20) : l'annonce des gestes de site
  // (`SiteGesturePublisher`) — arête neuve, sans cycle (`AccountModule`
  // n'importe aucun module, vérifié le 2026-10-20).
  imports: [AccountingModule, AccountModule, FeatureAccessModule],
  controllers: [
    PaymentLinksWebhookController,
    AdminMandatesController,
    AdminCompanyBankAccountController,
    CompanyBankAccountController,
    CompanyMandateController,
    AdminPaymentLinksController,
    AdminAccountingSettingsController,
  ],
  providers: [
    { provide: PaymentMandateRepository, useClass: PrismaPaymentMandateRepository },
    { provide: MandateDebtorReader, useClass: PrismaMandateDebtorReader },
    { provide: SiteMandatesReader, useClass: PrismaSiteMandatesReader },
    SiteMandateRevoker,
    {
      provide: CompanyBankAccountRepository,
      useClass: PrismaCompanyBankAccountRepository,
    },
    { provide: BankAccountGuardReader, useClass: PrismaBankAccountGuardReader },
    { provide: BankAccountReadingGuard, useClass: PrismaBankAccountReadingGuard },
    { provide: CustomerMandateGate, useClass: FeatureAccessCustomerMandateGate },
    // Les liens de paiement libres (plan liens de paiement §2b). Le réglage du
    // plafond : une ligne, deux ports (lecture / écriture) sur le même adaptateur.
    { provide: CheckoutGateway, useClass: StripeCheckoutGateway },
    { provide: PaymentLinkRepository, useClass: PrismaPaymentLinkRepository },
    { provide: PaymentLinkReader, useClass: PrismaPaymentLinkReader },
    { provide: PaymentLinkCompanyReader, useClass: PrismaPaymentLinkCompanyReader },
    PrismaAccountingSettingsStore,
    { provide: AccountingSettingsReader, useExisting: PrismaAccountingSettingsStore },
    { provide: AccountingSettingsWriter, useExisting: PrismaAccountingSettingsStore },
    CreatePaymentLinkHandler,
    CancelPaymentLinkHandler,
    SettlePaymentLinkHandler,
    RecordPaymentLinkEventHandler,
    // Le relais des pages de lien par le webhook des cartes (plan M2, §4.5).
    OnCardCheckoutEvent,
    // Un remboursement Stripe qu'aucune commande ne porte (lot R1, A11) —
    // annoncé par `card_payment.unmatched` depuis le plan M2, P0.c2.
    OnRefundWithoutOrder,
    ExpirePaymentLinkHandler,
    ListPaymentLinksHandler,
    SetAccountingSettingsHandler,
    GetAccountingSettingsHandler,
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
    GetMyCompanyBilledToHandler,
    PreviewCustomerMandateHandler,
    MintMyCompanyMandateHandler,
    AttachMyCompanyMandateProofHandler,
    GetMyCompanyMandateHandler,
    GetMyCompanyMandateDocumentHandler,
    SetMyCompanyMandateOptionsHandler,
    GetMyCompanyMandateOptionsHandler,
  ],
  exports: [SiteMandateRevoker],
})
export class PaymentsModule {}
