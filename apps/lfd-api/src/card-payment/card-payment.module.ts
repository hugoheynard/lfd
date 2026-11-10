import { Global, Module } from "@nestjs/common";

import { BlockCardPayments } from "./application/block-card-payments.js";
import { CardAccountChoice } from "./application/card-account-choice.js";
import { IssueCardRefundHandler } from "./application/commands/issue-card-refund.handler.js";
import { RecordProviderEventHandler } from "./application/commands/record-provider-event.handler.js";
import { ReplayFirstPaymentsHandler } from "./application/commands/replay-first-payments.handler.js";
import { RetryCardRefundHandler } from "./application/commands/retry-card-refund.handler.js";
import { SettleCardRefundElsewhereHandler } from "./application/commands/settle-card-refund-elsewhere.handler.js";
import { SweepCardRefundsHandler } from "./application/commands/sweep-card-refunds.handler.js";
import { IntentOutcomeRecorder } from "./application/intent-outcome-recorder.js";
import { ProviderPaymentResolver } from "./application/provider-payment-resolver.js";
import { GetCardPublishableKeyHandler } from "./application/queries/get-card-publishable-key.handler.js";
import { BlockCardRefunds } from "./application/refunds/block-card-refunds.js";
import { CardRefundBell } from "./application/refunds/card-refund-bell.js";
import {
  BusCardRefundDispatch,
  CardRefundDispatch,
} from "./application/refunds/card-refund-dispatch.js";
import { CardRefundEffectsWriter } from "./application/refunds/card-refund-effects.js";
import { CardRefundIssuancePreparation } from "./application/refunds/card-refund-issuance-preparation.js";
import { CardRefundIssuanceRecorder } from "./application/refunds/card-refund-issuance-recorder.js";
import { CardRefundObservation } from "./application/refunds/card-refund-observation.js";
import { CardRefundOutcomes } from "./application/refunds/card-refund-outcomes.js";
import { CardRefundRetrier } from "./application/refunds/card-refund-retrier.js";
import { CardRefundScope } from "./application/refunds/card-refund-scope.js";
import { CardPayments } from "./channels/requests/card-payments.js";
import { CardRefunds } from "./channels/requests/card-refunds.js";
import { CardSettlementReader } from "./channels/requests/card-settlement.reader.js";
import { CardPaymentRepository } from "./domain/ports/card-payment.repository.js";
import { CardProviders } from "./domain/ports/card-providers.js";
import { CardRefundLedgerRepository } from "./domain/ports/card-refund-ledger.repository.js";
import { CardRefundRequestLease } from "./domain/ports/card-refund-request.lease.js";
import { CardRefundRequestRepository } from "./domain/ports/card-refund-request.repository.js";
import { CardRefundSweepReader } from "./domain/ports/card-refund-sweep.reader.js";
import { TakeoverReader } from "./domain/ports/takeover.reader.js";
import { AdminCardRefundsController } from "./http/admin-card-refunds.controller.js";
import { CardPaymentsWebhookController } from "./http/card-payments-webhook.controller.js";
import { CardRefundSweepController } from "./http/card-refund-sweep.controller.js";
import { ReplayFirstPaymentsController } from "./http/replay-first-payments.controller.js";
import { PrismaCardPaymentRepository } from "./infrastructure/prisma-card-payment.repository.js";
import { PrismaCardRefundLedgerRepository } from "./infrastructure/prisma-card-refund-ledger.repository.js";
import { PrismaCardRefundRequestLease } from "./infrastructure/prisma-card-refund-request.lease.js";
import { PrismaCardRefundRequestRepository } from "./infrastructure/prisma-card-refund-request.repository.js";
import { PrismaCardRefundSweepReader } from "./infrastructure/prisma-card-refund-sweep.reader.js";
import { PrismaCardSettlementReader } from "./infrastructure/prisma-card-settlement.reader.js";
import { PrismaTakeoverReader } from "./infrastructure/prisma-takeover.reader.js";
import { RegistryCardProviders } from "./infrastructure/registry-card-providers.js";

/**
 * **Le bloc de l'encaissement par carte** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * lots P0 et P1.b) : il encaisse et rembourse pour un sujet opaque, tient
 * l'état de l'argent carte, et seul il parle au prestataire des cartes.
 *
 * **Global**, comme `MailModule` : un bloc métier n'a le droit d'importer que
 * le canal (`card-payment/channels/`), pas ce module — la matrice du § 3 de
 * `CLAUDE.md` dit « port uniquement ».
 *
 * 🔴 **Deux jetons ne sont pas fournis ici**, et c'est voulu : la racine de
 * composition les pose, elle seule connaissant à la fois les comptes et les
 * types de sujet — `CardAccountDefaults` (la valeur `order → lfc-stripe`) et
 * `SubjectSettlements` (l'implémenteur `order` de `lafoliecoffee/orders`).
 *
 * Branché au lot P0.c2 (2026-11-09) : `appBootstrap/card-payment-feed.module.ts`
 * fournit les deux jetons et `AppModule` importe les deux modules ; le webhook
 * de `lafoliecoffee/payments` est retiré le même jour — les deux routes
 * `POST /payments/webhook` n'ont jamais coexisté.
 */
@Global()
@Module({
  controllers: [
    CardPaymentsWebhookController,
    ReplayFirstPaymentsController,
    AdminCardRefundsController,
    CardRefundSweepController,
  ],
  providers: [
    { provide: CardPaymentRepository, useClass: PrismaCardPaymentRepository },
    { provide: TakeoverReader, useClass: PrismaTakeoverReader },
    { provide: CardProviders, useClass: RegistryCardProviders },
    CardAccountChoice,
    ProviderPaymentResolver,
    IntentOutcomeRecorder,
    { provide: CardPayments, useClass: BlockCardPayments },
    { provide: CardSettlementReader, useClass: PrismaCardSettlementReader },
    // Le remboursement (lot P1.b) : la demande, le carnet, l'exécuteur, le constat.
    { provide: CardRefundRequestRepository, useClass: PrismaCardRefundRequestRepository },
    { provide: CardRefundRequestLease, useClass: PrismaCardRefundRequestLease },
    { provide: CardRefundSweepReader, useClass: PrismaCardRefundSweepReader },
    { provide: CardRefundLedgerRepository, useClass: PrismaCardRefundLedgerRepository },
    { provide: CardRefundDispatch, useClass: BusCardRefundDispatch },
    { provide: CardRefunds, useClass: BlockCardRefunds },
    CardRefundScope,
    CardRefundOutcomes,
    CardRefundBell,
    CardRefundEffectsWriter,
    CardRefundRetrier,
    CardRefundIssuancePreparation,
    CardRefundIssuanceRecorder,
    CardRefundObservation,
    RecordProviderEventHandler,
    ReplayFirstPaymentsHandler,
    GetCardPublishableKeyHandler,
    IssueCardRefundHandler,
    SweepCardRefundsHandler,
    RetryCardRefundHandler,
    SettleCardRefundElsewhereHandler,
  ],
  exports: [CardPayments, CardSettlementReader, CardRefunds, CardProviders],
})
export class CardPaymentModule {}
