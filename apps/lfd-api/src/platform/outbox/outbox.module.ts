import { Global, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { AdminOutboxController } from "./admin-outbox.controller.js";
import { DiscoveredDurableSubscribers } from "./discovered-durable-subscribers.js";
import { DurableDeliveryGuard } from "./durable-delivery-guard.js";
import { DurableSubscribers } from "./durable-handler.js";
import { DurablePublisher } from "./durable-publisher.js";
import { Outbox } from "./outbox.js";
import { OutboxDurablePublisher } from "./outbox-durable-publisher.js";
import { OutboxDeliveryRepository } from "./outbox-delivery.repository.js";
import { OutboxRelay } from "./outbox-relay.js";
import { OutboxRelayStore } from "./outbox-relay-store.js";
import { OutboxRelayTrigger } from "./outbox-relay-trigger.js";
import { OutboxSweepController } from "./outbox-sweep.controller.js";
import { PrismaOutbox } from "./prisma-outbox.js";
import { PrismaOutboxDeliveryRepository } from "./prisma-outbox-delivery.repository.js";
import { PrismaOutboxRelayStore } from "./prisma-outbox-relay-store.js";
import { ReplayOutboxDeliveryHandler } from "./replay-outbox-delivery.handler.js";
import { SweepOutboxHandler } from "./sweep-outbox.handler.js";

/**
 * La **boîte d'envoi** (plan `documentation/journalisation/plan-boite-d-envoi.md`,
 * BE1) : écrire un fait dans la transaction, le livrer au moins une fois, ne
 * l'appliquer qu'une fois. `@Global` : les émetteurs injectent `DurablePublisher` sans réimport.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  controllers: [OutboxSweepController, AdminOutboxController],
  providers: [
    DiscoveredDurableSubscribers,
    { provide: DurableSubscribers, useExisting: DiscoveredDurableSubscribers },
    { provide: Outbox, useClass: PrismaOutbox },
    { provide: DurablePublisher, useClass: OutboxDurablePublisher },
    { provide: OutboxRelayStore, useClass: PrismaOutboxRelayStore },
    { provide: OutboxDeliveryRepository, useClass: PrismaOutboxDeliveryRepository },
    DurableDeliveryGuard,
    OutboxRelay,
    { provide: OutboxRelayTrigger, useExisting: OutboxRelay },
    SweepOutboxHandler,
    ReplayOutboxDeliveryHandler,
  ],
  exports: [DurablePublisher, OutboxRelayTrigger, OutboxRelay],
})
export class OutboxModule {}
