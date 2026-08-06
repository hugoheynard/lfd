import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { CreateSubscriptionHandler } from "./application/commands/create-subscription.handler.js";
import { DeleteSubscriptionHandler } from "./application/commands/delete-subscription.handler.js";
import { SetSubscriptionStatusHandler } from "./application/commands/set-subscription-status.handler.js";
import { UpsertOccurrenceOverrideHandler } from "./application/commands/upsert-occurrence-override.handler.js";
import { ListSubscriptionsHandler } from "./application/queries/list-subscriptions.handler.js";
import { SubscriptionReader } from "./domain/ports/subscription.reader.js";
import { SubscriptionRepository } from "./domain/ports/subscription.repository.js";
import { PrismaSubscriptionReader } from "./infrastructure/prisma-subscription.reader.js";
import { PrismaSubscriptionRepository } from "./infrastructure/prisma-subscription.repository.js";
import { SubscriptionsController } from "./http/subscriptions.controller.js";

/**
 * Contexte **paniers récurrents** : gabarits de commande répétés, murés par le
 * seul client connecté. Les ports sont câblés sur leurs adaptateurs ici.
 */
@Module({
  imports: [CqrsModule],
  controllers: [SubscriptionsController],
  providers: [
    CreateSubscriptionHandler,
    UpsertOccurrenceOverrideHandler,
    SetSubscriptionStatusHandler,
    DeleteSubscriptionHandler,
    ListSubscriptionsHandler,
    { provide: SubscriptionRepository, useClass: PrismaSubscriptionRepository },
    { provide: SubscriptionReader, useClass: PrismaSubscriptionReader },
  ],
})
export class SubscriptionsModule {}
