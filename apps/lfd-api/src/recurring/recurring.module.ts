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
import { PlannedQuantitiesReader } from "./channels/commerce/planned-quantities.js";
import { PrismaPlannedQuantitiesReader } from "./planned/infrastructure/prisma-planned-quantities.reader.js";
import { OpenPlannedColumnHandler } from "./planned/application/commands/open-planned-column.handler.js";
import { PutPlannedColumnHandler } from "./planned/application/commands/put-planned-column.handler.js";
import { WithdrawPlannedColumnHandler } from "./planned/application/commands/withdraw-planned-column.handler.js";
import { GetPlannerHandler } from "./planned/application/queries/get-planner.handler.js";
import { ConversionSchedule } from "./planned/application/services/conversion-schedule.js";
import { SweepPlannedColumnsHandler } from "./planned/application/commands/sweep-planned-columns.handler.js";
import { RingOnPlannedColumnMissed } from "./planned/application/handlers/ring-on-planned-column-missed.handler.js";
import { RingOnPlannedColumnRefused } from "./planned/application/handlers/ring-on-planned-column-refused.handler.js";
import { PlannedColumnConversion } from "./planned/application/services/planned-column-conversion.js";
import { PlannedColumnIssueBell } from "./planned/application/services/planned-column-issue-bell.js";
import { PlannerSweepController } from "./planned/http/planner-sweep.controller.js";
import { PlannerWall } from "./planned/application/services/planner-wall.js";
import { PlannedColumnRepository } from "./planned/domain/ports/planned-column.repository.js";
import { PlannedColumnsReader } from "./planned/domain/ports/planned-columns.reader.js";
import { PlannerController } from "./planned/http/planner.controller.js";
import { PrismaPlannedColumnRepository } from "./planned/infrastructure/prisma-planned-column.repository.js";
import { PrismaPlannedColumnsReader } from "./planned/infrastructure/prisma-planned-columns.reader.js";
import { OverrideOccurrenceHandler } from "./occurrence/application/commands/override-occurrence.handler.js";
import { RestoreOccurrenceHandler } from "./occurrence/application/commands/restore-occurrence.handler.js";
import { SweepDueOccurrencesHandler } from "./occurrence/application/commands/sweep-due-occurrences.handler.js";
import { OccurrencePlanner } from "./occurrence/application/services/occurrence-planner.js";
import { BasketsBehindPlan } from "./occurrence/domain/ports/baskets-behind-plan.js";
import { OccurrenceRepository } from "./occurrence/domain/ports/occurrence.repository.js";
import { RecurringOccurrencesSweepController } from "./occurrence/http/recurring-occurrences-sweep.controller.js";
import { PrismaBasketsBehindPlan } from "./occurrence/infrastructure/prisma-baskets-behind-plan.js";
import { PrismaOccurrenceRepository } from "./occurrence/infrastructure/prisma-occurrence.repository.js";
import { OccurrenceIssueBell } from "./occurrence/application/services/occurrence-issue-bell.js";
import {
  RingOnOccurrenceMissed,
  RingOnOccurrenceRefused,
} from "./occurrence/application/handlers/ring-on-occurrence-issue.handler.js";

/**
 * **Le bloc des paniers récurrents** : le panier, ses échéances, leur
 * balayage, et le planificateur de commandes des pros (`planned/`), dans le
 * schéma `recurring` (plan `plan-bloc-recurrent.md`).
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
    PlannerController,
    PlannerSweepController,
  ],
  providers: [
    OpenBasketHandler,
    SetBasketStatusHandler,
    StopBasketHandler,
    OverrideOccurrenceHandler,
    RestoreOccurrenceHandler,
    SweepDueOccurrencesHandler,
    ListMyBasketsHandler,
    ListCompanyBasketsHandler,
    BasketGestures,
    BasketFacts,
    OccurrencePlanner,
    // L'annonce d'une nouvelle version des CGV (§ 7, Q-B7) : l'abonné durable
    // du dépôt du PDF, et l'origine de la boutique pour son lien.
    AnnounceSalesTermsToBaskets,
    OccurrenceIssueBell,
    RingOnOccurrenceRefused,
    RingOnOccurrenceMissed,
    // Le planificateur de commandes des pros (`planned/`).
    PlannerWall,
    ConversionSchedule,
    // La conversion des colonnes (L2) : le balayage, l'issue, la cloche du staff.
    SweepPlannedColumnsHandler,
    PlannedColumnConversion,
    PlannedColumnIssueBell,
    RingOnPlannedColumnRefused,
    RingOnPlannedColumnMissed,
    GetPlannerHandler,
    OpenPlannedColumnHandler,
    PutPlannedColumnHandler,
    WithdrawPlannedColumnHandler,
    { provide: PlannedColumnRepository, useClass: PrismaPlannedColumnRepository },
    { provide: PlannedColumnsReader, useClass: PrismaPlannedColumnsReader },
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
    { provide: PlannedQuantitiesReader, useClass: PrismaPlannedQuantitiesReader },
  ],
  exports: [RecurringBasketCounts, RecurringSkuUsage, PlannedQuantitiesReader],
})
export class RecurringModule {}
