import { Global, Module } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";

import { ListCompanyBasketsHandler } from "./basket/application/queries/list-company-baskets.handler.js";
import { ListMyBasketsHandler } from "./basket/application/queries/list-my-baskets.handler.js";
import { OpenBasketHandler } from "./basket/application/commands/open-basket.handler.js";
import { SetBasketStatusHandler } from "./basket/application/commands/set-basket-status.handler.js";
import { StopBasketHandler } from "./basket/application/commands/stop-basket.handler.js";
import { BasketFacts } from "./basket/application/services/basket-facts.js";
import { BasketGestures } from "./basket/application/services/basket-gestures.js";
import { AnnounceSalesTermsToBaskets } from "./basket/application/handlers/announce-sales-terms-to-baskets.handler.js";
import { BasketMailOrigins } from "./basket/domain/ports/basket-mail-origins.js";
import { BasketReader } from "./basket/domain/ports/basket.reader.js";
import { BasketRepository } from "./basket/domain/ports/basket.repository.js";
import { AdminSubscriptionsController } from "./basket/http/admin-subscriptions.controller.js";
import { SubscriptionsController } from "./basket/http/subscriptions.controller.js";
import { PrismaBasketReader } from "./basket/infrastructure/prisma-basket.reader.js";
import { PrismaBasketRepository } from "./basket/infrastructure/prisma-basket.repository.js";
import { PrismaRecurringBasketCounts } from "./basket/infrastructure/prisma-recurring-basket-counts.js";
import { PrismaRecurringSkuUsage } from "./basket/infrastructure/prisma-recurring-sku-usage.js";
import { RecurringBasketCounts } from "./channels/commerce/recurring-basket-counts.js";
import { RecurringSkuUsage } from "./channels/commerce/recurring-sku-usage.js";
import { OverrideOccurrenceHandler } from "./occurrence/application/commands/override-occurrence.handler.js";
import { SweepDueOccurrencesHandler } from "./occurrence/application/commands/sweep-due-occurrences.handler.js";
import { OccurrencePlanner } from "./occurrence/application/services/occurrence-planner.js";
import { BasketsBehindPlan } from "./occurrence/domain/ports/baskets-behind-plan.js";
import { OccurrenceRepository } from "./occurrence/domain/ports/occurrence.repository.js";
import { RecurringOccurrencesSweepController } from "./occurrence/http/recurring-occurrences-sweep.controller.js";
import { PrismaBasketsBehindPlan } from "./occurrence/infrastructure/prisma-baskets-behind-plan.js";
import { PrismaOccurrenceRepository } from "./occurrence/infrastructure/prisma-occurrence.repository.js";

/**
 * **Le bloc des paniers récurrents** : le panier, ses échéances, leur
 * balayage, dans le schéma `recurring` (plan `plan-bloc-recurrent.md`).
 *
 * Ce qu'il demande au commerce (`channels/commerce/`) est relié par
 * `appBootstrap/recurring-feed.module.ts`. **Global**, comme le panier de la
 * boutique : le commerce n'importe que le canal, jamais ce module, et y lit
 * les deux lectures que le bloc publie.
 */
@Global()
@Module({
  controllers: [
    SubscriptionsController,
    AdminSubscriptionsController,
    RecurringOccurrencesSweepController,
  ],
  providers: [
    OpenBasketHandler,
    SetBasketStatusHandler,
    StopBasketHandler,
    OverrideOccurrenceHandler,
    SweepDueOccurrencesHandler,
    ListMyBasketsHandler,
    ListCompanyBasketsHandler,
    BasketGestures,
    BasketFacts,
    OccurrencePlanner,
    // L'annonce d'une nouvelle version des CGV (§ 7, Q-B7) : l'abonné durable
    // du dépôt du PDF, et l'origine de la boutique pour son lien.
    AnnounceSalesTermsToBaskets,
    {
      provide: BasketMailOrigins,
      inject: [AppConfig],
      useFactory: (config: AppConfig): BasketMailOrigins => ({
        clientBaseUrl: () => config.clientBaseUrl(),
      }),
    },
    { provide: BasketRepository, useClass: PrismaBasketRepository },
    { provide: BasketReader, useClass: PrismaBasketReader },
    { provide: OccurrenceRepository, useClass: PrismaOccurrenceRepository },
    { provide: BasketsBehindPlan, useClass: PrismaBasketsBehindPlan },
    { provide: RecurringBasketCounts, useClass: PrismaRecurringBasketCounts },
    { provide: RecurringSkuUsage, useClass: PrismaRecurringSkuUsage },
  ],
  exports: [RecurringBasketCounts, RecurringSkuUsage],
})
export class RecurringModule {}
