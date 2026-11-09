import { Global, Module } from "@nestjs/common";

import { BlockCardPayments } from "./application/block-card-payments.js";
import { CardAccountChoice } from "./application/card-account-choice.js";
import { RecordProviderEventHandler } from "./application/commands/record-provider-event.handler.js";
import { ReplayFirstPaymentsHandler } from "./application/commands/replay-first-payments.handler.js";
import { IntentOutcomeRecorder } from "./application/intent-outcome-recorder.js";
import { ProviderCardRefunds } from "./application/provider-card-refunds.js";
import { ProviderPaymentResolver } from "./application/provider-payment-resolver.js";
import { GetCardPublishableKeyHandler } from "./application/queries/get-card-publishable-key.handler.js";
import { CardPayments } from "./channels/requests/card-payments.js";
import { CardProviderRefunds } from "./channels/requests/card-provider-refunds.js";
import { CardSettlementReader } from "./channels/requests/card-settlement.reader.js";
import { CardPaymentRepository } from "./domain/ports/card-payment.repository.js";
import { CardProviders } from "./domain/ports/card-providers.js";
import { TakeoverReader } from "./domain/ports/takeover.reader.js";
import { CardPaymentsWebhookController } from "./http/card-payments-webhook.controller.js";
import { ReplayFirstPaymentsController } from "./http/replay-first-payments.controller.js";
import { PrismaCardPaymentRepository } from "./infrastructure/prisma-card-payment.repository.js";
import { PrismaCardSettlementReader } from "./infrastructure/prisma-card-settlement.reader.js";
import { PrismaTakeoverReader } from "./infrastructure/prisma-takeover.reader.js";
import { RegistryCardProviders } from "./infrastructure/registry-card-providers.js";

/**
 * **Le bloc de l'encaissement par carte** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * lot P0) : il encaisse pour un sujet opaque, tient l'état de l'argent carte,
 * et seul il parle au prestataire des cartes.
 *
 * **Global**, comme `MailModule` : un bloc métier n'a le droit d'importer que
 * le canal (`card-payment/channels/`), pas ce module — la matrice du § 3 de
 * `CLAUDE.md` dit « port uniquement ».
 *
 * 🔴 **Deux jetons ne sont pas fournis ici**, et c'est voulu : la racine de
 * composition les pose, elle seule connaissant à la fois les comptes et les
 * types de sujet — `CardAccountDefaults` (la valeur `order → lfc-stripe`) et
 * `SubjectSettlements` (l'implémenteur `order` de `b2b/orders`).
 *
 * ⚠️ **Débranché au lot P0.c1** (2026-11-09) : `AppModule` ne l'importe pas
 * encore. Le lot c2 relie les deux jetons, l'importe, et retire le webhook de
 * `b2b/payments` — les deux routes `POST /payments/webhook` ne coexistent
 * jamais.
 */
@Global()
@Module({
  controllers: [CardPaymentsWebhookController, ReplayFirstPaymentsController],
  providers: [
    { provide: CardPaymentRepository, useClass: PrismaCardPaymentRepository },
    { provide: TakeoverReader, useClass: PrismaTakeoverReader },
    { provide: CardProviders, useClass: RegistryCardProviders },
    CardAccountChoice,
    ProviderPaymentResolver,
    IntentOutcomeRecorder,
    { provide: CardPayments, useClass: BlockCardPayments },
    { provide: CardSettlementReader, useClass: PrismaCardSettlementReader },
    { provide: CardProviderRefunds, useClass: ProviderCardRefunds },
    RecordProviderEventHandler,
    ReplayFirstPaymentsHandler,
    GetCardPublishableKeyHandler,
  ],
  exports: [CardPayments, CardSettlementReader, CardProviderRefunds, CardProviders],
})
export class CardPaymentModule {}
