import { Module } from "@nestjs/common";

import { OutboundModule } from "../../platform/outbound/outbound.module.js";
import { CreateVitrineSubscriberHandler } from "./application/commands/create-vitrine-subscriber.handler.js";
import { ResendVitrineDeliveryHandler } from "./application/commands/resend-vitrine-delivery.handler.js";
import { ResyncVitrineSubscriberHandler } from "./application/commands/resync-vitrine-subscriber.handler.js";
import { RotateVitrineCredentialsHandler } from "./application/commands/rotate-vitrine-credentials.handler.js";
import { SendVitrineTestHandler } from "./application/commands/send-vitrine-test.handler.js";
import { SetVitrineContentsHandler } from "./application/commands/set-vitrine-contents.handler.js";
import { SetVitrineSubscriberActiveHandler } from "./application/commands/set-vitrine-subscriber-active.handler.js";
import { UpdateVitrineSubscriberIdentityHandler } from "./application/commands/update-vitrine-subscriber-identity.handler.js";
import { SweepVitrineHandler } from "./application/commands/sweep-vitrine.handler.js";
import { ListVitrineDeliveriesHandler } from "./application/queries/list-vitrine-deliveries.handler.js";
import { ListVitrineSubscribersHandler } from "./application/queries/list-vitrine-subscribers.handler.js";
import { ReadVitrineArticleHandler } from "./application/queries/read-vitrine-article.handler.js";
import { ReadVitrineCatalogueHandler } from "./application/queries/read-vitrine-catalogue.handler.js";
import { ReadVitrineTextsHandler } from "./application/queries/read-vitrine-texts.handler.js";
import { VitrineCredentialsMint } from "./application/services/vitrine-credentials.js";
import { VitrineRelay } from "./application/services/vitrine-relay.js";
import { VitrineShowcaseLoader } from "./application/services/vitrine-showcase.loader.js";
import { VitrineDeliveryReader } from "./domain/ports/vitrine-delivery.reader.js";
import { VitrineDeliveryRepository } from "./domain/ports/vitrine-delivery.repository.js";
import { VitrineFingerprintStore } from "./domain/ports/vitrine-fingerprint.store.js";
import { VitrineShowcaseSource } from "./domain/ports/vitrine-showcase.source.js";
import { VitrineSubscriberReader } from "./domain/ports/vitrine-subscriber.reader.js";
import { VitrineSubscriberRepository } from "./domain/ports/vitrine-subscriber.repository.js";
import { AdminVitrineController } from "./http/admin-vitrine.controller.js";
import { VitrineSweepController } from "./http/vitrine-sweep.controller.js";
import { VitrineController } from "./http/vitrine.controller.js";
import { BusVitrineShowcaseSource } from "./infrastructure/bus-vitrine-showcase.source.js";
import { PrismaVitrineDeliveryReader } from "./infrastructure/prisma-vitrine-delivery.reader.js";
import { PrismaVitrineDeliveryRepository } from "./infrastructure/prisma-vitrine-delivery.repository.js";
import { PrismaVitrineFingerprintStore } from "./infrastructure/prisma-vitrine-fingerprint.store.js";
import { PrismaVitrineSubscriberReader } from "./infrastructure/prisma-vitrine-subscriber.reader.js";
import { PrismaVitrineSubscriberRepository } from "./infrastructure/prisma-vitrine-subscriber.repository.js";

/**
 * **Le webhook de la vitrine** (plan `documentation/webhooks/plan-webhook-vitrine.md`,
 * lot W) : les abonnés, le balayage par empreintes, le relais signé, et les
 * lectures de l'agence.
 *
 * Il lit la boutique par ses lectures NOMMÉES, sur le bus (la vue publique,
 * les textes effectifs) : aucun module du catalogue n'est importé, et rien
 * n'est exporté. Le relais sortant vient de `platform/outbound`.
 */
@Module({
  imports: [OutboundModule],
  controllers: [VitrineController, AdminVitrineController, VitrineSweepController],
  providers: [
    { provide: VitrineSubscriberRepository, useClass: PrismaVitrineSubscriberRepository },
    { provide: VitrineSubscriberReader, useClass: PrismaVitrineSubscriberReader },
    { provide: VitrineDeliveryRepository, useClass: PrismaVitrineDeliveryRepository },
    { provide: VitrineDeliveryReader, useClass: PrismaVitrineDeliveryReader },
    { provide: VitrineFingerprintStore, useClass: PrismaVitrineFingerprintStore },
    { provide: VitrineShowcaseSource, useClass: BusVitrineShowcaseSource },
    VitrineCredentialsMint,
    VitrineRelay,
    VitrineShowcaseLoader,
    CreateVitrineSubscriberHandler,
    RotateVitrineCredentialsHandler,
    SetVitrineContentsHandler,
    SetVitrineSubscriberActiveHandler,
    UpdateVitrineSubscriberIdentityHandler,
    ResyncVitrineSubscriberHandler,
    SendVitrineTestHandler,
    ResendVitrineDeliveryHandler,
    SweepVitrineHandler,
    ListVitrineSubscribersHandler,
    ListVitrineDeliveriesHandler,
    ReadVitrineCatalogueHandler,
    ReadVitrineArticleHandler,
    ReadVitrineTextsHandler,
  ],
})
export class VitrineModule {}
